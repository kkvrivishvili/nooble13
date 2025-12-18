"""
Modelos para WebSocket unificado.
Compatible con FastAPI WebSocket y reutilizable entre servicios.
"""
import uuid
from typing import Optional, Dict, Any, Literal, Union
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from enum import Enum


class WebSocketMessageType(str, Enum):
    """Tipos de mensajes WebSocket base."""
    # Connection management
    CONNECTION_ACK = "connection_ack"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    
    # Generic message types - specific services can extend this
    MESSAGE = "message"
    RESPONSE = "response"
    STREAMING = "streaming"
    PROGRESS = "progress"
    COMPLETE = "complete"


class WebSocketMessage(BaseModel):
    """Mensaje base para WebSocket."""
    message_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    message_type: Union[WebSocketMessageType, str] = Field(...)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data: Optional[Dict[str, Any]] = Field(default=None)
    
    # Context information
    session_id: Optional[uuid.UUID] = Field(default=None)
    task_id: Optional[uuid.UUID] = Field(default=None)
    
    model_config = {"extra": "forbid"}


# Specific message classes should be defined in service-specific modules
# This base module only provides the generic WebSocketMessage class


class ConnectionInfo(BaseModel):
    """Información de conexión WebSocket."""
    connection_id: str = Field(...)
    connection_type: Literal["chat", "ingestion"] = Field(...)
    connected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Authentication info
    is_authenticated: bool = Field(default=False)
    user_id: Optional[uuid.UUID] = Field(default=None)
    tenant_id: Optional[uuid.UUID] = Field(default=None)
    
    # Session info
    session_id: Optional[uuid.UUID] = Field(default=None)
    agent_id: Optional[uuid.UUID] = Field(default=None)
    
    model_config = {"extra": "forbid"}


class WebSocketError(BaseModel):
    """Error específico para WebSocket."""
    error_code: str = Field(...)
    error_message: str = Field(...)
    error_type: Literal["auth", "validation", "rate_limit", "internal", "not_found"] = Field(...)
    details: Optional[Dict[str, Any]] = Field(default=None)
    
    model_config = {"extra": "forbid"}


# Type unions for convenience
# Service-specific message types should be defined in their respective modules
AnyWebSocketMessage = WebSocketMessage  # Base type only
