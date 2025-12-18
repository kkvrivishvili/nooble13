"""
Modelos de datos para Supabase.
Define las estructuras de datos que se obtienen de la base de datos.
"""
import uuid
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

from ..models.config_models import ExecutionConfig, QueryConfig, RAGConfig


class AgentConfig(BaseModel):
    """
    Configuración completa de un agente desde Supabase.
    Incluye todas las configuraciones necesarias para los servicios.
    """
    agent_id: uuid.UUID = Field(..., description="ID único del agente")
    agent_name: str = Field(..., description="Nombre del agente")
    tenant_id: uuid.UUID = Field(..., description="ID del tenant propietario")
    
    # Configuraciones específicas (almacenadas como JSON en Supabase)
    execution_config: ExecutionConfig = Field(..., description="Configuración para execution service")
    query_config: QueryConfig = Field(..., description="Configuración para query service")
    rag_config: RAGConfig = Field(..., description="Configuración para RAG")
    
    # Timestamps
    created_at: datetime = Field(..., description="Fecha de creación")
    updated_at: datetime = Field(..., description="Fecha de última actualización")
    
    model_config = {"extra": "forbid"}


class TenantInfo(BaseModel):
    """
    Información de un tenant desde Supabase.
    """
    id: uuid.UUID = Field(..., description="ID único del tenant")
    name: str = Field(..., description="Nombre del tenant")
    plan_type: str = Field(default="free", description="Tipo de plan (free, pro, enterprise)")
    settings: Dict[str, Any] = Field(default_factory=dict, description="Configuraciones específicas del tenant")
    
    # Timestamps
    created_at: datetime = Field(..., description="Fecha de creación")
    updated_at: datetime = Field(..., description="Fecha de última actualización")
    
    model_config = {"extra": "forbid"}


class UserInfo(BaseModel):
    """
    Información de usuario desde Supabase Auth.
    """
    id: uuid.UUID = Field(..., description="ID único del usuario")
    email: str = Field(..., description="Email del usuario")
    user_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata del usuario")
    app_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata de la aplicación")
    
    # Timestamps
    created_at: datetime = Field(..., description="Fecha de creación")
    updated_at: Optional[datetime] = Field(default=None, description="Fecha de última actualización")
    
    model_config = {"extra": "forbid"}
    
    @property
    def full_name(self) -> Optional[str]:
        """Obtiene el nombre completo del usuario desde metadata."""
        return self.user_metadata.get("full_name")
    
    @property
    def username(self) -> str:
        """Obtiene un username derivado del email o metadata."""
        if "username" in self.user_metadata:
            return self.user_metadata["username"]
        return self.email.split("@")[0]


class IngestionMetadata(BaseModel):
    """
    Metadata de ingestion guardada en Supabase.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, description="ID único del registro")
    document_id: str = Field(..., description="ID del documento en Qdrant")
    collection_id: str = Field(..., description="ID de la colección en Qdrant")
    tenant_id: uuid.UUID = Field(..., description="ID del tenant")
    
    # Información del procesamiento
    chunks_count: int = Field(..., ge=0, description="Número de chunks procesados")
    status: str = Field(default="completed", description="Estado de la ingestion")
    
    # Información del archivo original
    file_name: Optional[str] = Field(default=None, description="Nombre del archivo original")
    file_size: Optional[int] = Field(default=None, ge=0, description="Tamaño del archivo en bytes")
    
    # Metadata adicional
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")
    
    # Timestamps
    ingested_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de ingestion")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de creación del registro")
    
    model_config = {"extra": "forbid"}


class UserTenantRelation(BaseModel):
    """
    Relación entre usuario y tenant.
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, description="ID único de la relación")
    user_id: uuid.UUID = Field(..., description="ID del usuario")
    tenant_id: uuid.UUID = Field(..., description="ID del tenant")
    role: str = Field(default="member", description="Rol del usuario en el tenant")
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de creación")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de actualización")
    
    model_config = {"extra": "forbid"}