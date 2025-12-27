"""
Cliente para comunicación con extraction-service.

Envía requests de extracción y recibe callbacks con resultados.
"""
import logging
import uuid
from typing import Dict, Any, Optional

from common.clients.base_redis_client import BaseRedisClient
from common.models.actions import DomainAction
from common.models.config_models import ProcessingMode, SpacyModelSize


class ExtractionClient:
    """Cliente para comunicación con extraction-service."""
    
    def __init__(self, redis_client: BaseRedisClient):
        """
        Inicializa el cliente de extracción.
        
        Args:
            redis_client: Cliente Redis para enviar acciones
        """
        self.redis_client = redis_client
        self._logger = logging.getLogger(__name__)
    
    async def request_extraction(
        self,
        task_id: str,
        document_id: str,
        tenant_id: str,
        file_path: str,
        document_type: str,
        document_name: str,
        processing_mode: ProcessingMode = ProcessingMode.FAST,
        spacy_model_size: SpacyModelSize = SpacyModelSize.MEDIUM,
        max_pages: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Envía request de extracción al extraction-service.
        La respuesta llegará vía callback.
        
        Args:
            task_id: ID de la tarea de ingestion
            document_id: ID del documento
            tenant_id: ID del tenant
            file_path: Ruta al archivo a procesar
            document_type: Tipo de documento (pdf, docx, etc.)
            document_name: Nombre original del documento
            processing_mode: Modo de procesamiento según tier
            spacy_model_size: Tamaño del modelo spaCy
            max_pages: Límite de páginas (opcional)
            metadata: Metadata adicional
        """
        # Construir data del request
        extraction_data = {
            "task_id": task_id,
            "document_id": document_id,
            "tenant_id": tenant_id,
            "file_path": file_path,
            "document_type": document_type,
            "document_name": document_name,
            "processing_mode": processing_mode.value,
            "spacy_model_size": spacy_model_size.value,
            "metadata": metadata or {}
        }
        
        if max_pages:
            extraction_data["max_pages"] = max_pages
        
        # Crear DomainAction
        action = DomainAction(
            action_type="extraction.document.process",
            tenant_id=uuid.UUID(tenant_id),
            agent_id=None,  # No hay agente en extracción
            task_id=uuid.UUID(task_id),
            session_id=uuid.uuid4(),  # Session dummy
            origin_service="ingestion-service",
            callback_action_type="ingestion.extraction_callback",
            data=extraction_data,
            metadata=metadata or {}
        )
        
        self._logger.info(
            f"[ExtractionClient] Sending extraction request",
            extra={
                "task_id": task_id,
                "document_id": document_id,
                "document_name": document_name,
                "processing_mode": processing_mode.value
            }
        )
        
        # Enviar con callback
        await self.redis_client.send_action_async_with_callback(
            action=action,
            callback_event_name="ingestion.extraction_callback"
        )
        
        self._logger.info(
            f"[ExtractionClient] Extraction request sent for {document_name}",
            extra={
                "task_id": task_id,
                "document_type": document_type
            }
        )
