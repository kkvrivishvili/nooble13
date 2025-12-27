"""
Cliente simplificado para comunicación con embedding service.
Sin dependencia de agent_id real.
"""
import logging
import uuid
from typing import List, Dict, Any

from common.clients.base_redis_client import BaseRedisClient
from common.models.actions import DomainAction
from ingestion_service.models import RAGIngestionConfig


class EmbeddingClient:
    """Cliente para comunicación con embedding service."""
    
    def __init__(self, redis_client: BaseRedisClient):
        """
        Inicializa el cliente de embeddings.
        
        Args:
            redis_client: Cliente Redis para enviar acciones
        """
        self.redis_client = redis_client
        self._logger = logging.getLogger(__name__)
    
    async def generate_embeddings_batch(
        self,
        texts: List[str],
        chunk_ids: List[str],
        task_id: str,
        metadata: Dict[str, Any]
    ) -> None:
        """
        Envía batch de textos para generar embeddings.
        La respuesta llegará vía callback.
        
        Args:
            texts: Lista de textos para generar embeddings
            chunk_ids: IDs correspondientes a cada texto
            task_id: ID de la tarea de ingestion
            metadata: Metadata adicional (tenant_id, model, etc.)
        """
        if not texts:
            self._logger.warning("No texts provided for embedding generation")
            return
        
        # Validar que tengamos la misma cantidad de textos y chunk_ids
        if len(texts) != len(chunk_ids):
            raise ValueError(f"Mismatch: {len(texts)} texts vs {len(chunk_ids)} chunk_ids")
        
        # Crear DomainAction con UUID dummy para agent_id
        action = DomainAction(
            action_type="embedding.batch_process",
            tenant_id=uuid.UUID(metadata["tenant_id"]),
            agent_id=None,
            task_id=uuid.UUID(task_id),
            session_id=uuid.uuid4(),  # Session dummy
            origin_service="ingestion-service",
            callback_action_type="ingestion.embedding_callback",
            data={
                "texts": texts,
                "chunk_ids": chunk_ids,
                "model": metadata.get("embedding_model"),
                "dimensions": metadata.get("embedding_dimensions", 1536),
              
            },
            metadata=metadata
        )
        
        # Log detallado de la acción que se va a enviar
        self._logger.info(
            "[EmbeddingClient] Preparing to send action.",
            extra={"action_payload": action.model_dump()}
        )

        # Enviar con callback
        await self.redis_client.send_action_async_with_callback(
            action=action,
            callback_event_name="ingestion.embedding_callback"
        )
        
        self._logger.info(
            f"Sent batch of {len(texts)} texts for embedding generation",
            extra={
                "task_id": task_id,
                "tenant_id": metadata.get("tenant_id"),
                "model": metadata.get("embedding_model")
            }
        )