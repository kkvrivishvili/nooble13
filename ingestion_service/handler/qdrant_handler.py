"""
Handler para Qdrant con soporte completo para técnicas agnósticas.

Implementa:
- Almacenamiento de search_anchors en BM25 y Full-Text Index
- Almacenamiento de atomic_facts en Full-Text Index
- Score-Boosting por fact_density
- Filtrado por document_nature y normalized_entities
- Búsqueda híbrida optimizada

Usa una sola collection física con filtrado por metadata (multitenancy).
"""
import logging
import json
from typing import List, Dict, Any, Optional
import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, MatchAny, MatchText,
    SparseVectorParams, Modifier, SparseVector,
    TextIndexParams, TokenizerType,
    Prefetch, FusionQuery, Fusion,
    # Qdrant 1.14+ Score Boosting
    FormulaQuery, SumExpression, MultExpression,
    # Qdrant 1.16+ Parametrized RRF
    RrfQuery, Rrf
)

from fastembed import SparseTextEmbedding

from common.handlers.base_handler import BaseHandler
from ..models import ChunkModel
from ..config.settings import IngestionSettings


class QdrantHandler(BaseHandler):
    """
    Handler para operaciones con Qdrant con soporte agnóstico.
    
    Características:
    - Almacena search_anchors para BM25 mejorado
    - Almacena atomic_facts para búsqueda exacta
    - Almacena fact_density para Score-Boosting
    - Índices Full-Text en campos clave
    - Multitenancy con una sola collection
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        qdrant_client: AsyncQdrantClient
    ):
        super().__init__(app_settings)
        self.client = qdrant_client
        self.collection_name = "nooble8_vectors"
        self.vector_size = 1536  # Default OpenAI
        
        # El modelo BM25 se cargará perezosamente para no bloquear el inicio del servicio
        self._sparse_embedding_model = None
    
    @property
    def sparse_embedding_model(self):
        """Carga perezosa del modelo SparseTextEmbedding."""
        if self._sparse_embedding_model is None:
            self._logger.info("Initializing SparseTextEmbedding (BM25)...")
            self._sparse_embedding_model = SparseTextEmbedding(model_name="Qdrant/bm25")
        return self._sparse_embedding_model
    
    async def initialize(self):
        """Asegura que la collection existe con índices para técnicas agnósticas."""
        try:
            collections = await self.client.get_collections()
            collection_exists = any(c.name == self.collection_name for c in collections.collections)
            
            if not collection_exists:
                await self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config={
                        "dense": VectorParams(
                            size=self.vector_size,
                            distance=Distance.COSINE
                        )
                    },
                    sparse_vectors_config={
                        "bm25": SparseVectorParams(
                            modifier=Modifier.IDF
                        )
                    },
                    on_disk_payload=True
                )
                self._logger.info(f"Created collection: {self.collection_name}")
            
            # Crear índices para multitenancy y técnicas agnósticas
            await self._create_agnostic_indices()
                
            self._logger.info(f"Qdrant collection '{self.collection_name}' ready with agnostic indexes")
            
        except Exception as e:
            self._logger.error(f"Error inicializando Qdrant: {e}")
            raise
    
    async def _create_agnostic_indices(self):
        """Crea índices para técnicas agnósticas y multitenancy."""
        
        # Índices de multitenancy (keyword)
        keyword_indices = [
            "tenant_id",
            "collection_id",
            "agent_ids",
            "document_id",
            "document_nature",  # Para filtrado por tipo
        ]
        
        for field in keyword_indices:
            try:
                await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field,
                    field_schema="keyword"
                )
                self._logger.debug(f"Created keyword index: {field}")
            except Exception as e:
                self._logger.debug(f"Index {field} may exist: {e}")
        
        # Índice float para fact_density (Score-Boosting)
        try:
            await self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="fact_density",
                field_schema="float"
            )
            self._logger.debug("Created float index: fact_density")
        except Exception as e:
            self._logger.debug(f"Index fact_density may exist: {e}")
            
        # Índice para entidades normalizadas (Standard de Qdrant 1.16+)
        try:
            await self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="normalized_entities",
                field_schema="nested"
            )
            self._logger.debug("Created nested index: normalized_entities")
        except Exception as e:
            self._logger.debug(f"Index normalized_entities may exist: {e}")
        
        # Índices Full-Text para búsqueda textual
        text_fields = ["search_anchors", "atomic_facts", "content"]
        
        for field_name in text_fields:
            try:
                # Qdrant 1.16 Standard: MULTILINGUAL para todos los campos de texto
                # Mejora el soporte para español e inglés simultáneamente.
                await self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field_name,
                    field_schema=TextIndexParams(
                        type="text",
                        tokenizer=TokenizerType.MULTILINGUAL,
                        min_token_len=2,
                        max_token_len=30,
                        lowercase=True
                    )
                )
                self._logger.debug(f"Created text index: {field_name}")
            except Exception as e:
                self._logger.debug(f"Text index {field_name} may exist: {e}")
    
    async def store_chunks(
        self,
        chunks: List[ChunkModel],
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        embedding_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Almacena chunks con todos los campos agnósticos.
        
        El BM25 se genera del content + search_anchors + atomic_facts
        para maximizar el recall en búsquedas híbridas.
        """
        if not chunks:
            return {"stored": 0, "failed": 0}
        
        self._logger.info(
            f"[AGNOSTIC] Storing {len(chunks)} chunks with agnostic fields",
            extra={
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids
            }
        )
        
        points = []
        failed_chunks = []
        
        # Preparar textos para BM25: content + search_anchors + atomic_facts
        texts_for_bm25 = []
        valid_chunks = []
        
        for chunk in chunks:
            if not chunk.embedding:
                self._logger.warning(f"Chunk {chunk.chunk_id} sin embedding")
                failed_chunks.append(chunk.chunk_id)
                continue
            
            # Construir texto para BM25 usando el método del modelo
            bm25_text = chunk.get_bm25_text()
            texts_for_bm25.append(bm25_text)
            valid_chunks.append(chunk)
        
        # Generar sparse vectors en batch
        sparse_vectors = []
        if texts_for_bm25:
            try:
                self._logger.info(f"Generating sparse embeddings for {len(texts_for_bm25)} chunks...")
                sparse_vectors_gen = self.sparse_embedding_model.embed(texts_for_bm25)
                sparse_vectors = list(sparse_vectors_gen)
                
                # Log del primer texto BM25 generado para inspección
                if texts_for_bm25:
                    self._logger.debug(
                        f"[AGNOSTIC] Sample BM25 Text (len: {len(texts_for_bm25[0])}):\n"
                        f"{texts_for_bm25[0][:500]}..."
                    )
            except Exception as e:
                self._logger.error(f"Error generating sparse embeddings: {e}")
                sparse_vectors = [None] * len(texts_for_bm25)
        
        # Construir puntos
        for i, chunk in enumerate(valid_chunks):
            # Payload con todos los campos agnósticos
            payload = {
                # IDs para jerarquía (filtrado)
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "document_id": chunk.document_id,
                "chunk_id": chunk.chunk_id,
                
                # Contenido
                "content": chunk.content,  # Contextualizado
                "content_raw": chunk.content_raw or chunk.content,
                "chunk_index": chunk.chunk_index,
                
                # ============================================
                # CAMPOS AGNÓSTICOS - Lo importante
                # ============================================
                
                # Search Anchors - Asegurar lista nativa para JSON válido
                "search_anchors": list(chunk.search_anchors or []),
                
                # Atomic Facts - Asegurar lista nativa para JSON válido
                "atomic_facts": list(chunk.atomic_facts or []),
                
                # Fact Density - para Score-Boosting
                "fact_density": float(chunk.fact_density),
                
                # Document Nature - para filtrado
                "document_nature": str(chunk.document_nature),
                
                # Normalized Entities - para filtrado estructurado
                "normalized_entities": dict(chunk.normalized_entities or {}),

                # ============================================
                # METADATA ESTRUCTURAL (Qdrant 1.16 Standard)
                # ============================================
                "document_type": chunk.document_type,
                "document_name": chunk.document_name,
                "language": chunk.language,
                "page_count": chunk.page_count,
                "has_tables": chunk.has_tables,
                
                # ============================================
                
                # Legacy (para compatibilidad)
                "keywords": list(chunk.keywords or []),
                "tags": list(chunk.tags or []),
                
                # Timestamps
                "created_at": chunk.created_at.isoformat(),
                
                # Metadata adicional
                **chunk.metadata
            }
            
            # Log del primer chunk como ejemplo (Mejorado para evitar sintaxis 0:)
            if i == 0:
                self._logger.debug(
                    f"[AGNOSTIC] Sample Payload JSON for chunk {chunk.chunk_id}:\n"
                    f"{json.dumps(payload, indent=2, ensure_ascii=False)}"
                )
                self._logger.info(
                    f"[AGNOSTIC] Prepared payload for {len(chunks)} chunks",
                    extra={
                        "sample_chunk_id": chunk.chunk_id,
                        "document_name": chunk.document_name,
                        "search_anchors_count": len(payload["search_anchors"]),
                        "atomic_facts_count": len(payload["atomic_facts"])
                    }
                )
            
            # Sparse vector
            sparse_vec = None
            if i < len(sparse_vectors) and sparse_vectors[i] is not None:
                sv = sparse_vectors[i]
                sparse_vec = SparseVector(
                    indices=sv.indices.tolist(),
                    values=sv.values.tolist()
                )

            point = PointStruct(
                id=chunk.chunk_id,
                vector={
                    "dense": chunk.embedding,
                    "bm25": sparse_vec
                },
                payload=payload
            )
            points.append(point)
        
        # Upsert en Qdrant
        if points:
            try:
                await self.client.upsert(
                    collection_name=self.collection_name,
                    points=points,
                    wait=True
                )
                
                self._logger.info(
                    f"[AGNOSTIC] Stored {len(points)} chunks successfully",
                    extra={
                        "collection_name": self.collection_name,
                        "tenant_id": tenant_id,
                        "collection_id": collection_id
                    }
                )
                
            except Exception as e:
                self._logger.error(f"[AGNOSTIC] Error storing chunks: {e}")
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
                f"Document deleted: {document_id} "
                f"(tenant: {tenant_id}, collection: {collection_id})"
            )
            return 1
            
        except Exception as e:
            self._logger.error(f"Error deleting document: {e}")
            raise
    
    async def search_hybrid_with_boost(
        self,
        tenant_id: str,
        agent_id: str,
        query_dense: List[float],
        query_sparse: Optional[SparseVector],
        collection_ids: Optional[List[str]] = None,
        document_nature: Optional[str] = None,
        fact_density_boost: float = 0.3,
        limit: int = 10,
        rrf_k: int = 60
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda híbrida con Score-Boosting por fact_density usando FormulaQuery nativo.
        
        Qdrant 1.14+ permite usar FormulaQuery para hacer el boost directamente
        en el servidor, lo cual es más eficiente que hacerlo en Python.
        
        Fórmula: final_score = $score + (fact_density_boost * fact_density)
        
        Args:
            tenant_id: ID del tenant
            agent_id: ID del agente buscando
            query_dense: Vector denso de la query
            query_sparse: Vector sparse de la query (BM25)
            collection_ids: Filtrar por collections específicas
            document_nature: Filtrar por tipo de documento
            fact_density_boost: Peso del boost (0-1)
            limit: Número de resultados
            rrf_k: Parámetro k para RRF (Qdrant 1.16+, default 60)
        """
        # Construir filtros
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=tenant_id)
            ),
            FieldCondition(
                key="agent_ids",
                match=MatchAny(any=[agent_id])
            )
        ]
        
        if collection_ids:
            must_conditions.append(
                FieldCondition(
                    key="collection_id",
                    match=MatchAny(any=collection_ids)
                )
            )
        
        if document_nature:
            must_conditions.append(
                FieldCondition(
                    key="document_nature",
                    match=MatchValue(value=document_nature)
                )
            )
        
        query_filter = Filter(must=must_conditions)
        
        # Prefetch para búsqueda híbrida
        prefetch_queries = [
            Prefetch(
                query=query_dense,
                using="dense",
                limit=50,
                filter=query_filter
            )
        ]
        
        if query_sparse:
            prefetch_queries.append(
                Prefetch(
                    query=query_sparse,
                    using="bm25",
                    limit=50,
                    filter=query_filter
                )
            )
        
        try:
            # Qdrant 1.14+ FormulaQuery para Score-Boosting nativo
            # Fórmula: $score + (fact_density_boost * fact_density)
            #
            # NOTA: Si fact_density_boost es 0, usamos RRF simple sin fórmula
            if fact_density_boost > 0:
                # Usar FormulaQuery para boost nativo en Qdrant
                # Fórmula Multiplicativa: score * (1 + (fact_density_boost * fact_density))
                results = await self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=prefetch_queries,
                    query=FormulaQuery(
                        formula=MultExpression(mult=[
                            "$score",  # Score del prefetch (RRF)
                            SumExpression(sum=[
                                1.0, 
                                MultExpression(mult=[
                                    fact_density_boost,
                                    "fact_density"
                                ])
                            ])
                        ]),
                        defaults={"fact_density": 0.5}  # Default si no existe
                    ),
                    limit=limit,
                    with_payload=True
                )
            else:
                # Sin boost, usar RRF parametrizado (Qdrant 1.16+)
                results = await self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=prefetch_queries,
                    query=RrfQuery(rrf=Rrf(k=rrf_k)),
                    limit=limit,
                    with_payload=True
                )
            
            return [
                {
                    "id": point.id,
                    "score": point.score,
                    "fact_density": point.payload.get("fact_density", 0.5),
                    "payload": point.payload
                }
                for point in results.points
            ]
            
        except Exception as e:
            self._logger.error(f"Error in hybrid search with boost: {e}")
            # Fallback a búsqueda simple si FormulaQuery falla
            return await self._fallback_hybrid_search(
                query_dense=query_dense,
                query_filter=query_filter,
                fact_density_boost=fact_density_boost,
                limit=limit
            )
    
    async def _fallback_hybrid_search(
        self,
        query_dense: List[float],
        query_filter: Filter,
        fact_density_boost: float,
        limit: int
    ) -> List[Dict[str, Any]]:
        """
        Fallback para versiones anteriores de Qdrant o si FormulaQuery falla.
        Hace el boost manualmente en Python.
        """
        self._logger.warning("Using fallback hybrid search (manual boost)")
        
        results = await self.client.search(
            collection_name=self.collection_name,
            query_vector=("dense", query_dense),
            query_filter=query_filter,
            limit=limit * 2,
            with_payload=True
        )
        
        # Boost manual Multiplicativo
        boosted = []
        for point in results:
            fact_density = point.payload.get("fact_density", 0.5)
            # score * (1 + (boost * density))
            boosted_score = point.score * (1 + (fact_density_boost * fact_density))
            boosted.append({
                "id": point.id,
                "score": point.score,
                "boosted_score": boosted_score,
                "fact_density": fact_density,
                "payload": point.payload
            })
        
        boosted.sort(key=lambda x: x["boosted_score"], reverse=True)
        return boosted[:limit]
    
    async def search_in_anchors(
        self,
        tenant_id: str,
        agent_id: str,
        query_text: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda específica en search_anchors usando Full-Text.
        
        Útil cuando el usuario busca con términos que podrían estar
        en las queries sintéticas generadas por el LLM.
        """
        try:
            results = await self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=tenant_id)
                        ),
                        FieldCondition(
                            key="agent_ids",
                            match=MatchAny(any=[agent_id])
                        ),
                        FieldCondition(
                            key="search_anchors",
                            match=MatchText(text=query_text)
                        )
                    ]
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False
            )
            
            return [
                {
                    "id": point.id,
                    "payload": point.payload
                }
                for point in results[0]
            ]
            
        except Exception as e:
            self._logger.error(f"Error searching in anchors: {e}")
            return []
    
    async def search_in_facts(
        self,
        tenant_id: str,
        agent_id: str,
        query_text: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda específica en atomic_facts usando Full-Text.
        
        Útil para encontrar datos concretos como fechas, montos, nombres.
        """
        try:
            results = await self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=tenant_id)
                        ),
                        FieldCondition(
                            key="agent_ids",
                            match=MatchAny(any=[agent_id])
                        ),
                        FieldCondition(
                            key="atomic_facts",
                            match=MatchText(text=query_text)
                        )
                    ]
                ),
                limit=limit,
                with_payload=True,
                with_vectors=False
            )
            
            return [
                {
                    "id": point.id,
                    "payload": point.payload
                }
                for point in results[0]
            ]
            
        except Exception as e:
            self._logger.error(f"Error searching in facts: {e}")
            return []
    
    async def search_by_agent(
        self,
        tenant_id: str,
        agent_id: str,
        query_vector: List[float],
        collection_ids: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda simple por agente (compatibilidad legacy).
        """
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=tenant_id)
            ),
            FieldCondition(
                key="agent_ids",
                match=MatchAny(any=[agent_id])
            )
        ]
        
        if collection_ids:
            must_conditions.append(
                FieldCondition(
                    key="collection_id",
                    match=MatchAny(any=collection_ids)
                )
            )
        
        results = await self.client.search(
            collection_name=self.collection_name,
            query_vector=("dense", query_vector),
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
    
    async def search_hybrid_dbsf(
        self,
        tenant_id: str,
        agent_id: str,
        query_dense: List[float],
        query_sparse: Optional[SparseVector],
        collection_ids: Optional[List[str]] = None,
        fact_density_boost: float = 0.3,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Búsqueda híbrida con DBSF (Distribution-Based Score Fusion).
        
        DBSF (Qdrant 1.11+) normaliza scores usando mean +/- 3 std dev,
        lo cual puede dar mejores resultados que RRF en algunos casos.
        
        Combina DBSF con FormulaQuery para score-boosting por fact_density.
        """
        must_conditions = [
            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
            FieldCondition(key="agent_ids", match=MatchAny(any=[agent_id]))
        ]
        
        if collection_ids:
            must_conditions.append(
                FieldCondition(key="collection_id", match=MatchAny(any=collection_ids))
            )
        
        query_filter = Filter(must=must_conditions)
        
        prefetch_queries = [
            Prefetch(query=query_dense, using="dense", limit=50, filter=query_filter)
        ]
        
        if query_sparse:
            prefetch_queries.append(
                Prefetch(query=query_sparse, using="bm25", limit=50, filter=query_filter)
            )
        
        try:
            # DBSF fusion con score-boosting
            if fact_density_boost > 0 and len(prefetch_queries) > 1:
                # Primero fusión DBSF, luego boost
                # Esto requiere nested prefetch
                results = await self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=[
                        Prefetch(
                            prefetch=prefetch_queries,
                            query=FusionQuery(fusion=Fusion.DBSF),
                            limit=limit * 2
                        )
                    ],
                    query=FormulaQuery(
                        formula=SumExpression(sum=[
                            "$score",
                            MultExpression(mult=[fact_density_boost, "fact_density"])
                        ]),
                        defaults={"fact_density": 0.5}
                    ),
                    limit=limit,
                    with_payload=True
                )
            else:
                # Solo DBSF sin boost
                results = await self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=prefetch_queries,
                    query=FusionQuery(fusion=Fusion.DBSF),
                    limit=limit,
                    with_payload=True
                )
            
            return [
                {
                    "id": point.id,
                    "score": point.score,
                    "fact_density": point.payload.get("fact_density", 0.5),
                    "payload": point.payload
                }
                for point in results.points
            ]
            
        except Exception as e:
            self._logger.error(f"Error in DBSF search: {e}")
            raise
    
    async def update_chunk_agents(
        self,
        tenant_id: str,
        document_id: str,
        agent_ids: List[str],
        operation: str = "set"
    ) -> bool:
        """Actualiza la lista de agentes con acceso a un documento."""
        try:
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
                limit=1000
            )
            
            if not chunks[0]:
                return False
            
            for chunk in chunks[0]:
                current_agents = chunk.payload.get("agent_ids", [])
                
                if operation == "set":
                    new_agents = agent_ids
                elif operation == "add":
                    new_agents = list(set(current_agents + agent_ids))
                elif operation == "remove":
                    new_agents = [a for a in current_agents if a not in agent_ids]
                else:
                    raise ValueError(f"Invalid operation: {operation}")
                
                await self.client.set_payload(
                    collection_name=self.collection_name,
                    payload={"agent_ids": new_agents},
                    points=[chunk.id]
                )
            
            self._logger.info(
                f"Updated agent access for document {document_id}: "
                f"operation={operation}, agents={agent_ids}"
            )
            return True
            
        except Exception as e:
            self._logger.error(f"Error updating agents: {e}")
            return False
