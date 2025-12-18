"""
Configuración para Ingestion Service.
Extiende CommonAppSettings con configuraciones específicas.
"""
from typing import Optional
from pydantic import Field

from common.config.base_settings import CommonAppSettings


class IngestionSettings(CommonAppSettings):
    """Configuración específica para Ingestion Service."""
    
    # Service identification
    service_name: str = Field(default="ingestion-service")
    service_version: str = Field(default="2.0.0")
    
    # API Settings
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8002)
    
    # Supabase configuration
    supabase_url: str = Field(..., description="URL de Supabase")
    supabase_anon_key: str = Field(..., description="Clave anónima de Supabase")
    supabase_service_key: Optional[str] = Field(None, description="Clave de servicio de Supabase")
    
    # Qdrant configuration
    qdrant_url: str = Field(..., description="URL de Qdrant")
    qdrant_api_key: Optional[str] = Field(None, description="API key de Qdrant")
    qdrant_collection: str = Field(default="documents", description="Colección por defecto en Qdrant")
    
    # Processing configuration
    default_chunk_size: int = Field(default=512, description="Tamaño de chunk por defecto")
    default_chunk_overlap: int = Field(default=50, description="Overlap de chunk por defecto")
    max_file_size_mb: int = Field(default=50, description="Tamaño máximo de archivo en MB")
    
    # WebSocket configuration
    websocket_ping_interval: int = Field(default=30, description="Intervalo de ping WebSocket")
    websocket_ping_timeout: int = Field(default=10, description="Timeout de ping WebSocket")
    
    # Worker configuration
    embedding_callback_worker_enabled: bool = Field(default=True, description="Habilitar worker de callbacks")
    embedding_callback_worker_count: int = Field(default=1, description="Número de workers")
    
    # Timeouts
    processing_timeout: int = Field(default=300, description="Timeout para procesamiento (segundos)")
    embedding_timeout: int = Field(default=60, description="Timeout para embeddings (segundos)")
    
    class Config:
        env_prefix = ""
        case_sensitive = False