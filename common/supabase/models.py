"""
Modelos de datos para Supabase.
Define las estructuras de datos que se obtienen de la base de datos.
"""
import uuid
from typing import Optional, Dict, Any, List
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
    tenant_id: uuid.UUID = Field(
        ..., 
        alias="user_id", 
        validation_alias="user_id", 
        serialization_alias="user_id",
        description="ID del usuario propietario (mapeado a user_id en DB)"
    )
    
    # Configuraciones específicas (almacenadas como JSON en Supabase)
    execution_config: ExecutionConfig = Field(..., description="Configuración para execution service")
    query_config: QueryConfig = Field(..., description="Configuración para query service")
    rag_config: RAGConfig = Field(..., description="Configuración para RAG")
    
    # Timestamps
    created_at: datetime = Field(..., description="Fecha de creación")
    updated_at: datetime = Field(..., description="Fecha de última actualización")
    
    model_config = {"extra": "forbid", "populate_by_name": True}


class SubscriptionInfo(BaseModel):
    """
    Información de suscripción del usuario.
    """
    tenant_id: uuid.UUID = Field(
        ..., 
        alias="user_id", 
        validation_alias="user_id", 
        serialization_alias="user_id",
        description="ID del usuario"
    )
    plan_id: str = Field(..., description="ID del plan actual")
    status: str = Field(..., description="Estado de la suscripción (active, trialing, past_due, canceled)")
    current_period_end: datetime = Field(..., description="Fecha de fin del periodo actual")
    cancel_at_period_end: bool = Field(default=False, description="Si se cancelará al final del periodo")
    
    model_config = {"extra": "forbid", "populate_by_name": True}


class UsageMetrics(BaseModel):
    """
    Métricas de uso del usuario.
    """
    tenant_id: uuid.UUID = Field(
        ..., 
        alias="user_id", 
        validation_alias="user_id", 
        serialization_alias="user_id",
        description="ID del usuario"
    )
    messages_count: int = Field(default=0, description="Número de mensajes enviados este mes")
    conversations_count: int = Field(default=0, description="Número de conversaciones creadas este mes")
    documents_count: int = Field(default=0, description="Número de documentos indexados")
    last_reset_at: datetime = Field(..., description="Fecha del último reinicio de cuotas")
    
    model_config = {"extra": "forbid", "populate_by_name": True}


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


class TenantInfo(BaseModel):
    """
    Información del tenant (perfil de usuario).
    Añadido para compatibilidad con backend que espera TenantInfo.
    """
    tenant_id: uuid.UUID = Field(..., alias="id", description="ID del tenant/usuario")
    email: str = Field(..., description="Email principal")
    full_name: Optional[str] = Field(None, description="Nombre completo")
    avatar_url: Optional[str] = Field(None, description="URL del avatar")
    
    model_config = {"extra": "ignore", "populate_by_name": True}


class UserTenantRelation(BaseModel):
    """
    Relación entre usuario y tenant.
    En Nooble8 simplificado es 1:1, pero mantenemos el modelo.
    """
    user_id: uuid.UUID = Field(..., description="ID del usuario")
    tenant_id: uuid.UUID = Field(..., description="ID del tenant")
    role: str = Field(default="owner")
    
    model_config = {"extra": "ignore"}


class IngestionMetadata(BaseModel):
    """
    Metadata de ingestion guardada en Supabase (tabla documents_rag).
    """
    id: uuid.UUID = Field(default_factory=uuid.uuid4, description="ID único del registro")
    tenant_id: uuid.UUID = Field(
        ..., 
        alias="user_id", 
        validation_alias="user_id", 
        serialization_alias="user_id",
        description="ID del usuario"
    )
    collection_id: str = Field(..., description="ID de la colección en Qdrant")
    document_id: uuid.UUID = Field(..., description="ID del documento en Qdrant (UUID)")
    document_name: str = Field(..., description="Nombre del documento")
    document_type: str = Field(..., description="Tipo de documento")
    
    # Información del procesamiento
    total_chunks: int = Field(default=0, ge=0, description="Número total de chunks")
    processed_chunks: int = Field(default=0, ge=0, description="Número de chunks procesados")
    status: str = Field(default="pending", description="Estado de la ingestion")
    error_message: Optional[str] = Field(None, description="Mensaje de error si falló")
    
    # Model info
    embedding_model: str = Field(..., description="Modelo de embedding utilizado")
    embedding_dimensions: int = Field(..., description="Dimensiones del embedding")
    encoding_format: str = Field(default="float", description="Formato de codificación")
    
    # Chunking configuration
    chunk_size: int = Field(..., description="Tamaño de chunk")
    chunk_overlap: int = Field(..., description="Solapamiento de chunk")
    
    # Agent assignments
    agent_ids: List[str] = Field(default_factory=list, description="Lista de agent_ids (UUIDs como strings)")
    
    # Metadata adicional
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de creación")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Fecha de última actualización")
    
    model_config = {"extra": "forbid", "populate_by_name": True}


class MessageUsage(BaseModel):
    """
    Información de consumo de tokens por mensaje.
    """
    message_id: uuid.UUID = Field(..., description="ID del mensaje")
    tokens_input: int = Field(default=0, description="Tokens de entrada")
    tokens_output: int = Field(default=0, description="Tokens de salida")
    model: str = Field(..., description="Modelo utilizado")
    latency_ms: Optional[int] = Field(default=None, description="Latencia en ms")
    
    model_config = {"extra": "forbid"}