"""
Worker para procesar callbacks de otros servicios.
Especializado en recibir respuestas del execution service.
"""
from typing import Optional, Dict, Any

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

from ..services.orchestration_service import OrchestrationService
from ..config.settings import OrchestratorSettings


class CallbackWorker(BaseWorker):
    """
    Worker para procesar callbacks entrantes.
    Escucha en stream dedicado para callbacks del orchestrator.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        async_redis_conn,
        orchestration_service: OrchestrationService,
        consumer_id_suffix: str = "callback-0"
    ):
        # Configurar para escuchar en stream de callbacks
        app_settings.service_name = "orchestrator-callbacks"
        
        super().__init__(
            app_settings=app_settings,
            async_redis_conn=async_redis_conn,
            consumer_id_suffix=consumer_id_suffix
        )
        
        self.orchestration_service = orchestration_service
        
        # Restaurar nombre original después de inicialización
        app_settings.service_name = "orchestrator-service"
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa callbacks delegando al orchestration service.
        
        Args:
            action: DomainAction con el callback
            
        Returns:
            Resultado del procesamiento o None
        """
        try:
            self.logger.debug(
                f"Procesando callback: {action.action_type}",
                extra={
                    "action_id": str(action.action_id),
                    "origin_service": action.origin_service
                }
            )
            
            # Delegar al servicio de orquestación
            result = await self.orchestration_service.process_callback(action)
            
            return result
            
        except Exception as e:
            self.logger.error(
                f"Error procesando callback: {e}",
                extra={
                    "action_type": action.action_type,
                    "action_id": str(action.action_id),
                    "error": str(e)
                }
            )
            # No retornar error ya que es fire-and-forget
            return None