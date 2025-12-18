"""
Handler para procesamiento de mensajes de chat.
"""
import logging
import uuid
from typing import Optional, Dict, Any

from common.handlers.base_handler import BaseHandler
from common.models.chat_models import ChatRequest, ChatMessage, ConversationHistory

from ..clients.execution_client import ExecutionClient
from ..websocket.orchestrator_websocket_manager import OrchestratorWebSocketManager
from .config_handler import ConfigHandler
from .session_handler import SessionHandler
from ..config.settings import OrchestratorSettings

logger = logging.getLogger(__name__)


class ChatHandler(BaseHandler):
    """Handler para procesar mensajes de chat desde WebSocket."""
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        execution_client: ExecutionClient,
        config_handler: ConfigHandler,
        session_handler: SessionHandler,
        websocket_manager: OrchestratorWebSocketManager,
        direct_redis_conn=None
    ):
        super().__init__(app_settings, direct_redis_conn)
        self.execution_client = execution_client
        self.config_handler = config_handler
        self.session_handler = session_handler
        self.websocket_manager = websocket_manager
    
    async def process_chat_message(
        self,
        session_state: ConversationHistory,
        message_request: ChatRequest,
        connection_id: str
    ) -> None:
        """Procesa un mensaje de chat recibido por WebSocket."""
        task_id = None
        
        try:
            # 1. Generar siempre un task_id propio del Orchestrator por solicitud
            task_id = await self.session_handler.create_task_id(session_state.session_id)
            
            self._logger.info(
                "Procesando mensaje de chat público",
                extra={
                    "session_id": str(session_state.session_id),
                    "task_id": str(task_id),
                    "agent_id": str(session_state.agent_id),
                    "agent_owner": str(session_state.tenant_id),  # Owner del agente
                    "connection_id": connection_id
                }
            )
            
            # 2. Obtener configuraciones (usa tenant_id del owner internamente)
            configs = await self.config_handler.get_agent_configs(
                tenant_id=session_state.tenant_id,  # Owner del agente
                agent_id=session_state.agent_id,
                session_id=session_state.session_id,
                task_id=task_id
            )
            execution_config, query_config, rag_config = configs
            
            # 3. Extraer datos del ChatRequest
            messages = [msg.dict() for msg in message_request.messages]
            
            # 4. Determinar modo
            mode = "advance" if message_request.tools else "simple"

            # 4.1 Log de resumen del payload que se enviará a execution
            try:
                self._logger.debug(
                    "[Orchestrator.ChatHandler] Payload summary to execution",
                    extra={
                        "task_id": str(task_id),
                        "session_id": str(session_state.session_id),
                        "agent_id": str(session_state.agent_id),
                        "tenant_id": str(session_state.tenant_id),
                        "mode": mode,
                        "messages_count": len(messages),
                        "has_tools": bool(message_request.tools),
                        "has_tool_choice": bool(message_request.tool_choice is not None),
                        "conversation_id": str(message_request.conversation_id) if message_request.conversation_id else None,
                        "metadata_keys": list(message_request.metadata.keys()) if message_request.metadata else []
                    }
                )
            except Exception:
                pass
            
            # 5. Notificar inicio
            await self.websocket_manager.send_to_session(
                session_id=session_state.session_id,
                message_type="chat_processing",
                data={
                    "task_id": str(task_id),
                    "status": "processing",
                    "mode": mode
                },
                task_id=task_id
            )
            
            # 6. Enviar a execution service con estructura correcta
            await self.execution_client.execute_chat(
                # IDs del contexto
                tenant_id=session_state.tenant_id,  # Owner del agente
                session_id=session_state.session_id,
                task_id=task_id,
                agent_id=session_state.agent_id,
                user_id=None,  # Chat público
                # Datos del chat
                messages=messages,
                tools=message_request.tools,
                tool_choice=message_request.tool_choice,
                conversation_id=message_request.conversation_id,
                metadata=message_request.metadata,
                # Configuraciones
                execution_config=execution_config,
                query_config=query_config,
                rag_config=rag_config,
                mode=mode
            )
            
            self._logger.info(
                "Mensaje enviado a execution service",
                extra={
                    "task_id": str(task_id),
                    "mode": mode,
                    "agent_owner": str(session_state.tenant_id)
                }
            )
            
        except Exception as e:
            self._logger.error(
                f"Error procesando mensaje de chat: {e}",
                extra={
                    "session_id": str(session_state.session_id),
                    "task_id": str(task_id) if task_id else "unknown",
                    "error": str(e)
                }
            )
            
            await self.websocket_manager.send_error_to_session(
                session_id=session_state.session_id,
                error_type="chat_processing_error",
                message=str(e),
                task_id=task_id
            )