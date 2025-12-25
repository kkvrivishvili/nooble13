"""
Handler para preprocesamiento agnóstico de documentos con LLM.

Implementa las 4 técnicas avanzadas:
1. Contextual Injected Chunking - contextual_prefix mejora embeddings
2. Search Anchors - queries sintéticas mejoran BM25/Full-Text
3. Fact Density - métrica objetiva para Score-Boosting
4. Entity Normalization - entidades estructuradas para filtrado

El flujo es:
1. Generar contexto del documento (UNA VEZ)
2. Para cada chunk:
   a. Llamar al LLM para enriquecer
   b. Parsear respuesta JSON
   c. Crear EnrichedChunk

El embedding se genera del content_contextualized, NO del content_raw.
"""

import logging
import uuid
from typing import List, Dict, Any, Tuple, Optional

from common.handlers.base_handler import BaseHandler

from ..clients.groq_client import GroqClient, GroqClientError
from ..prompts.document_preprocess import (
    build_document_context_input,
    build_chunk_enrichment_input
)
from ..models.preprocessing_models import (
    DocumentContext,
    EnrichedChunk,
    PreprocessingResult,
    parse_document_context_response,
    parse_chunk_enrichment_response,
    create_enriched_chunk
)
from ..config.settings import IngestionSettings


# Constantes
DEFAULT_TOKENS_PER_BLOCK = 3000
CHARS_PER_TOKEN = 4


class AgnosticPreprocessHandler(BaseHandler):
    """
    Handler para preprocesamiento agnóstico de documentos.
    
    Genera EnrichedChunks con:
    - content_contextualized: Para embeddings (incluye contextual_prefix)
    - search_anchors: Para BM25 + Full-Text
    - atomic_facts: Para búsqueda exacta
    - fact_density: Para Score-Boosting
    - normalized_entities: Para filtrado
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        groq_client: Optional[GroqClient] = None
    ):
        """
        Inicializa el handler.
        
        Args:
            app_settings: Configuración de la aplicación
            groq_client: Cliente Groq (opcional, se crea si no se proporciona)
        """
        super().__init__(app_settings)
        
        self.enabled = getattr(app_settings, 'enable_document_preprocessing', True)
        self.model = getattr(app_settings, 'preprocessing_model', 'deepseek-r1-distill-llama-70b')
        self.max_tokens_per_block = getattr(
            app_settings, 
            'preprocessing_max_tokens_per_block', 
            DEFAULT_TOKENS_PER_BLOCK
        )
        
        # Cache de contextos de documentos
        self._document_contexts: Dict[str, DocumentContext] = {}
        
        # Inicializar cliente Groq
        self.groq_client = groq_client
        if self.enabled and not self.groq_client:
            groq_api_key = getattr(app_settings, 'groq_api_key', None)
            if groq_api_key:
                self.groq_client = GroqClient(api_key=groq_api_key)
            else:
                self._logger.warning(
                    "Preprocessing enabled but no Groq API key provided. "
                    "Preprocessing will be disabled."
                )
                self.enabled = False
        
        self._logger.info(
            f"AgnosticPreprocessHandler initialized",
            extra={
                "enabled": self.enabled,
                "model": self.model,
                "max_tokens_per_block": self.max_tokens_per_block
            }
        )
    
    async def generate_document_context(
        self,
        document_id: str,
        document_name: str,
        document_text: str,
        max_chars: int = 15000
    ) -> DocumentContext:
        """
        Genera contexto del documento completo.
        Se ejecuta UNA VEZ por documento antes de procesar chunks.
        
        Args:
            document_id: ID del documento
            document_name: Nombre del documento
            document_text: Texto completo del documento
            max_chars: Máximo de caracteres a enviar al LLM
            
        Returns:
            DocumentContext con summary, main_topics, etc.
        """
        # Verificar cache
        if document_id in self._document_contexts:
            self._logger.debug(f"Using cached context for document {document_id}")
            return self._document_contexts[document_id]
        
        self._logger.info(f"--- [AGNOSTIC] Generating document context for: {document_name} ---")
        
        try:
            # Construir prompt
            prompt = build_document_context_input(document_text, max_chars)
            
            # Llamar al LLM
            raw_output, usage = await self.groq_client.preprocess_document(
                system_prompt="Eres un analizador de documentos. Responde SOLO con JSON válido.",
                content=prompt,
                model=self.model
            )
            
            # Parsear respuesta
            data = parse_document_context_response(raw_output)
            
            # Crear contexto
            context = DocumentContext(
                document_id=document_id,
                document_name=document_name,
                summary=data.get("summary", f"Documento: {document_name}"),
                main_topics=data.get("main_topics", []),
                document_type=data.get("document_type", "other"),
                key_entities=data.get("key_entities", []),
                language=data.get("language", "es")
            )
            
            # Cachear
            self._document_contexts[document_id] = context
            
            self._logger.info(
                f"Document context generated successfully",
                extra={
                    "document_id": document_id,
                    "document_type": context.document_type,
                    "topics_count": len(context.main_topics),
                    "summary_length": len(context.summary),
                    "tokens_used": usage.get("total_tokens", 0)
                }
            )
            
            return context
            
        except Exception as e:
            self._logger.error(f"Error generating document context: {e}")
            # Fallback
            return DocumentContext(
                document_id=document_id,
                document_name=document_name,
                summary=f"Documento: {document_name}",
                main_topics=[],
                document_type="other",
                key_entities=[],
                language="es"
            )
    
    async def enrich_chunk(
        self,
        chunk_content: str,
        chunk_id: str,
        document_id: str,
        chunk_index: int,
        document_context: DocumentContext
    ) -> Tuple[EnrichedChunk, Dict[str, int]]:
        """
        Enriquece un chunk individual con las técnicas agnósticas.
        
        Args:
            chunk_content: Contenido del chunk
            chunk_id: ID del chunk
            document_id: ID del documento
            chunk_index: Índice del chunk
            document_context: Contexto del documento (generado previamente)
            
        Returns:
            Tuple de (EnrichedChunk, usage_dict)
        """
        self._logger.debug(
            f"Enriching chunk {chunk_index}",
            extra={"chunk_id": chunk_id, "content_length": len(chunk_content)}
        )
        
        try:
            # Construir prompt con contexto del documento
            prompt = build_chunk_enrichment_input(
                chunk_content=chunk_content,
                document_summary=document_context.summary,
                use_simple=len(chunk_content) < 300,
                document_name=document_context.document_name
            )
            
            # Llamar al LLM
            raw_output, usage = await self.groq_client.preprocess_document(
                system_prompt="Eres un analizador de contenido para búsqueda semántica. Responde SOLO con JSON válido.",
                content=prompt,
                model=self.model
            )
            
            # Parsear respuesta
            enrichment_data = parse_chunk_enrichment_response(raw_output)
            
            # Agregar language del contexto del documento
            enrichment_data["language"] = document_context.language
            
            # Crear EnrichedChunk
            enriched = create_enriched_chunk(
                chunk_content=chunk_content,
                chunk_id=chunk_id,
                document_id=document_id,
                chunk_index=chunk_index,
                enrichment_data=enrichment_data
            )
            
            self._logger.debug(
                f"Chunk enriched successfully",
                extra={
                    "chunk_id": chunk_id,
                    "fact_density": enriched.fact_density,
                    "search_anchors_count": len(enriched.search_anchors),
                    "atomic_facts_count": len(enriched.atomic_facts)
                }
            )
            
            return enriched, usage
            
        except Exception as e:
            self._logger.error(f"Error enriching chunk {chunk_id}: {e}")
            # Fallback: crear chunk con valores por defecto
            return self._create_fallback_chunk(
                chunk_content, chunk_id, document_id, chunk_index, document_context
            ), {"total_tokens": 0}
    
    async def preprocess_document(
        self,
        chunks: List[Dict[str, Any]],
        document_id: str,
        document_name: str,
        document_text: str
    ) -> PreprocessingResult:
        """
        Preprocesa un documento completo.
        
        Flujo:
        1. Generar contexto del documento (UNA VEZ)
        2. Enriquecer cada chunk
        3. Retornar resultado con estadísticas
        
        Args:
            chunks: Lista de dicts con {content, chunk_id, chunk_index}
            document_id: ID del documento
            document_name: Nombre del documento
            document_text: Texto completo (para generar contexto)
            
        Returns:
            PreprocessingResult con chunks enriquecidos
        """
        result = PreprocessingResult(
            document_name=document_name,
            document_type="",
            was_preprocessed=False
        )
        
        if not self.enabled:
            self._logger.info("Preprocessing disabled, returning empty result")
            return result
        
        self._logger.info(
            f"--- [AGNOSTIC PREPROCESS START] ---",
            extra={
                "document_name": document_name,
                "document_id": document_id,
                "chunks_count": len(chunks)
            }
        )
        
        try:
            # 1. Generar contexto del documento
            document_context = await self.generate_document_context(
                document_id=document_id,
                document_name=document_name,
                document_text=document_text
            )
            
            result.document_context = document_context
            result.document_type = document_context.document_type
            
            # 2. Enriquecer cada chunk
            enriched_chunks: List[EnrichedChunk] = []
            total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            
            for i, chunk_data in enumerate(chunks):
                try:
                    enriched, usage = await self.enrich_chunk(
                        chunk_content=chunk_data["content"],
                        chunk_id=chunk_data.get("chunk_id", f"{document_id}_{i}"),
                        document_id=document_id,
                        chunk_index=chunk_data.get("chunk_index", i),
                        document_context=document_context
                    )
                    
                    enriched_chunks.append(enriched)
                    
                    # Acumular tokens
                    for key in total_usage:
                        total_usage[key] += usage.get(key, 0)
                        
                except Exception as e:
                    error_msg = f"Chunk {i} failed: {str(e)}"
                    self._logger.error(error_msg)
                    result.processing_errors.append(error_msg)
                    
                    # Fallback para este chunk
                    fallback = self._create_fallback_chunk(
                        chunk_data["content"],
                        chunk_data.get("chunk_id", f"{document_id}_{i}"),
                        document_id,
                        chunk_data.get("chunk_index", i),
                        document_context
                    )
                    enriched_chunks.append(fallback)
            
            # 3. Calcular estadísticas
            result.chunks = enriched_chunks
            result.total_chunks = len(enriched_chunks)
            result.llm_usage = total_usage
            result.was_preprocessed = True
            
            if enriched_chunks:
                result.avg_fact_density = sum(c.fact_density for c in enriched_chunks) / len(enriched_chunks)
                result.total_search_anchors = sum(len(c.search_anchors) for c in enriched_chunks)
                result.total_atomic_facts = sum(len(c.atomic_facts) for c in enriched_chunks)
            
            self._logger.info(
                f"--- [AGNOSTIC PREPROCESS COMPLETE] ---",
                extra={
                    "document_name": document_name,
                    "total_chunks": result.total_chunks,
                    "avg_fact_density": round(result.avg_fact_density, 2),
                    "total_search_anchors": result.total_search_anchors,
                    "total_atomic_facts": result.total_atomic_facts,
                    "total_tokens": total_usage.get("total_tokens", 0),
                    "errors": len(result.processing_errors)
                }
            )
            
            return result
            
        except Exception as e:
            self._logger.error(f"Document preprocessing failed: {e}", exc_info=True)
            result.processing_errors.append(f"Complete failure: {str(e)}")
            return result
    
    def _create_fallback_chunk(
        self,
        chunk_content: str,
        chunk_id: str,
        document_id: str,
        chunk_index: int,
        document_context: DocumentContext
    ) -> EnrichedChunk:
        """
        Crea un chunk con valores por defecto cuando falla el enriquecimiento.
        """
        # Crear un prefijo básico del contexto del documento
        prefix = f"En el documento '{document_context.document_name}'"
        if document_context.document_type != "other":
            prefix += f" (tipo: {document_context.document_type})"
        prefix += ":"
        
        return EnrichedChunk(
            chunk_id=chunk_id,
            document_id=document_id,
            chunk_index=chunk_index,
            content_raw=chunk_content,
            content_contextualized=f"{prefix}\n\n{chunk_content}",
            contextual_prefix=prefix,
            search_anchors=[],  # Sin enriquecimiento
            atomic_facts=[],
            fact_density=0.3,  # Valor conservador
            normalized_entities={},
            document_nature=document_context.document_type,
            word_count=len(chunk_content.split()),
            language=document_context.language
        )
    
    def clear_cache(self, document_id: Optional[str] = None):
        """
        Limpia el cache de contextos de documentos.
        
        Args:
            document_id: ID específico a limpiar, o None para limpiar todo
        """
        if document_id:
            self._document_contexts.pop(document_id, None)
        else:
            self._document_contexts.clear()


# Alias para compatibilidad
PreprocessHandler = AgnosticPreprocessHandler
