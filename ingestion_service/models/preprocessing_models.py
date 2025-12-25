"""
Modelos para preprocesamiento de documentos.

Define las estructuras de datos para secciones enriquecidas
generadas por el LLM.
"""

import re
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class ContentType(str, Enum):
    """Tipos de contenido detectados por el LLM."""
    PROSE = "prose"
    TABLE = "table"
    CODE = "code"
    LIST = "list"
    MIXED = "mixed"


class EnrichedSection(BaseModel):
    """
    Sección enriquecida generada por el LLM.
    
    Representa una unidad semántica del documento con metadata
    para optimizar búsqueda vectorial y BM25.
    """
    section_id: str = Field(..., description="ID único de la sección (sec_001, sec_002, etc.)")
    context_breadcrumb: str = Field(..., description="Ruta jerárquica del contenido")
    content_type: ContentType = Field(default=ContentType.PROSE, description="Tipo de contenido")
    tags: List[str] = Field(default_factory=list, description="Tags semánticos")
    keywords: List[str] = Field(default_factory=list, description="Keywords específicas/entidades")
    language: str = Field(default="es", description="Idioma del contenido (es/en)")
    content_description: Optional[str] = Field(None, description="Descripción para tablas/código")
    content: str = Field(..., description="Contenido formateado")
    
    # Metadata adicional para tracking
    word_count: int = Field(default=0, description="Conteo de palabras")
    
    class Config:
        use_enum_values = True


class PreprocessingResult(BaseModel):
    """Resultado completo del preprocesamiento de un documento."""
    sections: List[EnrichedSection] = Field(default_factory=list)
    total_sections: int = Field(default=0)
    processing_errors: List[str] = Field(default_factory=list)
    llm_usage: Dict[str, int] = Field(default_factory=dict)
    
    # Metadata del documento
    document_name: str = Field(default="")
    document_type: str = Field(default="")
    was_preprocessed: bool = Field(default=False, description="True si se usó LLM, False si fallback")


# =============================================================================
# PARSER FUNCTIONS
# =============================================================================

def parse_llm_output(raw_output: str) -> List[EnrichedSection]:
    """
    Parsea la salida del LLM en objetos EnrichedSection.
    
    Args:
        raw_output: Texto crudo de la respuesta del LLM
        
    Returns:
        Lista de EnrichedSection parseadas
    """
    sections = []
    
    # Regex para extraer secciones
    section_pattern = r'<<<SECTION>>>(.*?)<<<END_SECTION>>>'
    section_matches = re.findall(section_pattern, raw_output, re.DOTALL)
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[PARSER] Found {len(section_matches)} raw sections in LLM output")
    
    for i, section_text in enumerate(section_matches):
        try:
            section = _parse_single_section(section_text.strip())
            if section:
                sections.append(section)
            else:
                logger.warning(f"[PARSER] Failed to parse section {i+1}")
        except Exception as e:
            logger.error(f"[PARSER] Exception parsing section {i+1}: {e}")
            continue
    
    logger.info(f"[PARSER] Successfully parsed {len(sections)}/{len(section_matches)} sections")
    return sections


def _parse_single_section(section_text: str) -> Optional[EnrichedSection]:
    """
    Parsea una sección individual.
    
    Args:
        section_text: Texto de una sección (sin delimitadores)
        
    Returns:
        EnrichedSection o None si falla el parsing
    """
    # Patrones para extraer campos
    patterns = {
        'section_id': r'\[section_id:\s*([^\]]+)\]',
        'context': r'\[context:\s*([^\]]+)\]',
        'content_type': r'\[content_type:\s*([^\]]+)\]',
        'tags': r'\[tags:\s*([^\]]+)\]',
        'keywords': r'\[keywords:\s*([^\]]+)\]',
        'language': r'\[language:\s*([^\]]+)\]',
        'content_description': r'\[content_description:\s*([^\]]+)\]',
    }
    
    # Extraer campos
    extracted = {}
    for field, pattern in patterns.items():
        match = re.search(pattern, section_text, re.IGNORECASE)
        if match:
            extracted[field] = match.group(1).strip()
    
    # Extraer contenido (todo después del separador ---)
    content_match = re.search(r'---\s*\n(.*)', section_text, re.DOTALL)
    if not content_match:
        return None
    
    content = content_match.group(1).strip()
    if not content:
        return None
    
    # Validar campos requeridos
    section_id = extracted.get('section_id', '')
    context = extracted.get('context', '')
    
    if not section_id:
        section_id = "sec_unknown"
    if not context:
        context = "Documento → Sección"
    
    # Parsear tags y keywords
    tags = _parse_comma_list(extracted.get('tags', ''))
    keywords = _parse_comma_list(extracted.get('keywords', ''))
    
    # Parsear content_type
    content_type_str = extracted.get('content_type', 'prose').lower()
    try:
        content_type = ContentType(content_type_str)
    except ValueError:
        content_type = ContentType.PROSE
    
    # Crear sección
    return EnrichedSection(
        section_id=section_id,
        context_breadcrumb=context,
        content_type=content_type,
        tags=tags,
        keywords=keywords,
        language=extracted.get('language', 'es'),
        content_description=extracted.get('content_description'),
        content=content,
        word_count=len(content.split())
    )


def _parse_comma_list(text: str) -> List[str]:
    """Parsea una lista separada por comas."""
    if not text:
        return []
    
    items = [item.strip() for item in text.split(',')]
    return [item for item in items if item]  # Filtrar vacíos