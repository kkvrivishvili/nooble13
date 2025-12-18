"""
Modelos para Ingestion Service.
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, HttpUrl
from common.models.config_models import EmbeddingModel


class IngestionStatus(str, Enum):
    """Estados de ingestion."""
    PENDING = "pending"
    PROCESSING = "processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    STORING = "storing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentType(str, Enum):
    """Tipos de documento soportados."""
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    HTML = "html"
    MARKDOWN = "markdown"
    URL = "url"


class RAGIngestionConfig(BaseModel):
    """Configuración RAG específica para ingestion."""
    embedding_model: EmbeddingModel = Field(default=EmbeddingModel.TEXT_EMBEDDING_3_SMALL)
    embedding_dimensions: int = Field(default=1536)
    encoding_format: str = Field(default="float")
    chunk_size: int = Field(default=512)
    chunk_overlap: int = Field(default=50)
    
    class Config:
        use_enum_values = False  # Mantener enum objects


class DocumentIngestionRequest(BaseModel):
    """Request para ingestar un documento."""
    document_name: str = Field(..., description="Nombre del documento")
    document_type: DocumentType = Field(..., description="Tipo de documento")
    
    # RAG config - si no viene, usa defaults
    rag_config: Optional[RAGIngestionConfig] = Field(
        default_factory=RAGIngestionConfig,
        description="Configuración RAG para este documento"
    )
    
    # IDs opcionales
    collection_id: Optional[str] = Field(
        None, 
        description="ID de colección virtual. Si no se provee, se genera uno nuevo"
    )
    agent_ids: List[str] = Field(
        default_factory=list, 
        description="Lista de agent_ids que tendrán acceso al documento"
    )
    
    # Fuente del documento
    file_path: Optional[str] = Field(None, description="Path al archivo")
    content: Optional[str] = Field(None, description="Contenido directo")
    url: Optional[HttpUrl] = Field(None, description="URL para descargar")
    
    # Metadata adicional
    metadata: Dict[str, Any] = Field(default_factory=dict)


class IngestionResponse(BaseModel):
    """Response de ingestion."""
    task_id: uuid.UUID = Field(..., description="ID de la tarea")
    document_id: uuid.UUID = Field(..., description="ID del documento generado")
    collection_id: str = Field(..., description="ID de la colección (generado o provisto)")
    agent_ids: List[str] = Field(..., description="Lista de agentes asignados")
    status: IngestionStatus = Field(..., description="Estado inicial")
    message: str = Field(..., description="Mensaje de estado")
    websocket_url: Optional[str] = Field(None, description="URL para seguimiento")


class IngestionProgress(BaseModel):
    """Progreso de ingestion para WebSocket."""
    task_id: uuid.UUID
    document_id: uuid.UUID
    status: IngestionStatus
    current_step: str
    progress_percentage: float
    total_chunks: Optional[int] = None
    processed_chunks: Optional[int] = None
    message: str
    error: Optional[str] = None


class ChunkModel(BaseModel):
    """Modelo para chunks de documento."""
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str  # UUID como string
    tenant_id: str    # UUID como string
    content: str
    chunk_index: int
    
    # IDs para jerarquía
    collection_id: str
    agent_ids: List[str] = Field(default_factory=list)
    
    # Embeddings y enriquecimiento
    embedding: Optional[List[float]] = None
    keywords: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }