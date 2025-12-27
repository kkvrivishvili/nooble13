"""
Worker principal para procesar requests de ingestion.

Escucha en el stream de ingestion-service y procesa
requests de ingestion de documentos.
"""
from typing import Optional, Dict, Any

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

from ..services.ingestion_service import IngestionService
from ..config.settings import IngestionSettings


class IngestionWorker(BaseWorker):
    """
    Worker principal de ingestion.
    
    Escucha acciones de tipo:
    - ingestion.document.ingest
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        async_redis_conn,
        ingestion_service: IngestionService,
        consumer_id_suffix: str = "ingestion-0"
    ):
        """
        Inicializa el worker de ingestion.
        
        Args:
            app_settings: Configuración del servicio
            async_redis_conn: Conexión Redis asíncrona
            ingestion_service: Instancia del servicio de ingestion
            consumer_id_suffix: Sufijo para identificar este worker
        """
        super().__init__(
            app_settings=app_settings,
            async_redis_conn=async_redis_conn,
            consumer_id_suffix=consumer_id_suffix
        )
        
        self.ingestion_service = ingestion_service
    
    async def initialize(self):
        """Inicializa el worker."""
        await super().initialize()
        
        self.logger.info(
            f"IngestionWorker initialized",
            extra={
                "consumer_name": self.consumer_name,
                "stream": self.action_stream_name
            }
        )
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una acción de ingestion.
        
        Args:
            action: DomainAction recibida del stream
            
        Returns:
            Datos de respuesta (para pseudo-sync) o None
        """
        try:
            self.logger.info(
                f"Handling ingestion action: {action.action_type}",
                extra={
                    "action_id": str(action.action_id),
                    "task_id": str(action.task_id),
                    "document_name": action.data.get("document_name")
                }
            )
            
            # Delegar al servicio
            result = await self.ingestion_service.process_action(action)
            
            return result
            
        except Exception as e:
            self.logger.error(
                f"Error handling ingestion action: {e}",
                exc_info=True
            )
            
            return {
                "task_id": str(action.task_id),
                "status": "failed",
                "error": str(e)
            }
