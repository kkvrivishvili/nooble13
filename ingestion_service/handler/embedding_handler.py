"""
Handler para coordinar con el servicio de embeddings.
Sin dependencia de agent_id real.
"""
import logging
import uuid
from typing import List, Dict, Any

from common.handlers.base_handler import BaseHandler
from common.models.actions import DomainAction

from ..clients.embedding_client import EmbeddingClient
from ..models import ChunkModel, RAGIngestionConfig
from ..config.settings import IngestionSettings


class EmbeddingHandler(BaseHandler):
    """Handler para gestionar embeddings de chunks sin agent_id."""
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        embedding_client: EmbeddingClient
    ):
        super().__init__(app_settings)
        self.embedding_client = embedding_client
    
    async def generate_embeddings(
        self,
        chunks: List[ChunkModel],
        tenant_id: uuid.UUID,
        task_id: uuid.UUID,
        rag_config: RAGIngestionConfig
    ) -> None:
        """
        Envía chunks para generar embeddings.
        La respuesta llegará asíncronamente via callback.
        
        NO requiere agent_id real.
        """
        if not chunks:
            return
        
        # Preparar textos y IDs
        texts = [chunk.content for chunk in chunks]
        chunk_ids = [chunk.chunk_id for chunk in chunks]
        
        # Obtener valor string del modelo
        model_value = (
            rag_config.embedding_model.value 
            if hasattr(rag_config.embedding_model, 'value')
            else str(rag_config.embedding_model)
        )
        
        # Metadata adicional
        # Crear DomainAction sin agent_id específico
        action = DomainAction(
            action_type="embedding.batch_process",
            tenant_id=tenant_id,
            agent_id=None,
            task_id=task_id,
            session_id=uuid.uuid4(),  # Session dummy
            origin_service="ingestion-service",
            callback_action_type="ingestion.embedding_callback",
            data={
                "texts": texts,
                "chunk_ids": chunk_ids,
                "model": model_value,
                "dimensions": rag_config.embedding_dimensions
            }
        )
        
        # Enviar con callback
        await self.embedding_client.redis_client.send_action_async_with_callback(
            action=action,
            callback_event_name="ingestion.embedding_callback"
        )
        
        self._logger.info(
            f"Sent {len(chunks)} chunks for embeddings",
            extra={"task_id": str(task_id), "tenant_id": str(tenant_id)}
        )