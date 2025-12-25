"""
Clientes para servicios externos.
"""

from .embedding_client import EmbeddingClient
from .groq_client import GroqClient, GroqClientError

__all__ = [
    "EmbeddingClient",
    "GroqClient",
    "GroqClientError"
]
