"""
Handlers para extracción de documentos.
"""

from .docling_handler import DoclingHandler
from .spacy_handler import SpacyHandler
from .fallback_handler import FallbackHandler

__all__ = [
    "DoclingHandler",
    "SpacyHandler",
    "FallbackHandler"
]
