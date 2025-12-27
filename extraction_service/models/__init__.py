"""
Modelos para Extraction Service.
"""

from .extraction_models import (
    ProcessingMode,
    SpacyModelSize,
    ExtractionRequest,
    ExtractionResult,
    DocumentStructure,
    SectionInfo,
    SpacyEnrichment,
    EntityInfo,
    ExtractionStatus,
    ExtractionError
)

__all__ = [
    "ProcessingMode",
    "SpacyModelSize",
    "ExtractionRequest",
    "ExtractionResult",
    "DocumentStructure",
    "SectionInfo",
    "SpacyEnrichment",
    "EntityInfo",
    "ExtractionStatus",
    "ExtractionError"
]
