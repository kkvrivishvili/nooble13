"""
Configuración para Extraction Service.
Extiende CommonAppSettings con configuraciones específicas.
"""
from typing import Optional, Literal, List
from pydantic import Field

from common.config.base_settings import CommonAppSettings


class ExtractionSettings(CommonAppSettings):
    """Configuración específica para Extraction Service."""
    
    # Service identification
    service_name: str = Field(default="extraction-service")
    service_version: str = Field(default="1.0.0")
    
    # ==========================================================================
    # DOCLING CONFIGURATION
    # ==========================================================================
    
    docling_timeout: int = Field(
        default=120,
        description="Timeout en segundos para procesamiento Docling"
    )
    
    docling_max_pages: int = Field(
        default=500,
        description="Máximo de páginas que Docling procesará"
    )
    
    docling_enable_ocr: bool = Field(
        default=True,
        description="Habilitar OCR para PDFs escaneados"
    )
    
    docling_ocr_lang: str = Field(
        default="spa+eng",
        description="Idiomas para OCR (formato Tesseract)"
    )
    
    # ==========================================================================
    # SPACY CONFIGURATION
    # ==========================================================================
    
    spacy_model_md: str = Field(
        default="es_core_news_md",
        description="Modelo spaCy medium (para tier free)"
    )
    
    spacy_model_lg: str = Field(
        default="es_core_news_lg", 
        description="Modelo spaCy large (para tier pro/enterprise)"
    )
    
    spacy_model_md_en: str = Field(
        default="en_core_web_md",
        description="Modelo spaCy medium inglés"
    )
    
    spacy_model_lg_en: str = Field(
        default="en_core_web_lg",
        description="Modelo spaCy large inglés"
    )
    
    spacy_max_text_length: int = Field(
        default=2000000,
        description="Máximo de caracteres para spaCy (2M por defecto)"
    )
    
    spacy_batch_size: int = Field(
        default=1000,
        description="Tamaño de batch para procesamiento spaCy"
    )
    
    # ==========================================================================
    # FALLBACK CONFIGURATION
    # ==========================================================================
    
    enable_fallback: bool = Field(
        default=True,
        description="Habilitar fallback a PyMuPDF si Docling falla"
    )
    
    fallback_timeout: int = Field(
        default=60,
        description="Timeout en segundos para fallback PyMuPDF"
    )
    
    # ==========================================================================
    # PROCESSING CONFIGURATION
    # ==========================================================================
    
    temp_dir: str = Field(
        default="/tmp/extraction",
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
        description="Número de workers de extracción"
    )
    
    # ==========================================================================
    # LANGUAGE DETECTION
    # ==========================================================================
    
    default_language: str = Field(
        default="es",
        description="Idioma por defecto si no se detecta"
    )
    
    supported_languages: List[str] = Field(
        default=["es", "en"],
        description="Idiomas soportados para procesamiento"
    )
    
    class Config:
        env_prefix = ""
        case_sensitive = False
