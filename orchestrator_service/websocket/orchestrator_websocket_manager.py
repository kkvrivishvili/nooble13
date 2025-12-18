"""
WebSocket Manager específico para Orchestrator Service.
Gestiona conexiones de chat público.
"""
import json
import logging
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from common.websocket.base_websocket_manager import BaseWebSocketManager
from common.websocket.models import WebSocketMessage, ConnectionInfo
from common.models.chat_models import ChatResponse, OrchestratorMessageType, ChatRequest

from ..models import OrchestratorSession
from ..config.settings import OrchestratorSettings

logger = logging.getLogger(__name__)


class OrchestratorWebSocketManager(BaseWebSocketManager):
    """
    WebSocket Manager para Orchestrator Service.
    Gestiona conexiones de chat público.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        direct_redis_conn,
        orchestration_service
    ):
        super().__init__(
            namespace="orchestrator",
            logger=logging.getLogger("orchestrator.websocket")
        )
        
        self.settings = app_settings
        self.direct_redis_conn = direct_redis_conn
        self.orchestration_service = orchestration_service
        
        # Mapeo de session_id a connection_id
        self._session_connections: Dict[uuid.UUID, str] = {}
    
    async def connect_chat(
        self,
        websocket: WebSocket,
        session_id: uuid.UUID
    ) -> str:
        """
        Conecta un WebSocket para chat público.
        """
        try:
            # Obtener sesión
            session = await self.orchestration_service.get_session(session_id)
            if not session:
                await websocket.close(code=4004, reason="Session not found")
                raise ValueError(f"Sesión no encontrada: {session_id}")
            
            # Crear conexión usando el método base correcto
            connection_id = await self.connect(
                websocket=websocket,
                connection_type="chat",
                session_id=session_id,
                tenant_id=session.tenant_id,
                agent_id=session.agent_id
            )
            
            # Registrar mapeo
            self._session_connections[session_id] = connection_id
            
            # Registrar en sesión
            await self.orchestration_service.session_handler.register_connection(
                session_id=session_id,
                connection_id=connection_id
            )
            
            self.logger.info(
                f"Chat WebSocket conectado",
                extra={
                    "connection_id": connection_id,
                    "session_id": str(session_id),
                    "agent_id": str(session.agent_id)
                }
            )
            
            return connection_id
            
        except Exception as e:
            self.logger.error(f"Error conectando chat WebSocket: {e}")
            raise
    
    async def disconnect(self, connection_id: str) -> None:
        """Desconecta un WebSocket y limpia recursos."""
        try:
            # Buscar sesión asociada
            session_id = None
            for sid, cid in self._session_connections.items():
                if cid == connection_id:
                    session_id = sid
                    break
            
            # Desregistrar de sesión
            if session_id:
                await self.orchestration_service.session_handler.unregister_connection(
                    session_id=session_id,
                    connection_id=connection_id
                )
                self._session_connections.pop(session_id, None)
            
            # Desconectar en base manager
            await super().disconnect(connection_id)
            
        except Exception as e:
            self.logger.error(f"Error desconectando WebSocket: {e}")
    
    async def send_to_session(
        self,
        session_id: uuid.UUID,
        message_type: str,
        data: Dict[str, Any],
        task_id: Optional[uuid.UUID] = None
    ) -> bool:
        """
        Envía un mensaje a una sesión específica.
        
        Args:
            session_id: ID de la sesión
            message_type: Tipo de mensaje
            data: Datos del mensaje
            task_id: ID de la tarea (opcional)
            
        Returns:
            True si se envió exitosamente
        """
        connection_id = self._session_connections.get(session_id)
        if not connection_id:
            self.logger.warning(f"No hay conexión para sesión: {session_id}")
            return False
        
        message = WebSocketMessage(
            message_type=message_type,
            session_id=session_id,
            task_id=task_id,
            data=data,
            timestamp=datetime.now(timezone.utc)
        )
        
        return await self.send_message(connection_id, message)
    
    async def send_chat_response(
        self,
        session_id: uuid.UUID,
        task_id: uuid.UUID,
        chat_response: ChatResponse
    ) -> bool:
        """Envía una respuesta de chat completa."""
        return await self.send_to_session(
            session_id=session_id,
            message_type=OrchestratorMessageType.CHAT_RESPONSE.value,
            data=chat_response.model_dump(),
            task_id=task_id
        )
    
    async def send_error_to_session(
        self,
        session_id: uuid.UUID,
        error_type: str,
        message: str,
        task_id: Optional[uuid.UUID] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """Envía un error a una sesión."""
        await self.send_to_session(
            session_id=session_id,
            message_type=OrchestratorMessageType.CHAT_ERROR.value,
            data={
                "error": {
                    "error_type": error_type,
                    "message": message,
                    "details": details or {}
                }
            },
            task_id=task_id
        )
    
    async def send_streaming_chunk(
        self,
        session_id: uuid.UUID,
        task_id: uuid.UUID,
        content: str,
        is_final: bool = False,
        chunk_index: int = 0
    ) -> None:
        """Envía un chunk de streaming."""
        await self.send_to_session(
            session_id=session_id,
            message_type=OrchestratorMessageType.CHAT_STREAMING.value,
            data={
                "content": content,
                "is_final": is_final,
                "chunk_index": chunk_index
            },
            task_id=task_id
        )
    
    async def handle_websocket(
        self,
        websocket: WebSocket,
        session_id: uuid.UUID
    ) -> None:
        """
        Handler principal para conexiones WebSocket de chat.
        
        Args:
            websocket: WebSocket de FastAPI
            session_id: ID de la sesión
        """
        connection_id = None
        
        try:
            # Conectar
            connection_id = await self.connect_chat(websocket, session_id)
            
            # Loop de mensajes
            while True:
                try:
                    # Recibir mensaje
                    data = await websocket.receive_text()
                    
                    # Parsear mensaje
                    try:
                        message_data = json.loads(data)
                        message = WebSocketMessage(**message_data)
                    except Exception as e:
                        await self.send_error(
                            connection_id,
                            "validation_error",
                            f"Formato de mensaje inválido: {str(e)}"
                        )
                        continue
                    
                    # Procesar según tipo
                    await self._process_message(connection_id, session_id, message)
                    
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    self.logger.error(f"Error procesando mensaje: {e}")
                    await self.send_error(
                        connection_id,
                        "processing_error",
                        "Error procesando mensaje"
                    )
        
        except Exception as e:
            self.logger.error(f"Error en WebSocket handler: {e}")
        
        finally:
            if connection_id:
                await self.disconnect(connection_id)
    
    async def _process_message(
        self,
        connection_id: str,
        session_id: uuid.UUID,
        message: WebSocketMessage
    ) -> None:
        """Procesa un mensaje recibido."""
        if message.message_type == OrchestratorMessageType.CHAT_MESSAGE.value:
            # Delegar al chat handler
            session = await self.orchestration_service.get_session(session_id)
            if session and self.orchestration_service.chat_handler:
                # Asegurar que el payload sea un ChatRequest válido
                try:
                    chat_request = (
                        ChatRequest(**message.data)
                        if isinstance(message.data, dict)
                        else message.data
                    )
                except Exception as e:
                    await self.send_error(
                        connection_id,
                        "validation_error",
                        f"Invalid chat request: {str(e)}"
                    )
                    return

                await self.orchestration_service.chat_handler.process_chat_message(
                    session_state=session,
                    message_request=chat_request,
                    connection_id=connection_id
                )
        
        elif message.message_type == "ping":
            # Responder pong
            await self.send_message(
                connection_id,
                WebSocketMessage(
                    message_type="pong",
                    data={"timestamp": message.data.get("timestamp")}
                )
            )
        
        else:
            await self.send_error(
                connection_id,
                "unknown_message_type",
                f"Tipo de mensaje desconocido: {message.message_type}"
            )
    
    async def shutdown(self):
        """Cierra el manager y todas las conexiones."""
        # Cerrar todas las conexiones
        for connection_id in list(self._connections.keys()):
            await self.disconnect(connection_id)
        
        self.logger.info("WebSocket Manager cerrado")