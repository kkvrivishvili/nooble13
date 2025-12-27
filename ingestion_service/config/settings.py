"""
Configuración para Ingestion Service.
Actualizado para soportar delegación a extraction-service.
"""
from typing import Optional, List
from pydantic import Field, AliasChoices
from pydantic_settings import SettingsConfigDict

from common.config.base_settings import CommonAppSettings


class IngestionSettings(CommonAppSettings):
    """Configuración específica para Ingestion Service."""
    
    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Service identification
    service_name: str = Field(default="ingestion-service")
    service_version: str = Field(default="2.0.0")
    
    # ==========================================================================
    # EXTRACTION SERVICE INTEGRATION
    # ==========================================================================
    
    use_extraction_service: bool = Field(
        default=True,
        description="Delegar extracción al extraction-service"
    )
    
    extraction_service_timeout: int = Field(
        default=300,
        description="Timeout en segundos para esperar respuesta de extraction"
    )
    
    # ==========================================================================
    # CHUNKING CONFIGURATION
    # ==========================================================================
    
    default_chunk_size: int = Field(
        default=512,
        gt=0,
        le=2000,
        description="Tamaño de chunk por defecto en caracteres"
    )
    
    default_chunk_overlap: int = Field(
        default=50,
        ge=0,
        le=500,
        description="Overlap entre chunks"
    )
    
    # Chunking jerárquico
    enable_hierarchical_chunking: bool = Field(
        default=True,
        description="Habilitar chunking jerárquico con herencia de secciones"
    )
    
    # ==========================================================================
    # EMBEDDING CONFIGURATION
    # ==========================================================================
    
    embedding_batch_size: int = Field(
        default=100,
        gt=0,
        description="Tamaño de batch para envío a embedding-service"
    )
    
    embedding_timeout: int = Field(
        default=60,
        description="Timeout para embedding por batch"
    )
    
    # ==========================================================================
    # LLM ENRICHMENT CONFIGURATION (solo para balanced/premium)
    # ==========================================================================
    
    enable_llm_enrichment: bool = Field(
        default=False,
        description="Habilitar enriquecimiento LLM (search_anchors, atomic_facts)"
    )
    
    llm_enrichment_batch_size: int = Field(
        default=5,
        description="Chunks por batch para LLM enrichment"
    )
    
    llm_enrichment_timeout: int = Field(
        default=30,
        description="Timeout por chunk para LLM enrichment"
    )
    
    # ==========================================================================
    # QDRANT CONFIGURATION
    # ==========================================================================
    
    qdrant_host: str = Field(default="qdrant")
    qdrant_port: int = Field(default=6333)
    qdrant_api_key: Optional[str] = Field(default=None)
    qdrant_https: bool = Field(default=False)
    qdrant_collection_prefix: str = Field(default="nooble_")
    
    # Qdrant sparse vectors para BM25
    enable_sparse_vectors: bool = Field(
        default=True,
        description="Habilitar sparse vectors para búsqueda híbrida BM25"
    )
    
    # ==========================================================================
    # SUPABASE CONFIGURATION
    # ==========================================================================
    
    supabase_url: str = Field(..., description="URL de Supabase")
    supabase_anon_key: str = Field(
        ..., 
        description="Clave anónima de Supabase",
        validation_alias=AliasChoices("supabase_anon_key", "SUPABASE_ANON_KEY", "supabase_key", "SUPABASE_KEY")
    )
    supabase_service_key: Optional[str] = Field(None, description="Clave de servicio de Supabase")
    
    # ==========================================================================
    # FILE HANDLING
    # ==========================================================================
    
    temp_dir: str = Field(
        default="/tmp/ingestion",
        description="Directorio temporal para archivos"
    )
    
    max_file_size_mb: int = Field(
        default=50,
        description="Tamaño máximo de archivo en MB"
    )
    
    cleanup_temp_files: bool = Field(
        default=True,
        description="Limpiar archivos temporales después de procesar"
    )
    
    # ==========================================================================
    # WORKER CONFIGURATION
    # ==========================================================================
    
    worker_count: int = Field(
        default=1,
        description="Número de workers principales"
    )
    
    callback_worker_count: int = Field(
        default=1,
        description="Número de workers para callbacks"
    )
    
    # ==========================================================================
    # WEBSOCKET CONFIGURATION
    # ==========================================================================
    
    websocket_enabled: bool = Field(
        default=True,
        description="Habilitar notificaciones WebSocket"
    )
    
    websocket_heartbeat_interval: int = Field(
        default=30,
        description="Intervalo de heartbeat en segundos"
    )
    
