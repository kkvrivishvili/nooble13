"""
Cliente para Qdrant usando el SDK oficial.
"""
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, MatchAny,
    SearchParams, PointStruct, Prefetch, FusionQuery, Fusion, SparseVector
)
from fastembed import SparseTextEmbedding

from common.models.chat_models import RAGChunk


class QdrantClient:
    """Cliente oficial de Qdrant para búsquedas vectoriales."""
    
    def __init__(self, url: str, api_key: Optional[str] = None, collection_name: str = "nooble8_vectors"):
        """
        Inicializa el cliente de Qdrant.
        
        Args:
            url: URL de Qdrant
            api_key: API key opcional
            collection_name: Nombre de la colección física en Qdrant
        """
        self.client = AsyncQdrantClient(
            url=url,
            api_key=api_key,
            timeout=30
        )
        self.logger = logging.getLogger(__name__)
        self.collection_name = collection_name
        
        # Inicializar modelo BM25 ligero
        self.logger.info("Initializing SparseTextEmbedding (BM25)...")
        self.sparse_embedding_model = SparseTextEmbedding(model_name="Qdrant/bm25")
    
    async def search(
        self,
        query_embedding: List[float],
        query_text: str, # NUEVO: Texto original de la consulta para BM25
        collection_ids: List[str],
        top_k: int,
        similarity_threshold: float,
        tenant_id: UUID,
        agent_id: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[RAGChunk]:
        """
        Realiza búsqueda vectorial en la colección unificada "documents".
        Usa Hybrid Search (Dense + Sparse) con Fusion RRF.
        
        Args:
            agent_id: ID del agente - OBLIGATORIO para filtrado
            collection_ids: IDs de colecciones para filtro virtual (no nombres físicos)
        
        Returns:
            Lista de RAGChunk directamente
        """
        # LOG DETALLADO: Parámetros de entrada
        self.logger.info(
            f"QdrantClient: SEARCH ejecutándose - collection_ids={collection_ids}, tenant_id={tenant_id}, agent_id={agent_id}, top_k={top_k}, threshold={similarity_threshold}"
        )
        
        # Validar agent_id obligatorio
        if not agent_id:
            raise ValueError("agent_id is required for vector search")
        
        # Construir filtro con tenant_id, agent_id Y collection_ids virtuales
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=str(tenant_id))
            ),
            # Filtro obligatorio por agent_id (array contiene el agente)
            FieldCondition(
                key="agent_ids",
                match=MatchAny(any=[str(agent_id)])
            )
        ]
        
        # Filtrar por collection_ids virtuales si se proporcionan
        if collection_ids:
            must_conditions.append(
                FieldCondition(
                    key="collection_id",
                    match=MatchAny(any=[str(c) for c in collection_ids])
                )
            )
        
        # Agregar filtros adicionales si existen
        if filters and filters.get("document_ids"):
            must_conditions.append(
                FieldCondition(
                    key="document_id",
                    match=MatchAny(any=[str(d) for d in filters["document_ids"]])
                )
            )
        
        qdrant_filter = Filter(must=must_conditions)
        
        # BUSQUEDA HÍBRIDA: Dense + Sparse (BM25) con RRF
        try:
            # 1. Generar vector sparse de la consulta
            query_sparse = list(self.sparse_embedding_model.query_embed(query_text))[0]
            
            # 2. Construir Prefetch (Búsquedas paralelas)
            prefetch = [
                # Búsqueda Semántica
                Prefetch(
                    query=query_embedding,
                    using="dense",
                    filter=qdrant_filter, # Aplicar filtro aquí también
                    limit=top_k
                ),
                # Búsqueda Léxica (BM25)
                Prefetch(
                    query=SparseVector(
                        indices=query_sparse.indices.tolist(),
                        values=query_sparse.values.tolist()
                    ),
                    using="bm25",
                    filter=qdrant_filter, # Aplicar filtro aquí también
                    limit=top_k
                )
            ]
            
            # 3. Ejecutar Query con Fusión RRF
            self.logger.info(f"Executing Hybrid Search (RRF) for query: '{query_text[:50]}...'")
            results = await self.client.query_points(
                collection_name=self.collection_name,
                prefetch=prefetch,
                query=FusionQuery(fusion=Fusion.RRF),
                # En RRF filters se aplican en prefetch
                limit=top_k
            )
            
            # Obtener puntos de la respuesta fusionada
            points = results.points

        except Exception as e:
             # Fallback a búsqueda solo densa si falla embedding sparse
             self.logger.error(f"Hybrid search failed, falling back to dense search: {e}")
             self.logger.info(f"[SEARCH] Ejecutando búsqueda fallback (solo dense) en Qdrant...")
             
             results = await self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=qdrant_filter,
                limit=top_k,
                score_threshold=similarity_threshold,
                with_payload=True
            )
             # En búsqueda standard results es una lista de ScoredPoint
             points = results

        # LOG DETALLADO: Resultados de búsqueda
        self.logger.info(
            f"[SEARCH] Búsqueda ejecutada",
            extra={
                "results_count": len(points),
                "requested_top_k": top_k,
                "similarity_threshold": similarity_threshold,
                "results_scores": [p.score for p in points[:5]] if points else [],
                "results_ids_sample": [str(p.id) for p in points[:3]] if points else []
            }
        )

        # Mapear a modelo RAGChunk
        rag_chunks = []
        for point in points:
            payload = point.payload
            
            chunk = RAGChunk(
                chunk_id=UUID(point.id) if isinstance(point.id, str) else UUID(str(point.id)),
                document_id=UUID(payload.get("document_id")),
                collection_id=payload.get("collection_id", ""),  # Required field
                content=payload.get("content", ""),
                similarity_score=point.score,  # Map Qdrant score to similarity_score
                metadata={
                    k: v for k, v in payload.items() 
                    if k not in ["content", "chunk_id", "document_id", "collection_id"]
                }
            )
            rag_chunks.append(chunk)
            
        return rag_chunks
    
    async def close(self):
        """Cierra el cliente."""
        await self.client.close()