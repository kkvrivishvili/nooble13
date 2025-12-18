"""
Modelos del Orchestrator Service.
Reutiliza modelos de common y agrega extensiones específicas.
"""
from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# Re-exportar modelos de common
from common.models.chat_models import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    ConversationHistory,
    SessionType,
    ChatInitRequest,
    ChatInitResponse,
    TokenUsage,
    OrchestratorMessageType
)

# Extensión de ConversationHistory para orchestrator
class OrchestratorSession(ConversationHistory):
    """
    Extensión de ConversationHistory con campos específicos del orchestrator.
    """
    # Campos adicionales para gestión de tareas
    total_tasks: int = Field(default=0, description="Total de tareas creadas")
    active_task_id: Optional[uuid.UUID] = Field(default=None, description="Task actualmente en proceso")
    
    # Campos para WebSocket
    connection_id: Optional[str] = Field(default=None, description="ID de conexión WebSocket actual")
    websocket_connected: bool = Field(default=False, description="Si hay WebSocket activo")
    
    # Tracking adicional
    last_activity: datetime = Field(default_factory=datetime.utcnow, description="Última actividad")
    
    def update_activity(self):
        """Actualiza timestamp de última actividad."""
        self.last_activity = datetime.utcnow()
        self.updated_at = datetime.utcnow()


__all__ = [
    # Re-exports from common
    "ChatRequest",
    "ChatResponse", 
    "ChatMessage",
    "ConversationHistory",
    "SessionType",
    "ChatInitRequest",
    "ChatInitResponse",
    "TokenUsage",
    "OrchestratorMessageType",
    # Local extensions
    "OrchestratorSession",
]