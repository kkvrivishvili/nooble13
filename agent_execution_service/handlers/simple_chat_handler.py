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

            log_context = {
                "tenant_id": str(tenant_id),
                "session_id": str(session_id),
                "agent_id": str(agent_id),
                "task_id": str(task_id)
            }

            self.logger.info(
                f"[SimpleChatHandler] BEGIN handle_simple_chat (messages={len(chat_request.messages)})",
                extra=log_context
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
            log_context = {
                "tenant_id": str(tenant_id),
                "session_id": str(session_id),
                "agent_id": str(agent_id),
                "task_id": str(task_id)
            }

            self.logger.info(
                f"[SimpleChatHandler] STEP 1: Getting conversation (messages_count={len(chat_request.messages)})",
                extra=log_context
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

            self.logger.info(
                f"[SimpleChatHandler] STEP 2: History integrated (total_messages={len(integrated_messages)})",
                extra={**log_context, "conversation_id": str(history.conversation_id)}
            )
            
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
            
            self.logger.info(
                f"[SimpleChatHandler] STEP 3: Calling QueryService (agent={agent_id})",
                extra=log_context
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
            m_content = query_response.get("message", {}).get("content") if isinstance(query_response.get("message"), dict) else query_response.get("response", "")
            
            self.logger.info(
                f"[SimpleChatHandler] STEP 4: QueryService response received (len={len(m_content)})",
                extra={
                    **log_context,
                    "usage": query_response.get("usage"),
                    "sources_count": len(query_response.get("sources", [])),
                    "execution_time_ms": query_response.get("execution_time_ms")
                }
            )
            
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
                f"[SimpleChatHandler] END handle_simple_chat - SUCCESS",
                extra=log_context
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