"""
Modelos de datos para conversaciones.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
import uuid


class Conversation(BaseModel):
    """Modelo de conversación para CRM."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str = Field(..., description="ID único de la conversación")
    tenant_id: str = Field(..., description="ID del tenant")
    session_id: str = Field(..., description="ID de la sesión")
    agent_id: str = Field(..., description="ID del agente")
    
    started_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    ended_at: Optional[datetime] = None
    is_active: bool = Field(default=True)
    message_count: int = Field(default=0)


class Message(BaseModel):
    """Modelo de mensaje para CRM."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str = Field(..., description="ID de la conversación")
    role: str = Field(..., description="Rol: user o assistant")
    content: str = Field(..., description="Contenido del mensaje")
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    metadata: Dict[str, Any] = Field(default_factory=dict)