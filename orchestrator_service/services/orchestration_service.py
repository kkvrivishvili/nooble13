"""
Servicio principal de orquestación.
Coordina todos los componentes del orchestrator.
"""
import logging
from typing import Optional, Dict, Any, List
import uuid

from common.services.base_service import BaseService
from common.models.actions import DomainAction
from common.models.chat_models import ConversationHistory, SessionType
from common.clients.base_redis_client import BaseRedisClient

from ..config.settings import OrchestratorSettings
from ..handlers import ChatHandler, CallbackHandler, ConfigHandler, SessionHandler
from ..clients.execution_client import ExecutionClient

logger = logging.getLogger(__name__)


class OrchestrationService(BaseService):
    """
    Servicio principal de orquestación.
    Coordina handlers y gestiona el flujo de trabajo.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        service_redis_client: BaseRedisClient,
        direct_redis_conn,
        supabase_client,
        execution_client: ExecutionClient,
        config_handler: ConfigHandler,
        session_handler: SessionHandler
    ):
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        self.supabase_client = supabase_client
        self.execution_client = execution_client
        self.config_handler = config_handler
        self.session_handler = session_handler
        
        # Los otros handlers se inicializan después con set_handlers
        self.chat_handler: Optional[ChatHandler] = None
        self.callback_handler: Optional[CallbackHandler] = None
    
    def set_handlers(
        self,
        chat_handler: ChatHandler,
        callback_handler: CallbackHandler
    ):
        """Configura handlers que requieren referencias circulares."""
        self.chat_handler = chat_handler
        self.callback_handler = callback_handler
    
    async def startup(self):
        """Inicialización del servicio."""
        self._logger.info("Iniciando OrchestrationService...")
        # Los handlers ya están inicializados
        self._logger.info("OrchestrationService iniciado")
    
    async def shutdown(self):
        """Limpieza del servicio."""
        self._logger.info("Cerrando OrchestrationService...")
        
        # Cerrar handlers que lo requieran
        if hasattr(self.session_handler, 'shutdown'):
            await self.session_handler.shutdown()
        
        self._logger.info("OrchestrationService cerrado")
    
    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa DomainActions (usado solo si se habilita worker mode).
        
        Args:
            action: DomainAction a procesar
            
        Returns:
            Resultado del procesamiento
        """
        self._logger.warning(
            f"OrchestrationService en modo API no debería recibir DomainActions: {action.action_type}"
        )
        return {"error": "Service in API mode"}
    
    async def process_callback(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa callbacks de otros servicios.
        
        Args:
            action: DomainAction con el callback
            
        Returns:
            Resultado del procesamiento
        """
        if not self.callback_handler:
            self._logger.error("CallbackHandler no configurado")
            return {"error": "CallbackHandler not configured"}
        
        return await self.callback_handler.handle_execution_callback(action)
    
    # === API Methods (delegación a handlers) ===
    
    async def create_session(
        self,
        session_type: SessionType,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> ConversationHistory:
        """Crea una nueva sesión."""
        return await self.session_handler.create_session(
            session_type=session_type,
            tenant_id=tenant_id,
            agent_id=agent_id,
            user_id=user_id,
            metadata=metadata
        )
    
    async def get_session(self, session_id: uuid.UUID) -> Optional[ConversationHistory]:
        """Obtiene una sesión por ID."""
        return await self.session_handler.get_session(session_id)
    
    async def update_session(self, session: ConversationHistory) -> bool:
        """Actualiza una sesión."""
        return await self.session_handler.update_session(session)
    
    async def delete_session(self, session_id: uuid.UUID) -> bool:
        """Elimina una sesión."""
        return await self.session_handler.delete_session(session_id)
    
    async def list_active_sessions(
        self,
        tenant_id: Optional[uuid.UUID] = None,
        session_type: Optional[SessionType] = None
    ) -> List[ConversationHistory]:
        """Lista sesiones activas."""
        return await self.session_handler.list_active_sessions(tenant_id, session_type)
    
    async def health_check(self) -> Dict[str, Any]:
        """Verifica salud del servicio."""
        return {
            "status": "healthy",
            "service": "orchestrator",
            "mode": "api_driven"
        }