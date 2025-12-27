"""
Modelos de datos para Extraction Service.

Define las estructuras de datos para:
- Requests de extracción
- Resultados de extracción
- Estructuras de documentos
- Enriquecimiento spaCy
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ProcessingMode(str, Enum):
    """Modos de procesamiento según tier de suscripción."""
    FAST = "fast"           # Docling + spaCy md (Free)
    BALANCED = "balanced"   # Docling + spaCy lg + LLM selectivo (Pro)
    PREMIUM = "premium"     # Docling + spaCy lg + LLM completo (Enterprise)


class SpacyModelSize(str, Enum):
    """Tamaño del modelo spaCy a usar."""
    MEDIUM = "md"   # ~92MB, más rápido
    LARGE = "lg"    # ~549MB, más preciso


class ExtractionStatus(str, Enum):
    """Estados de extracción."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ExtractionError(BaseModel):
    """Modelo de error de extracción."""
    error_type: str = Field(..., description="Tipo de error")
    error_message: str = Field(..., description="Mensaje de error")
    stage: str = Field(..., description="Etapa donde ocurrió el error")
    recoverable: bool = Field(default=False, description="Si se puede recuperar con fallback")
    details: Optional[Dict[str, Any]] = Field(default=None)
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Momento del error")


class SectionInfo(BaseModel):
    """Información de una sección del documento."""
    title: str = Field(..., description="Título de la sección")
    level: int = Field(..., ge=1, le=6, description="Nivel del heading (1-6)")
    start_char: int = Field(..., ge=0, description="Posición inicial en el texto")
    end_char: Optional[int] = Field(None, description="Posición final en el texto")
    parent_title: Optional[str] = Field(None, description="Título de la sección padre")
    
    class Config:
        extra = "forbid"


class TableInfo(BaseModel):
    """Información de una tabla detectada."""
    table_index: int = Field(..., ge=0, description="Índice de la tabla en el documento")
    rows: int = Field(..., ge=0, description="Número de filas")
    cols: int = Field(..., ge=0, description="Número de columnas")
    start_char: int = Field(..., ge=0, description="Posición inicial en el texto")
    has_header: bool = Field(default=True, description="Si tiene fila de encabezado")
    markdown_content: Optional[str] = Field(None, description="Contenido en formato Markdown")
    
    class Config:
        extra = "forbid"


class DocumentStructure(BaseModel):
    """Estructura detectada del documento."""
    sections: List[SectionInfo] = Field(default_factory=list, description="Secciones detectadas")
    tables: List[TableInfo] = Field(default_factory=list, description="Tablas detectadas")
    tables_count: int = Field(default=0, description="Número total de tablas")
    page_count: int = Field(default=0, description="Número de páginas")
    has_toc: bool = Field(default=False, description="Si tiene tabla de contenidos")
    has_images: bool = Field(default=False, description="Si tiene imágenes")
    word_count: int = Field(default=0, description="Conteo de palabras")
    char_count: int = Field(default=0, description="Conteo de caracteres")
    
    class Config:
        extra = "forbid"


class EntityInfo(BaseModel):
    """Entidad detectada por spaCy."""
    text: str = Field(..., description="Texto de la entidad")
    label: str = Field(..., description="Tipo de entidad (PERSON, ORG, DATE, etc.)")
    start_char: int = Field(..., ge=0, description="Posición inicial")
    end_char: int = Field(..., ge=0, description="Posición final")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confianza de la detección")
    
    class Config:
        extra = "forbid"


class SpacyEnrichment(BaseModel):
    """Enriquecimiento generado por spaCy."""
    entities: List[EntityInfo] = Field(default_factory=list, description="Entidades detectadas")
    noun_chunks: List[str] = Field(default_factory=list, description="Noun chunks extraídos")
    language: str = Field(default="es", description="Idioma detectado")
    language_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    
    # Entidades agrupadas por tipo (para búsqueda rápida)
    entities_by_type: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Entidades agrupadas por tipo"
    )
    
    # Lemmas únicos (para BM25)
    unique_lemmas: List[str] = Field(
        default_factory=list,
        description="Lemmas únicos del documento"
    )
    
    # Estadísticas
    entity_count: int = Field(default=0, description="Total de entidades")
    noun_chunk_count: int = Field(default=0, description="Total de noun chunks")
    
    class Config:
        extra = "forbid"


class ExtractionRequest(BaseModel):
    """
    Request para extracción de documento.
    Recibido via DomainAction.data
    """
    # Identificadores
    task_id: str = Field(..., description="ID de la tarea de ingestion")
    document_id: str = Field(..., description="ID del documento")
    tenant_id: str = Field(..., description="ID del tenant")
    
    # Archivo
    file_path: str = Field(..., description="Path al archivo a procesar")
    document_type: str = Field(..., description="Tipo de documento (pdf, docx, txt, etc.)")
    document_name: str = Field(..., description="Nombre original del documento")
    
    # Configuración de procesamiento
    processing_mode: ProcessingMode = Field(
        default=ProcessingMode.FAST,
        description="Modo de procesamiento según tier"
    )
    spacy_model_size: SpacyModelSize = Field(
        default=SpacyModelSize.MEDIUM,
        description="Tamaño del modelo spaCy"
    )
    
    # Límites (vienen del subscription plan)
    max_pages: Optional[int] = Field(None, description="Máximo de páginas a procesar")
    
    # Metadata adicional
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        extra = "forbid"


class ExtractionResult(BaseModel):
    """
    Resultado de extracción de documento.
    Enviado via callback a ingestion-service
    """
    # Identificadores (propagados del request)
    task_id: str = Field(..., description="ID de la tarea de ingestion")
    document_id: str = Field(..., description="ID del documento")
    tenant_id: str = Field(..., description="ID del tenant")
    
    # Estado
    status: ExtractionStatus = Field(..., description="Estado de la extracción")
    error: Optional[ExtractionError] = Field(None, description="Error si falló")
    
    # Contenido extraído
    extracted_text: str = Field(default="", description="Texto extraído en Markdown")
    
    # Estructura del documento
    structure: DocumentStructure = Field(
        default_factory=DocumentStructure,
        description="Estructura detectada del documento"
    )
    
    # Enriquecimiento spaCy
    spacy_enrichment: SpacyEnrichment = Field(
        default_factory=SpacyEnrichment,
        description="Enriquecimiento de spaCy"
    )
    
    # Metadata de extracción
    extraction_method: str = Field(default="docling", description="Método usado (docling/fallback)")
    processing_mode: ProcessingMode = Field(default=ProcessingMode.FAST)
    spacy_model_used: str = Field(default="es_core_news_md", description="Modelo spaCy usado")
    
    # Tiempos de procesamiento
    extraction_time_ms: int = Field(default=0, description="Tiempo de extracción en ms")
    spacy_time_ms: int = Field(default=0, description="Tiempo de procesamiento spaCy en ms")
    total_time_ms: int = Field(default=0, description="Tiempo total en ms")
    
    # Timestamp
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        extra = "forbid"
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
