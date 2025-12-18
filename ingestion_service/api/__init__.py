"""
API routes y dependencias para Ingestion Service.
"""

from .dependencies import (
    get_ingestion_service,
    get_websocket_manager,
    get_settings
)
from .health_routes import router as health_router
from .ingestion_routes import router as ingestion_router
from .websocket_routes import router as websocket_router

__all__ = [
    "get_ingestion_service",
    "get_websocket_manager", 
    "get_settings",
    "health_router",
    "ingestion_router",
    "websocket_router"
]
