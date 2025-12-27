"""
Worker para procesar extracciones de documentos.

Escucha en el stream de extraction-service y procesa
requests de extracción, enviando callbacks a ingestion-service.
"""

from typing import Optional, Dict, Any

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

from ..services.extraction_service import ExtractionService
from ..config.settings import ExtractionSettings


class ExtractionWorker(BaseWorker):
    """
    Worker para procesamiento de extracciones.
    
    Escucha acciones de tipo:
    - extraction.document.process
    
    Envía callbacks a:
    - ingestion.extraction_callback
    """
    
    def __init__(
        self,
        app_settings: ExtractionSettings,
        async_redis_conn,
        extraction_service: ExtractionService,
        consumer_id_suffix: str = "extraction-0"
    ):
        """
        Inicializa el worker de extracción.
        
        Args:
            app_settings: Configuración del servicio
            async_redis_conn: Conexión Redis asíncrona
            extraction_service: Instancia del servicio de extracción
            consumer_id_suffix: Sufijo para identificar este worker
        """
        super().__init__(
            app_settings=app_settings,
            async_redis_conn=async_redis_conn,
            consumer_id_suffix=consumer_id_suffix
        )
        
        self.extraction_service = extraction_service
    
    async def initialize(self):
        """Inicializa el worker."""
        # Llamar inicialización del padre (asegura consumidor en Redis)
        await super().initialize()
        
        self.logger.info(
            f"ExtractionWorker initialized",
            extra={
                "consumer_name": self.consumer_name,
                "stream": self.action_stream_name
            }
        )
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una acción de extracción.
        
        Args:
            action: DomainAction recibida del stream
            
        Returns:
            Datos para el callback a ingestion-service
        """
        try:
            self.logger.info(
                f"Handling extraction action: {action.action_type}",
                extra={
                    "action_id": str(action.action_id),
                    "task_id": action.data.get("task_id"),
                    "document_name": action.data.get("document_name")
                }
            )
            
            # Delegar al servicio
            result = await self.extraction_service.process_action(action)
            
            if result:
                self.logger.info(
                    f"Extraction completed for task {action.data.get('task_id')}",
                    extra={
                        "status": result.get("status"),
                        "extraction_method": result.get("extraction_method"),
                        "total_time_ms": result.get("total_time_ms")
                    }
                )
            
            return result
            
        except Exception as e:
            self.logger.error(
                f"Error handling extraction action: {e}",
                exc_info=True
            )
            
            # Retornar error para callback
            return {
                "task_id": action.data.get("task_id", "unknown"),
                "document_id": action.data.get("document_id", "unknown"),
                "tenant_id": str(action.tenant_id),
                "status": "failed",
                "error": {
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "stage": "worker_handling",
                    "recoverable": False
                }
            }
