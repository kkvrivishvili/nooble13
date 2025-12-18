"""
Handler para procesamiento simple de chat usando QueryService.

Maneja conversaciones simples sin herramientas ni ReAct loops.
Delega la gestión de conversaciones al ConversationHelper.
"""
import logging
import uuid
from typing import Dict, Any

from common.models.chat_models import ChatRequest, ChatResponse, ChatMessage, ConversationHistory, TokenUsage
from common.clients.redis.cache_manager import CacheManager
from agent_execution_service.handlers.conversation_handler import ConversationHelper
from agent_execution_service.clients.query_client import QueryClient
from agent_execution_service.clients.conversation_client import ConversationClient


logger = logging.getLogger(__name__)


class SimpleChatHandler:
    """
    Handler para procesamiento simple de chat.
    
    Maneja conversaciones directas con el LLM sin herramientas,
    usando ConversationHelper para gestión de historial.
    """
    
    def __init__(
        self,
        query_client: QueryClient,
        conversation_client: ConversationClient,
        redis_conn,
        settings
    ):
        """
        Inicializa SimpleChatHandler.
        
        Args:
            query_client: Cliente para consultas al LLM
            conversation_client: Cliente para persistencia de conversaciones
            redis_conn: Conexión directa a Redis
            settings: Configuración del servicio
        """
        self.query_client = query_client
        self.conversation_client = conversation_client
        
        # Initialize logger
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # Initialize cache manager with proper typing
        self.cache_manager = CacheManager[ConversationHistory](
            redis_conn=redis_conn,
            state_model=ConversationHistory,
            app_settings=settings
        )
        
        # Initialize conversation helper
        self.conversation_helper = ConversationHelper(
            cache_manager=self.cache_manager,
            conversation_client=self.conversation_client
        )
        
    async def handle_simple_chat(
        self,
        payload: Dict[str, Any],
        execution_config,
        query_config,
        rag_config,
        tenant_id: uuid.UUID,
        session_id: uuid.UUID,
        task_id: uuid.UUID,
        agent_id: uuid.UUID,
        
    ) -> ChatResponse:
        """
        Maneja una conversación simple sin herramientas.
        
        Args:
            payload: Datos de la solicitud de chat
            execution_config: Configuración de ejecución
            query_config: Configuración de consulta (opcional)
            rag_config: Configuración RAG (opcional)
            
        Returns:
            ChatResponse: Respuesta del chat
        """
        try:
            # Validar y parsear el payload (solo datos de chat)
            chat_request = ChatRequest(**payload)

            # Logs estructurados del request (sin contenido de mensajes)
            self.logger.info(
                "Processing simple chat",
                extra={
                    "tenant_id": str(tenant_id),
                    "session_id": str(session_id),
                    "agent_id": str(agent_id),
                    "task_id": str(task_id),
                    "messages_count": len(chat_request.messages),
                    "has_tools": bool(chat_request.tools),
                    "has_tool_choice": bool(chat_request.tool_choice is not None)
                }
            )
            
            # Procesar el chat con IDs de contexto explícitos
            return await self._process_chat(
                chat_request,
                execution_config,
                tenant_id,
                session_id,
                task_id,
                agent_id,
                query_config,
                rag_config,
            )
            
        except Exception as e:
            self.logger.error(f"Error in handle_simple_chat: {str(e)}")
            raise

    async def _process_chat(
        self,
        chat_request: ChatRequest,
        execution_config,
        tenant_id: uuid.UUID,
        session_id: uuid.UUID,
        task_id: uuid.UUID,
        agent_id: uuid.UUID,
        query_config=None,
        rag_config=None,
    ) -> ChatResponse:
        """
        Procesa una solicitud de chat simple.
        
        Args:
            chat_request: Solicitud de chat con mensajes y metadatos
            
        Returns:
            Respuesta del chat con el mensaje generado
        """
        try:
            self.logger.info(
                "Iniciando procesamiento de chat simple",
                extra={
                    "tenant_id": str(tenant_id),
                    "session_id": str(session_id),
                    "agent_id": str(agent_id),
                    "task_id": str(task_id),
                    "messages_count": len(chat_request.messages)
                }
            )
            
            # 1. Obtener o crear conversación
            history = await self.conversation_helper.get_or_create_conversation(
                tenant_id=tenant_id,
                session_id=session_id,
                agent_id=agent_id
            )
            
            # 2. Separar mensajes por tipo
            system_messages = [msg for msg in chat_request.messages if msg.role == "system"]
            user_messages = [msg for msg in chat_request.messages if msg.role == "user"]
            
            # 3. Integrar historial con mensajes nuevos
            integrated_messages = self.conversation_helper.integrate_history_with_messages(
                history=history,
                system_messages=system_messages,
                user_messages=user_messages
            )

            # Log detalle de mensajes integrados (roles y snippet del último user)
            try:
                roles_seq = [m.role for m in integrated_messages]
                last_user = next((m.content for m in reversed(integrated_messages) if m.role == "user" and m.content), None)
                self.logger.debug(
                    "Mensajes integrados listos para Query Service",
                    extra={
                        "conversation_id": str(history.conversation_id),
                        "roles": roles_seq,
                        "last_user_snippet": (last_user[:120] + "...") if last_user and len(last_user) > 120 else last_user,
                        "total_messages": len(integrated_messages)
                    }
                )
            except Exception:
                # Logging defensivo para no romper el flujo por errores de log
                pass
            
            # 4. Preparar payload para query service (solo campos válidos para ChatRequest)
            payload = {
                "messages": [msg.dict() for msg in integrated_messages]
            }
            if chat_request.tools is not None:
                payload["tools"] = chat_request.tools
            if chat_request.tool_choice is not None:
                payload["tool_choice"] = chat_request.tool_choice
            if chat_request.metadata:
                payload["metadata"] = chat_request.metadata
            # Opcionalmente incluimos conversation_id para tracking
            payload["conversation_id"] = str(history.conversation_id)
            
            self.logger.debug(
                "Payload preparado para query service",
                extra={
                    "agent_id": str(agent_id),
                    "total_messages": len(integrated_messages),
                    "task_id": str(task_id)
                }
            )
            
            # 5. Enviar consulta al LLM
            query_response = await self.query_client.query_simple(
                payload=payload,
                query_config=query_config,
                rag_config=rag_config,
                tenant_id=tenant_id,
                session_id=session_id,
                task_id=task_id,
                agent_id=agent_id
            )

            # Resumen de respuesta del Query Service
            try:
                msg_content = (
                    query_response.get("message", {}).get("content")
                    if isinstance(query_response.get("message"), dict)
                    else None
                )
                fallback_resp = query_response.get("response")
                content_len = len(msg_content or fallback_resp or "")
                self.logger.info(
                    "Respuesta recibida de Query Service",
                    extra={
                        "has_message": isinstance(query_response.get("message"), dict),
                        "has_legacy_response": fallback_resp is not None,
                        "content_length": content_len,
                        "usage": query_response.get("usage"),
                        "sources_count": len(query_response.get("sources", [])),
                        "execution_time_ms": query_response.get("execution_time_ms"),
                        "conversation_id": str(history.conversation_id),
                        "task_id": str(task_id)
                    }
                )
            except Exception:
                pass
            
            # 6. Crear respuesta completa
            response_message = ChatMessage(
                role="assistant",
                content=(
                    query_response.get("message", {}).get("content", 
                    query_response.get("response", ""))
                )
            )
            
            chat_response = ChatResponse(
                message=response_message,
                usage=TokenUsage(
                    prompt_tokens=query_response.get("usage", {}).get("prompt_tokens", 0),
                    completion_tokens=query_response.get("usage", {}).get("completion_tokens", 0),
                    total_tokens=query_response.get("usage", {}).get("total_tokens", 0)
                ),
                conversation_id=history.conversation_id,
                execution_time_ms=query_response.get("execution_time_ms", 0),
                sources=query_response.get("sources", []),
                metadata={
                    "mode": "simple",
                    "total_messages": len(integrated_messages),
                    **chat_request.metadata
                }
            )
            
            # 7. Extraer último mensaje de usuario para guardar
            last_user_message = user_messages[-1] if user_messages else ChatMessage(
                role="user", 
                content="[Sin mensaje de usuario]"
            )
            
            # 8. Guardar intercambio completo
            await self.conversation_helper.save_conversation_exchange(
                tenant_id=tenant_id,
                session_id=session_id,
                agent_id=agent_id,
                history=history,
                user_message=last_user_message,
                assistant_message=response_message,
                task_id=task_id,
                ttl=execution_config.history_ttl,
                metadata={
                    "mode": "simple",
                    "query_service_response": query_response
                }
            )
            
            self.logger.info(
                "Chat simple procesado exitosamente",
                extra={
                    "conversation_id": history.conversation_id,
                    "task_id": str(task_id),
                    "response_length": len(response_message.content)
                }
            )
            
            return chat_response
            
        except Exception as e:
            self.logger.error(
                "Error procesando chat simple",
                extra={
                    "tenant_id": str(tenant_id),
                    "session_id": str(session_id),
                    "agent_id": str(agent_id),
                    "task_id": str(task_id),
                    "error": str(e)
                }
            )
            raise