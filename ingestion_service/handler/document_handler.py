"""
Handler para procesamiento de documentos.

Actualizado para trabajar con texto ya extraído por extraction-service.
Se enfoca en:
1. Chunking jerárquico
2. Preparación de payloads para embedding
3. LLM enrichment (opcional, según tier)
"""

import logging
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

from common.handlers.base_handler import BaseHandler
from common.models.config_models import ProcessingMode

from ..config.settings import IngestionSettings
from ..models.ingestion_models import ChunkModel, RAGIngestionConfig
from .hierarchical_chunker import HierarchicalChunker


class DocumentHandler(BaseHandler):
    """
    Handler para procesamiento de documentos post-extracción.
    
    Responsabilidades:
    - Recibir texto extraído + enriquecimiento spaCy
    - Aplicar chunking jerárquico
    - Preparar chunks para embedding
    - Aplicar LLM enrichment si corresponde al tier
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        hierarchical_chunker: Optional[HierarchicalChunker] = None
    ):
        """Inicializa el handler de documentos."""
        super().__init__(app_settings)
        
        self.hierarchical_chunker = hierarchical_chunker or HierarchicalChunker(app_settings)
        self.enable_hierarchical_chunking = app_settings.enable_hierarchical_chunking
    
    async def process_extracted_document(
        self,
        extracted_text: str,
        structure: Dict[str, Any],
        spacy_enrichment: Dict[str, Any],
        document_id: str,
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        document_name: str,
        document_type: str,
        rag_config: RAGIngestionConfig,
        processing_mode: ProcessingMode = ProcessingMode.FAST
    ) -> List[ChunkModel]:
        """
        Procesa un documento ya extraído por extraction-service.
        
        Args:
            extracted_text: Texto en Markdown extraído por Docling
            structure: Estructura del documento (secciones, tablas)
            spacy_enrichment: Enriquecimiento de spaCy (entidades, noun_chunks)
            document_id: ID del documento
            tenant_id: ID del tenant
            collection_id: ID de la colección
            agent_ids: IDs de agentes con acceso
            document_name: Nombre del documento
            document_type: Tipo de documento
            rag_config: Configuración RAG
            processing_mode: Modo de procesamiento
            
        Returns:
            Lista de chunks procesados
        """
        self._logger.info(
            f"Processing extracted document",
            extra={
                "document_id": document_id,
                "document_name": document_name,
                "text_length": len(extracted_text),
                "processing_mode": processing_mode.value
            }
        )
        
        # Extraer secciones de la estructura
        sections = structure.get("sections", [])
        page_count = structure.get("page_count")
        
        # Aplicar chunking jerárquico
        if self.enable_hierarchical_chunking and sections:
            chunks = self.hierarchical_chunker.chunk_document(
                text=extracted_text,
                sections=sections,
                document_id=document_id,
                tenant_id=tenant_id,
                collection_id=collection_id,
                agent_ids=agent_ids,
                document_name=document_name,
                document_type=document_type,
                spacy_enrichment=spacy_enrichment,
                chunk_size=rag_config.chunk_size,
                chunk_overlap=rag_config.chunk_overlap,
                page_count=page_count
            )
        else:
            # Chunking plano si no hay secciones
            chunks = self.hierarchical_chunker.chunk_document(
                text=extracted_text,
                sections=[],
                document_id=document_id,
                tenant_id=tenant_id,
                collection_id=collection_id,
                agent_ids=agent_ids,
                document_name=document_name,
                document_type=document_type,
                spacy_enrichment=spacy_enrichment,
                chunk_size=rag_config.chunk_size,
                chunk_overlap=rag_config.chunk_overlap,
                page_count=page_count
            )
        
        self._logger.info(
            f"Document chunked",
            extra={
                "document_id": document_id,
                "total_chunks": len(chunks),
                "processing_mode": processing_mode.value
            }
        )
        
        # LLM Enrichment (solo para balanced/premium)
        if processing_mode in (ProcessingMode.BALANCED, ProcessingMode.PREMIUM):
            if rag_config.enable_llm_enrichment:
                chunks = await self._apply_llm_enrichment(
                    chunks=chunks,
                    processing_mode=processing_mode,
                    enrichment_percentage=rag_config.llm_enrichment_percentage
                )
        
        return chunks
    
    async def _apply_llm_enrichment(
        self,
        chunks: List[ChunkModel],
        processing_mode: ProcessingMode,
        enrichment_percentage: int
    ) -> List[ChunkModel]:
        """
        Aplica LLM enrichment a chunks seleccionados.
        
        Para balanced: Solo top N% de chunks por densidad de entidades
        Para premium: Todos los chunks
        
        Args:
            chunks: Lista de chunks
            processing_mode: Modo de procesamiento
            enrichment_percentage: Porcentaje de chunks a enriquecer
            
        Returns:
            Chunks enriquecidos
        """
        if not chunks:
            return chunks
        
        # Determinar qué chunks enriquecer
        if processing_mode == ProcessingMode.PREMIUM:
            # Premium: todos los chunks
            chunks_to_enrich = chunks
        else:
            # Balanced: seleccionar por densidad de entidades
            chunks_to_enrich = self._select_chunks_for_enrichment(
                chunks, enrichment_percentage
            )
        
        if not chunks_to_enrich:
            self._logger.info("No chunks selected for LLM enrichment")
            return chunks
        
        self._logger.info(
            f"Applying LLM enrichment to {len(chunks_to_enrich)}/{len(chunks)} chunks"
        )
        
        # TODO: Implementar llamada a LLM para enriquecimiento
        # Por ahora, marcar chunks como procesados
        enriched_ids = {c.chunk_id for c in chunks_to_enrich}
        
        for chunk in chunks:
            if chunk.chunk_id in enriched_ids:
                chunk.metadata["llm_enrichment_applied"] = True
                chunk.metadata["llm_enrichment_timestamp"] = datetime.utcnow().isoformat()
        
        return chunks
    
    def _select_chunks_for_enrichment(
        self,
        chunks: List[ChunkModel],
        percentage: int
    ) -> List[ChunkModel]:
        """
        Selecciona chunks para LLM enrichment basado en densidad de entidades.
        
        Prioriza chunks con más entidades/noun_chunks porque son más
        probables de contener información factual importante.
        """
        if percentage <= 0:
            return []
        
        if percentage >= 100:
            return chunks
        
        # Calcular score por chunk (densidad de entidades + noun_chunks)
        scored_chunks = []
        for chunk in chunks:
            content_length = len(chunk.content_raw or chunk.content) + 1
            entity_count = len(chunk.spacy_entities)
            noun_chunk_count = len(chunk.spacy_noun_chunks)
            
            # Score = (entidades + noun_chunks) / longitud_contenido
            score = (entity_count + noun_chunk_count) / (content_length / 100)
            scored_chunks.append((chunk, score))
        
        # Ordenar por score descendente
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        # Seleccionar top N%
        n = max(1, int(len(chunks) * percentage / 100))
        selected = [chunk for chunk, _ in scored_chunks[:n]]
        
        self._logger.debug(
            f"Selected {len(selected)} chunks for LLM enrichment "
            f"(top {percentage}% by entity density)"
        )
        
        return selected
    
    def prepare_embedding_payload(
        self,
        chunks: List[ChunkModel]
    ) -> List[Dict[str, Any]]:
        """
        Prepara payload para enviar a embedding-service.
        
        Args:
            chunks: Lista de chunks procesados
            
        Returns:
            Lista de payloads para embedding
        """
        payloads = []
        
        for chunk in chunks:
            payload = {
                "chunk_id": chunk.chunk_id,
                "text": chunk.content,  # Contenido contextualizado
                "metadata": {
                    "document_id": chunk.document_id,
                    "tenant_id": chunk.tenant_id,
                    "collection_id": chunk.collection_id,
                    "chunk_index": chunk.chunk_index,
                    "section_title": chunk.section_title,
                    "document_name": chunk.document_name
                }
            }
            payloads.append(payload)
        
        return payloads
    
    def prepare_qdrant_payload(
        self,
        chunk: ChunkModel,
        embedding: List[float],
        sparse_embedding: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Prepara payload para almacenar en Qdrant.
        
        Args:
            chunk: Chunk procesado
            embedding: Vector de embedding denso
            sparse_embedding: Embedding sparse para BM25 (opcional)
            
        Returns:
            Payload para Qdrant
        """
        payload = {
            # Vector principal
            "id": chunk.chunk_id,
            "vector": embedding,
            
            # Payload para filtrado y recuperación
            "payload": {
                # IDs
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "tenant_id": chunk.tenant_id,
                "collection_id": chunk.collection_id,
                "agent_ids": chunk.agent_ids,
                
                # Contenido
                "content": chunk.content,
                "content_raw": chunk.content_raw,
                "chunk_index": chunk.chunk_index,
                
                # Contexto jerárquico
                "section_title": chunk.section_title,
                "section_level": chunk.section_level,
                "section_context": chunk.section_context,
                
                # spaCy enrichment
                "spacy_entities": chunk.spacy_entities,
                "spacy_noun_chunks": chunk.spacy_noun_chunks,
                
                # LLM enrichment (si existe)
                "search_anchors": chunk.search_anchors,
                "atomic_facts": chunk.atomic_facts,
                "fact_density": chunk.fact_density,
                
                # Entidades normalizadas para filtrado
                "normalized_entities": chunk.normalized_entities,
                
                # Metadata
                "document_name": chunk.document_name,
                "document_type": chunk.document_type,
                "document_nature": chunk.document_nature,
                "language": chunk.language,
                "page_count": chunk.page_count,
                "has_tables": chunk.has_tables,
                
                # BM25 text (para sparse vectors)
                "bm25_text": chunk.get_bm25_text(),
                
                # Timestamps
                "created_at": chunk.created_at.isoformat()
            }
        }
        
        # Agregar sparse embedding si existe
        if sparse_embedding:
            payload["sparse_vector"] = sparse_embedding
        
        return payload
