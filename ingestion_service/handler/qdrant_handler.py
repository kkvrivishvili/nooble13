"""
Handler corregido para Qdrant con multitenancy.
Usa una sola collection física con filtrado por metadata.
"""
import logging
from typing import List, Dict, Any, Optional
import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, MatchAny,
    SparseVectorParams, Modifier, SparseVector
)

from fastembed import SparseTextEmbedding

from common.handlers.base_handler import BaseHandler
from ..models import ChunkModel
from ..config.settings import IngestionSettings


class QdrantHandler(BaseHandler):
    """Handler para operaciones con Qdrant usando una sola collection."""
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        qdrant_client: AsyncQdrantClient
    ):
        super().__init__(app_settings)
        self.client = qdrant_client
        # IMPORTANTE: Una sola collection física para todos los tenants
        self.collection_name = "nooble8_vectors"
        self.vector_size = 1536  # Default OpenAI
        
        # Inicializar modelo BM25 ligero
        self._logger.info("Initializing SparseTextEmbedding (BM25)...")
        self.sparse_embedding_model = SparseTextEmbedding(model_name="Qdrant/bm25")
    
    async def initialize(self):
        """Asegura que la collection existe con índices apropiados."""
        try:
            collections = await self.client.get_collections()
            if not any(c.name == self.collection_name for c in collections.collections):
                await self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config={
                        "dense": VectorParams(
                            size=self.vector_size,
                            distance=Distance.COSINE
                        )
                    },
                    # Configuración para BM25 Nativo
                    sparse_vectors_config={
                        "bm25": SparseVectorParams(
                            modifier=Modifier.IDF
                        )
                    }
                )
                
                # Crear índices para filtrado eficiente (multitenancy)
                await self._create_payload_indices()
                
            self._logger.info(f"Qdrant collection '{self.collection_name}' ready")
            
        except Exception as e:
            self._logger.error(f"Error inicializando Qdrant: {e}")
            raise
    
    async def _create_payload_indices(self):
        """Crea índices para búsquedas eficientes en multitenancy."""
        # Índices críticos para la jerarquía
        indices = [
            "tenant_id",      # Primer nivel de filtrado
            "collection_id",  # Segundo nivel (virtual collections)
            "agent_ids",      # Tercer nivel (acceso por agente)
            "document_id",    # Cuarto nivel (documento específico)
            # Índices adicionales útiles
            "document_type",
            "created_at"
        ]
        
        for field in indices:
            try:
                await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema="keyword"
                )
                self._logger.info(f"Created index for field: {field}")
            except Exception as e:
                # El índice ya puede existir
                self._logger.debug(f"Index for {field} may already exist: {e}")
    
    async def store_chunks(
        self,
        chunks: List[ChunkModel],
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        embedding_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Almacena chunks con embeddings en Qdrant."""
        if not chunks:
            return {"stored": 0, "failed": 0}
        
        # LOG DETALLADO: Parámetros de entrada
        self._logger.info(
            f"[INGESTION] store_chunks iniciado",
            extra={
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "agent_ids_type": type(agent_ids).__name__,
                "agent_ids_count": len(agent_ids) if agent_ids else 0,
                "chunks_count": len(chunks),
                "collection_name": self.collection_name,
                "embedding_model": embedding_metadata.get("embedding_model"),
                "embedding_dimensions": embedding_metadata.get("embedding_dimensions")
            }
        )
        
        points = []
        failed_chunks = []
        
        # Pre-calcular sparse vectors (es rápido en CPU)
        try:
            texts = [c.content for c in chunks if c.embedding]  # Solo procesar si tiene dense embedding
            if texts:
                self._logger.info(f"Generating sparse embeddings for {len(texts)} chunks...")
                # embed devuelve un generador, convertimos a lista
                sparse_vectors_gen = self.sparse_embedding_model.embed(texts)
                sparse_vectors = list(sparse_vectors_gen)
            else:
                sparse_vectors = []
        except Exception as e:
            self._logger.error(f"Error generating sparse embeddings: {e}")
            # Fallback: no sparse vectors
            sparse_vectors = [None] * len(chunks)

        # Índice para iterar sobre sparse_vectors (solo incrementa si chunk tiene embedding)
        sparse_idx = 0
        
        for i, chunk in enumerate(chunks):
            if not chunk.embedding:
                self._logger.warning(f"Chunk {chunk.chunk_id} sin embedding")
                failed_chunks.append(chunk.chunk_id)
                continue
            
            # Preparar payload con jerarquía completa
            payload = {
                # IDs para jerarquía (filtrado)
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,  # Array para múltiples agentes
                "document_id": chunk.document_id,
                "chunk_id": chunk.chunk_id,
                
                # Contenido
                "content": chunk.content,
                "chunk_index": chunk.chunk_index,
                
                # Enriquecimiento
                "keywords": chunk.keywords,
                "tags": chunk.tags,
                
                # Metadata de embedding
                "embedding_model": embedding_metadata.get("embedding_model"),
                "embedding_dimensions": embedding_metadata.get("embedding_dimensions"),
                "encoding_format": embedding_metadata.get("encoding_format"),
                
                # Timestamps
                "created_at": chunk.created_at.isoformat(),
                
                # Metadata adicional del chunk
                **chunk.metadata
            }
            
            # LOG DETALLADO: Payload del primer chunk como ejemplo
            if i == 0:
                self._logger.info(
                    f"[INGESTION] Ejemplo de payload (chunk 1/{len(chunks)})",
                    extra={
                        "chunk_id": chunk.chunk_id,
                        "document_id": chunk.document_id,
                        "payload_tenant_id": payload["tenant_id"],
                        "payload_collection_id": payload["collection_id"],
                        "payload_agent_ids": payload["agent_ids"],
                        "payload_agent_ids_type": type(payload["agent_ids"]).__name__,
                        "content_length": len(payload["content"]),
                        "embedding_length": len(chunk.embedding) if chunk.embedding else 0,
                        "chunk_metadata_keys": list(chunk.metadata.keys()) if chunk.metadata else []
                    }
                )
            
            # Obtener sparse vector correspondiente si existe
            sparse_vec = None
            if sparse_idx < len(sparse_vectors):
                sv = sparse_vectors[sparse_idx]
                if sv:
                    sparse_vec = SparseVector(
                        indices=sv.indices.tolist(),
                        values=sv.values.tolist()
                    )
                sparse_idx += 1

            point = PointStruct(
                id=chunk.chunk_id,
                # Vector híbrido: dense + bm25
                vector={
                    "dense": chunk.embedding,
                    "bm25": sparse_vec
                },
                payload=payload
            )
            points.append(point)
        
        if points:
            try:
                await self.client.upsert(
                    collection_name=self.collection_name,
                    points=points,
                    wait=True
                )
                
                # LOG DETALLADO: Confirmación de almacenamiento exitoso
                self._logger.info(
                    f"[INGESTION] Almacenados {len(points)} chunks en Qdrant exitosamente",
                    extra={
                        "collection_name": self.collection_name,
                        "tenant_id": tenant_id,
                        "collection_id": collection_id,
                        "agent_ids": agent_ids,
                        "stored_count": len(points),
                        "failed_count": len(failed_chunks),
                        "chunk_ids_sample": [p.id for p in points[:3]],  # Primeros 3 IDs como muestra
                        "embedding_model": embedding_metadata.get("embedding_model"),
                        "embedding_dimensions": embedding_metadata.get("embedding_dimensions")
                    }
                )
                
                # LOG ADICIONAL: Verificar que los datos se pueden recuperar inmediatamente
                try:
                    # Hacer un scroll rápido para verificar que los datos están ahí
                    scroll_result = await self.client.scroll(
                        collection_name=self.collection_name,
                        scroll_filter=Filter(
                            must=[
                                FieldCondition(
                                    key="tenant_id",
                                    match=MatchValue(value=tenant_id)
                                ),
                                FieldCondition(
                                    key="collection_id",
                                    match=MatchValue(value=collection_id)
                                )
                            ]
                        ),
                        limit=1,
                        with_payload=True
                    )
                    
                    if scroll_result[0]:  # Si hay resultados
                        sample_point = scroll_result[0][0]
                        self._logger.info(
                            f"[INGESTION] Verificación post-upsert exitosa",
                            extra={
                                "verification_point_id": str(sample_point.id),
                                "verification_payload_tenant_id": sample_point.payload.get("tenant_id"),
                                "verification_payload_collection_id": sample_point.payload.get("collection_id"),
                                "verification_payload_agent_ids": sample_point.payload.get("agent_ids"),
                                "verification_payload_document_id": sample_point.payload.get("document_id")
                            }
                        )
                    else:
                        self._logger.warning(
                            f"[INGESTION] ADVERTENCIA: No se pudo verificar inmediatamente los datos almacenados",
                            extra={
                                "tenant_id": tenant_id,
                                "collection_id": collection_id
                            }
                        )
                except Exception as verify_e:
                    self._logger.warning(
                        f"[INGESTION] Error en verificación post-upsert: {verify_e}",
                        extra={
                            "tenant_id": tenant_id,
                            "collection_id": collection_id
                        }
                    )
                
            except Exception as e:
                self._logger.error(
                    f"[INGESTION] Error almacenando chunks: {e}",
                    extra={
                        "tenant_id": tenant_id,
                        "collection_id": collection_id,
                        "agent_ids": agent_ids,
                        "points_count": len(points)
                    }
                )
                failed_chunks.extend([p.id for p in points])
        
        return {
            "stored": len(points) - len(failed_chunks),
            "failed": len(failed_chunks),
            "failed_ids": failed_chunks
        }
    
    async def delete_document(
        self,
        tenant_id: str,
        document_id: str,
        collection_id: str
    ) -> int:
        """Elimina todos los chunks de un documento."""
        try:
            # Filtro jerárquico: tenant -> collection -> document
            result = await self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=tenant_id)
                        ),
                        FieldCondition(
                            key="collection_id",
                            match=MatchValue(value=collection_id)
                        ),
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id)
                        )
                    ]
                )
            )
            
            self._logger.info(
                f"Documento eliminado: {document_id} "
                f"(tenant: {tenant_id}, collection: {collection_id})"
            )
            
            # Qdrant no retorna count exacto, estimamos éxito
            return 1
            
        except Exception as e:
            self._logger.error(f"Error eliminando documento: {e}")
            raise
    
    async def search_by_agent(
        self,
        tenant_id: str,
        agent_id: str,
        query_vector: List[float],
        collection_ids: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Busca vectores accesibles por un agente específico.
        Ejemplo de uso en query service.
        """
        # Construir filtros jerárquicos
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=tenant_id)
            ),
            FieldCondition(
                key="agent_ids",
                match=MatchAny(any=[agent_id])  # El agente está en la lista
            )
        ]
        
        # Filtro opcional por collections específicas
        if collection_ids:
            must_conditions.append(
                FieldCondition(
                    key="collection_id",
                    match=MatchAny(any=collection_ids)
                )
            )
        
        results = await self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            query_filter=Filter(must=must_conditions),
            limit=limit,
            with_payload=True
        )
        
        return [
            {
                "id": result.id,
                "score": result.score,
                "payload": result.payload
            }
            for result in results
        ]
    
    async def update_chunk_agents(
        self,
        tenant_id: str,
        document_id: str,
        agent_ids: List[str],
        operation: str = "set"  # "set", "add", "remove"
    ) -> bool:
        """
        Actualiza la lista de agentes con acceso a un documento.
        Útil para asignar/desasignar agentes después de la ingesta.
        """
        try:
            # Obtener chunks del documento
            chunks = await self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=tenant_id)
                        ),
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id)
                        )
                    ]
                ),
                limit=1000  # Ajustar según necesidad
            )
            
            if not chunks[0]:  # No hay chunks
                return False
            
            # Actualizar agent_ids en cada chunk
            for chunk in chunks[0]:
                current_agents = chunk.payload.get("agent_ids", [])
                
                if operation == "set":
                    new_agents = agent_ids
                elif operation == "add":
                    new_agents = list(set(current_agents + agent_ids))
                elif operation == "remove":
                    new_agents = [a for a in current_agents if a not in agent_ids]
                else:
                    raise ValueError(f"Operación no válida: {operation}")
                
                # Actualizar payload
                await self.client.set_payload(
                    collection_name=self.collection_name,
                    payload={"agent_ids": new_agents},
                    points=[chunk.id]
                )
            
            self._logger.info(
                f"Actualizado acceso de agentes para documento {document_id}: "
                f"operation={operation}, agents={agent_ids}"
            )
            return True
            
        except Exception as e:
            self._logger.error(f"Error actualizando agentes: {e}")
            return False