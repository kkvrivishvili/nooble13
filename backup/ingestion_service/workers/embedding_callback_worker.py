"""
Worker para procesar callbacks del embedding service.
"""
from typing import Optional, Dict, Any

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

from ..services.ingestion_service import IngestionService
from ..config.settings import IngestionSettings


class EmbeddingCallbackWorker(BaseWorker):
    """Worker para procesar callbacks de embeddings."""
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        async_redis_conn,
        ingestion_service: IngestionService,
        consumer_id_suffix: str = "embedding-callback-0"
    ):
        # Escuchar en stream de callbacks de ingestion
        app_settings.service_name = "ingestion-callbacks"
        
        super().__init__(
            app_settings=app_settings,
            async_redis_conn=async_redis_conn,
            consumer_id_suffix=consumer_id_suffix
        )
        
        self.ingestion_service = ingestion_service
        
        # Restaurar nombre
        app_settings.service_name = "ingestion-service"
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """Procesa callbacks de embeddings."""
        try:
            if action.action_type == "ingestion.embedding_callback":
                return await self.ingestion_service.handle_embedding_callback(action)
            
            self.logger.warning(f"Tipo de callback no reconocido: {action.action_type}")
            return None
            
        except Exception as e:
            self.logger.error(f"Error procesando callback: {e}")
            return None