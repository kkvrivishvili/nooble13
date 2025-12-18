import logging
import time
from typing import Dict, Any, Optional
import uuid

from common.models.actions import DomainAction
from conversation_service.services.conversation_service import ConversationService

logger = logging.getLogger(__name__)


class ConversationHandler:
    """Handler principal para acciones de conversación con Supabase."""
    
    def __init__(self, conversation_service: ConversationService):
        self.conversation_service = conversation_service
        self._logger = logging.getLogger(f"{__name__}.ConversationHandler")
    
    async def handle_save_message(self, action: DomainAction, context: Optional[Any] = None) -> Dict[str, Any]:
        """
        Maneja guardado de mensajes con Supabase.
        """
        start_time = time.time()
        
        try:
            # IDs del header del DomainAction
            tenant_id = str(action.tenant_id)
            session_id = str(action.session_id)
            agent_id = str(action.agent_id) if action.agent_id else None
            user_id = str(action.user_id) if action.user_id else None
            
            # Contenido del payload
            conversation_id = action.data.get("conversation_id")
            message_id = action.data.get("message_id")
            user_message = action.data.get("user_message")
            agent_message = action.data.get("agent_message")
            metadata = action.data.get("metadata", {})
            
            # Extraer configuración del contexto si está disponible
            model_name = "llama-3.3-70b-versatile"  # Default
            tenant_tier = "free"  # Default
            
            if hasattr(action, 'query_config') and action.query_config:
                model_name = action.query_config.model.value
            
            if hasattr(action, 'execution_config') and action.execution_config:
                # Usar información del execution_config si está disponible
                pass
            
            # Guardar mensaje del usuario
            result = await self.conversation_service.save_message(
                tenant_id=tenant_id,
                session_id=session_id,
                role="user",
                content=user_message,
                agent_id=agent_id,
                model_name=model_name,
                user_id=user_id,
                metadata=metadata,
                tenant_tier=tenant_tier
            )
            
            # Guardar respuesta del agente si existe
            if agent_message and result["success"]:
                agent_result = await self.conversation_service.save_message(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    role="assistant",
                    content=agent_message,
                    agent_id=agent_id,
                    model_name=model_name,
                    user_id=user_id,
                    tokens_estimate=metadata.get("token_usage", {}).get("completion_tokens"),
                    metadata=metadata,
                    tenant_tier=tenant_tier
                )
                
                # Combinar resultados
                result["agent_message_id"] = agent_result.get("message_id")
            
            result["execution_time"] = time.time() - start_time
            return result
            
        except Exception as e:
            self._logger.error(f"Error en handle_save_message: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "execution_time": time.time() - start_time
            }
    
    async def handle_get_context(self, action: DomainAction, context: Optional[Any] = None) -> Dict[str, Any]:
        """
        Obtiene contexto optimizado para Query Service.
        """
        start_time = time.time()
        
        try:
            tenant_id = str(action.tenant_id)
            session_id = str(action.session_id)
            
            # Configuración del modelo
            model_name = "llama-3.3-70b-versatile"
            if hasattr(action, 'query_config') and action.query_config:
                model_name = action.query_config.model.value
            
            # Tier del tenant
            tenant_tier = "free"
            # TODO: Obtener tier real desde Supabase o configuración
            
            conversation_context = await self.conversation_service.get_context_for_query(
                tenant_id=tenant_id,
                session_id=session_id,
                model_name=model_name,
                tenant_tier=tenant_tier
            )
            
            return {
                "success": True,
                "context": conversation_context.dict(),
                "execution_time": time.time() - start_time
            }
            
        except Exception as e:
            self._logger.error(f"Error en handle_get_context: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "execution_time": time.time() - start_time
            }
    
    async def handle_session_closed(self, action: DomainAction, context: Optional[Any] = None) -> Dict[str, Any]:
        """
        Maneja cierre de sesión.
        """
        start_time = time.time()
        
        try:
            session_id = str(action.session_id)
            tenant_id = str(action.tenant_id)
            
            closed = await self.conversation_service.mark_session_closed(
                session_id=session_id,
                tenant_id=tenant_id
            )
            
            return {
                "success": closed,
                "message": "Sesión cerrada correctamente" if closed else "Sesión no encontrada",
                "execution_time": time.time() - start_time
            }
            
        except Exception as e:
            self._logger.error(f"Error en handle_session_closed: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "execution_time": time.time() - start_time
            }
            
    async def handle_get_history(self, action: DomainAction, context: Optional[Any] = None) -> Dict[str, Any]:
        """
        Obtiene historial de conversación desde Supabase.
        """
        start_time = time.time()
        
        try:
            tenant_id = str(action.tenant_id)
            session_id = str(action.session_id)
            
            # Parámetros del payload
            limit = action.data.get("limit", 10)
            include_system = action.data.get("include_system", False)
            
            messages = await self.conversation_service.get_conversation_history(
                tenant_id=tenant_id,
                session_id=session_id,
                limit=limit,
                include_system=include_system
            )
            
            return {
                "success": True,
                "messages": messages,
                "count": len(messages),
                "execution_time": time.time() - start_time
            }
            
        except Exception as e:
            self._logger.error(f"Error en handle_get_history: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "execution_time": time.time() - start_time
            }