"""
Worker para procesar callbacks del extraction-service.

Recibe resultados de extracción y continúa el pipeline:
1. Recibe texto extraído + enriquecimiento spaCy
2. Hace chunking jerárquico
3. Envía a embedding-service
"""
from typing import Optional, Dict, Any

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

from ..services.ingestion_service import IngestionService
from ..config.settings import IngestionSettings


class ExtractionCallbackWorker(BaseWorker):
    """
    Worker para procesar callbacks de extracción.
    
    Escucha acciones de tipo:
    - ingestion.extraction_callback
    
    Continúa el pipeline con chunking y embeddings.
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        async_redis_conn,
        ingestion_service: IngestionService,
        consumer_id_suffix: str = "extraction-callback-0"
    ):
        """
        Inicializa el worker de callbacks de extracción.
        
        Args:
            app_settings: Configuración del servicio
            async_redis_conn: Conexión Redis asíncrona
            ingestion_service: Instancia del servicio de ingestion
            consumer_id_suffix: Sufijo para identificar este worker
        """
        # Cambiar nombre del servicio para escuchar en el stream correcto
        # nooble4:dev:ingestion-callbacks:streams:main
        app_settings.service_name = "ingestion-callbacks"
        
        super().__init__(
            app_settings=app_settings,
            async_redis_conn=async_redis_conn,
            consumer_id_suffix=consumer_id_suffix
        )
        
        # Restaurar nombre
        app_settings.service_name = "ingestion-service"
        
        self.ingestion_service = ingestion_service
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa callback de extracción.
        
        Args:
            action: DomainAction con resultado de extracción
            
        Returns:
            None (fire-and-forget, continúa pipeline internamente)
        """
        try:
            if action.action_type == "ingestion.extraction_callback":
                self.logger.info(
                    f"[WORKER] Processing extraction callback",
                    extra={
                        "task_id": action.data.get("task_id"),
                        "document_id": action.data.get("document_id"),
                        "status": action.data.get("status")
                    }
                )
                
                result = await self.ingestion_service.handle_extraction_callback(action)
                
                self.logger.info(
                    f"[WORKER] Extraction callback processed for task {action.data.get('task_id')}"
                )
                
                return result
            
            self.logger.warning(f"Unknown callback type: {action.action_type}")
            return None
            
        except Exception as e:
            self.logger.error(f"Error processing extraction callback: {e}", exc_info=True)
            return None
