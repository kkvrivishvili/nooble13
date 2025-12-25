"""
Modelos para Ingestion Service.
"""

from .ingestion_models import (
    IngestionStatus,
    DocumentType,
    RAGIngestionConfig,  # Renombrado de RAGConfigRequest
    DocumentIngestionRequest,
    IngestionResponse,
    IngestionProgress,
    ChunkModel
)
from .preprocessing_models import (
    DocumentNature,
    DocumentContext,
    EnrichedChunk,
    PreprocessingResult,
    parse_document_context_response,
    parse_chunk_enrichment_response,
    create_enriched_chunk
)

__all__ = [
    "IngestionStatus",
    "DocumentType", 
    "RAGIngestionConfig",
    "DocumentIngestionRequest",
    "IngestionResponse",
    "IngestionProgress",
    "ChunkModel",
    "DocumentNature",
    "DocumentContext",
    "EnrichedChunk",
    "PreprocessingResult",
    "parse_document_context_response",
    "parse_chunk_enrichment_response",
    "create_enriched_chunk"
]