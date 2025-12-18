"""API routes del Orchestrator Service."""
from .chat_routes import router as chat_router
from .websocket_routes import router as websocket_router  
from .health_routes import router as health_router
from .dependencies import set_dependencies

__all__ = [
    "chat_router",
    "websocket_router",
    "health_router",
    "set_dependencies",
]