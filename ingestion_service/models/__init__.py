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

__all__ = [
    "IngestionStatus",
    "DocumentType", 
    "RAGIngestionConfig",
    "DocumentIngestionRequest",
    "IngestionResponse",
    "IngestionProgress",
    "ChunkModel"
]