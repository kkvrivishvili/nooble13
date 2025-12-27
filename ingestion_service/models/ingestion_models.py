"""
Modelos para Ingestion Service.
Actualizados para soportar:
- Chunking jerárquico con herencia de contexto
- Enriquecimiento de spaCy (entidades, noun_chunks)
- Modos de procesamiento por tier
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, HttpUrl
from common.models.config_models import EmbeddingModel, ProcessingMode, SpacyModelSize


class IngestionStatus(str, Enum):
    """Estados de ingestion."""
    PENDING = "pending"
    PROCESSING = "processing"
    EXTRACTING = "extracting"      # Nuevo: esperando extraction-service
    PREPROCESSING = "preprocessing"  # Fase de enriquecimiento LLM (si aplica)
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
    
    # Modo de procesamiento
    processing_mode: ProcessingMode = Field(
        default=ProcessingMode.BALANCED,
        description="Modo de procesamiento según tier de suscripción"
    )
    spacy_model_size: SpacyModelSize = Field(
        default=SpacyModelSize.MEDIUM,
        description="Tamaño del modelo spaCy"
    )
    
    # Opciones para preprocesamiento LLM (solo balanced/premium)
    enable_llm_enrichment: bool = Field(
        default=False,
        description="Habilitar preprocesamiento LLM para enriquecimiento"
    )
    llm_enrichment_percentage: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Porcentaje de chunks a enriquecer con LLM (0-100)"
    )
    fact_density_boost: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Peso del boost por fact_density en búsquedas (0-1)"
    )
    
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
    processing_mode: ProcessingMode = Field(default=ProcessingMode.FAST)


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
    """
    Modelo para chunks de documento.
    Actualizado para chunking jerárquico y enriquecimiento spaCy.
    """
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str  # UUID como string
    tenant_id: str    # UUID como string
    
    # Contenido - CRÍTICO: usar content para embeddings (ya incluye contextual_prefix)
    content: str = Field(..., description="Contenido contextualizado para embeddings")
    content_raw: Optional[str] = Field(None, description="Contenido original sin contextualizar")
    
    chunk_index: int
    
    # IDs para jerarquía
    collection_id: str
    agent_ids: List[str] = Field(default_factory=list)
    
    # Embeddings
    embedding: Optional[List[float]] = None
    
    # ==========================================================================
    # CAMPOS PARA TÉCNICAS AGNÓSTICAS (LLM enrichment - solo balanced/premium)
    # ==========================================================================
    
    # Search Anchors - Para BM25 + Full-Text Index
    search_anchors: List[str] = Field(
        default_factory=list,
        description="Queries sintéticas: cómo buscaría un usuario esta información"
    )
    
    # Atomic Facts - Para búsqueda exacta de datos
    atomic_facts: List[str] = Field(
        default_factory=list,
        description="Hechos verificables extraídos (Categoría: valor)"
    )
    
    # Fact Density - Para Score-Boosting
    fact_density: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Densidad de hechos concretos (0-1). Usado para reranking"
    )
    
    # Document Nature - Para filtrado
    document_nature: str = Field(
        default="other",
        description="Tipo de documento (transactional, narrative, technical, etc.)"
    )
    
    # Entidades normalizadas - Para filtrado estructurado
    normalized_entities: Dict[str, Any] = Field(
        default_factory=dict,
        description="Entidades normalizadas (person, organization, date, amount, location)"
    )
    
    # ==========================================================================
    # CAMPOS DE SPACY (siempre disponibles)
    # ==========================================================================
    
    spacy_entities: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Entidades detectadas por spaCy"
    )
    
    spacy_noun_chunks: List[str] = Field(
        default_factory=list,
        description="Noun chunks extraídos por spaCy (clave para búsqueda agnóstica)"
    )

    # ==========================================================================
    # CAMPOS DE CONTEXTO JERÁRQUICO
    # ==========================================================================
    
    section_title: Optional[str] = Field(
        None,
        description="Título de la sección donde está este chunk"
    )
    
    section_level: Optional[int] = Field(
        None,
        ge=1,
        le=6,
        description="Nivel del heading de la sección (1-6)"
    )
    
    section_context: Optional[str] = Field(
        None,
        description="Contexto completo de la jerarquía de secciones"
    )

    # ==========================================================================
    # METADATA ESTRUCTURAL
    # ==========================================================================
    
    document_type: str = Field(default="other")
    document_name: str = Field(default="")
    language: str = Field(default="es")
    page_count: Optional[int] = Field(None)
    has_tables: bool = Field(default=False)
    
    # ==========================================================================
    # CAMPOS LEGACY (para compatibilidad)
    # ==========================================================================
    
    keywords: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    def get_bm25_text(self) -> str:
        """
        Retorna texto optimizado para BM25/sparse embeddings.
        
        Estructura jerárquica con boosting:
        1. Contexto de sección (x3) - Máxima relevancia para coherencia
        2. Noun chunks de spaCy (x3) - Términos técnicos agnósticos
        3. Entidades (x2) - Nombres propios, fechas, montos
        4. Search anchors si existen (x3) - Queries sintéticas LLM
        5. Contenido raw (x1) - Base de seguridad
        """
        parts = []
        
        # Boost x3: Contexto de sección
        if self.section_context:
            parts.extend([self.section_context] * 3)
        
        # Boost x3: Noun chunks de spaCy (clave agnóstica)
        if self.spacy_noun_chunks:
            noun_chunks_text = " ".join(self.spacy_noun_chunks)
            parts.extend([noun_chunks_text] * 3)
        
        # Boost x2: Entidades
        if self.spacy_entities:
            entities_text = " ".join(
                ent.get("text", "") for ent in self.spacy_entities
            )
            parts.extend([entities_text] * 2)
        
        # Boost x3: Search Anchors (si hay LLM enrichment)
        if self.search_anchors:
            anchors_text = " ".join(self.search_anchors)
            parts.extend([anchors_text] * 3)
        
        # Boost x2: Atomic Facts (si hay LLM enrichment)
        if self.atomic_facts:
            facts_text = " ".join(self.atomic_facts)
            parts.extend([facts_text] * 2)
        
        # Boost x1: Contenido raw
        if self.content_raw:
            parts.append(self.content_raw)
        elif self.content:
            parts.append(self.content)
            
        return " ".join(parts)
