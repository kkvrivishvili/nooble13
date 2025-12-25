"""
Servicios principales del Ingestion Service.
"""



from .document_preprocess import (
    DOCUMENT_CONTEXT_PROMPT,
    CHUNK_ENRICHMENT_PROMPT,
    CHUNK_ENRICHMENT_SIMPLE_PROMPT,
    ChunkProcessingContext,
    build_document_context_input,
    build_chunk_enrichment_input,
    get_document_context_prompt,
    get_chunk_enrichment_prompt
)

__all__ = [
    "DOCUMENT_CONTEXT_PROMPT",
    "CHUNK_ENRICHMENT_PROMPT",
    "CHUNK_ENRICHMENT_SIMPLE_PROMPT",
    "ChunkProcessingContext",
    "build_document_context_input",
    "build_chunk_enrichment_input",
    "get_document_context_prompt",
    "get_chunk_enrichment_prompt"
]
