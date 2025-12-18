"""
Handler para procesar callbacks de otros servicios.
Principalmente recibe respuestas del execution service.
"""
import logging
import asyncio
from typing import Dict, Any

from common.handlers.base_handler import BaseHandler
from common.models.actions import DomainAction
from common.models.chat_models import ChatResponse

from ..websocket.orchestrator_websocket_manager import OrchestratorWebSocketManager
from .session_handler import SessionHandler
from ..config.settings import OrchestratorSettings

logger = logging.getLogger(__name__)


class CallbackHandler(BaseHandler):
    """
    Handler para procesar callbacks de servicios externos.
    Recibe respuestas asíncronas y las enruta via WebSocket.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        websocket_manager: OrchestratorWebSocketManager,
        session_handler: SessionHandler,
        direct_redis_conn=None
    ):
        super().__init__(app_settings, direct_redis_conn)
        self.websocket_manager = websocket_manager
        self.session_handler = session_handler
    
    async def handle_execution_callback(self, action: DomainAction) -> Dict[str, Any]:
        """
        Procesa callbacks del execution service.
        
        Args:
            action: DomainAction con la respuesta
            
        Returns:
            Dict con el resultado del procesamiento
        """
        try:
            self._logger.debug(
                f"Procesando callback: {action.action_type}",
                extra={
                    "action_id": str(action.action_id),
                    "task_id": str(action.task_id),
                    "session_id": str(action.session_id)
                }
            )
            
            # Procesar según tipo de callback
            if action.action_type == "orchestrator.chat.response":
                return await self._handle_chat_response(action)
                
            elif action.action_type == "orchestrator.chat.error":
                return await self._handle_chat_error(action)
                
            elif action.action_type == "orchestrator.chat.streaming":
                return await self._handle_chat_streaming(action)
                
            else:
                self._logger.warning(f"Tipo de callback no reconocido: {action.action_type}")
                return {"status": "unknown_callback_type"}
                
        except Exception as e:
            self._logger.error(
                f"Error procesando callback: {e}",
                extra={
                    "action_type": action.action_type,
                    "action_id": str(action.action_id),
                    "error": str(e)
                }
            )
            return {"status": "error", "error": str(e)}
    
    async def _handle_chat_response(self, action: DomainAction) -> Dict[str, Any]:
        """Procesa respuesta de chat completada."""
        try:
            # Validar y parsear respuesta
            chat_response = ChatResponse.model_validate(action.data)
            
            # Si está habilitado el pseudo-streaming, enviar la respuesta como chunks antes del final
            if getattr(self.app_settings, "pseudo_streaming_enabled", False):
                content = chat_response.message.content or ""
                # Umbral simple: si es muy corto, evitar streaming innecesario
                chunk_size = max(8, int(getattr(self.app_settings, "pseudo_stream_chunk_size", 48)))
                delay_ms = max(0, int(getattr(self.app_settings, "pseudo_stream_chunk_delay_ms", 30)))

                if len(content) > chunk_size * 2:
                    chunk_index = 0
                    # Partición básica por caracteres, intentando no cortar palabras cuando es posible
                    i = 0
                    while i < len(content):
                        j = min(i + chunk_size, len(content))
                        # intentar expandir hasta el próximo espacio si no excede mucho
                        if j < len(content) and content[j-1] != ' ':
                            k = content.rfind(' ', i, j)
                            if k != -1 and (k - i) >= int(chunk_size * 0.6):
                                j = k + 1
                        chunk = content[i:j]
                        i = j
                        # último chunk?
                        is_final = i >= len(content)
                        await self.websocket_manager.send_streaming_chunk(
                            session_id=action.session_id,
                            task_id=action.task_id,
                            content=chunk,
                            is_final=is_final,
                            chunk_index=chunk_index,
                        )
                        chunk_index += 1
                        if not is_final and delay_ms:
                            await asyncio.sleep(delay_ms / 1000.0)

            # Enviar respuesta final via WebSocket
            success = await self.websocket_manager.send_chat_response(
                session_id=action.session_id,
                task_id=action.task_id,
                chat_response=chat_response
            )
            
            if success:
                # Marcar tarea como completada
                await self.session_handler.complete_task(
                    session_id=action.session_id,
                    task_id=action.task_id
                )
                
                self._logger.info(
                    "Respuesta de chat entregada",
                    extra={
                        "session_id": str(action.session_id),
                        "task_id": str(action.task_id),
                        "conversation_id": chat_response.conversation_id
                    }
                )
                
                return {"status": "delivered"}
            else:
                return {"status": "no_connection"}
                
        except Exception as e:
            self._logger.error(f"Error manejando respuesta de chat: {e}")
            return {"status": "error", "error": str(e)}
    
    async def _handle_chat_error(self, action: DomainAction) -> Dict[str, Any]:
        """Procesa error de chat."""
        try:
            error_data = action.data
            
            # Enviar error via WebSocket
            await self.websocket_manager.send_error_to_session(
                session_id=action.session_id,
                error_type=error_data.get("error_type", "execution_error"),
                message=error_data.get("message", "Error desconocido"),
                task_id=action.task_id,
                details=error_data.get("details")
            )
            
            # Marcar tarea como fallida
            await self.session_handler.fail_task(
                session_id=action.session_id,
                task_id=action.task_id,
                error=error_data.get("message")
            )
            
            return {"status": "error_delivered"}
            
        except Exception as e:
            self._logger.error(f"Error manejando error de chat: {e}")
            return {"status": "error", "error": str(e)}
    
    async def _handle_chat_streaming(self, action: DomainAction) -> Dict[str, Any]:
        """Procesa chunk de streaming."""
        try:
            streaming_data = action.data
            
            # Enviar chunk via WebSocket
            await self.websocket_manager.send_streaming_chunk(
                session_id=action.session_id,
                task_id=action.task_id,
                content=streaming_data.get("content", ""),
                is_final=streaming_data.get("is_final", False),
                chunk_index=streaming_data.get("chunk_index", 0)
            )
            
            return {"status": "chunk_delivered"}
            
        except Exception as e:
            self._logger.error(f"Error manejando streaming: {e}")
            return {"status": "error", "error": str(e)}