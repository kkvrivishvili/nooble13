"""
Modelos para preprocesamiento agnóstico de documentos.

Implementa las 4 técnicas avanzadas:
1. Contextual Injected Chunking
2. Search Anchors (Queries Sintéticas)
3. Fact Density (Hechos Atómicos)
4. Entity Normalization
"""

import re
import json
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class DocumentNature(str, Enum):
    """Clasificación del tipo de documento."""
    TRANSACTIONAL = "transactional"  # Facturas, contratos, pedidos
    NARRATIVE = "narrative"          # Artículos, historias, blogs
    TECHNICAL = "technical"          # Manuales, documentación técnica
    LEGAL = "legal"                  # Documentos legales, términos
    RECIPE = "recipe"                # Recetas, procedimientos paso a paso
    MANUAL = "manual"                # Guías de usuario, instructivos
    MEDICAL = "medical"              # Documentos médicos, informes
    ACADEMIC = "academic"            # Papers, investigación
    OTHER = "other"                  # Otros


class DocumentContext(BaseModel):
    """
    Contexto del documento completo.
    Se genera UNA VEZ por documento para inyectar en chunks.
    """
    document_id: str
    document_name: str
    summary: str = Field(..., description="Resumen de 2-3 párrafos del documento")
    main_topics: List[str] = Field(default_factory=list, description="Temas principales")
    document_type: str = Field(default="other", description="Tipo detectado")
    key_entities: List[str] = Field(default_factory=list, description="Entidades clave")
    language: str = Field(default="es", description="Idioma detectado")


class EnrichedChunk(BaseModel):
    """
    Chunk enriquecido con técnicas agnósticas avanzadas.
    
    Cada campo tiene un propósito específico en el pipeline RAG:
    - content_contextualized: Para generar el embedding (mejora calidad vectorial)
    - search_anchors: Para BM25 + Full-Text Index (mejora recall)
    - atomic_facts: Para búsqueda exacta de datos
    - fact_density: Para Score-Boosting en reranking
    - normalized_entities: Para filtrado estructurado
    """
    # Identificadores
    chunk_id: str
    document_id: str
    chunk_index: int
    
    # Contenido
    content_raw: str = Field(..., description="Contenido original sin modificar")
    content_contextualized: str = Field(
        ..., 
        description="Contenido con prefijo de contexto (USAR PARA EMBEDDINGS)"
    )
    contextual_prefix: str = Field(
        ..., 
        description="Prefijo que sitúa el chunk en contexto global"
    )
    
    # Search Anchors - Queries sintéticas para mejorar retrieval
    search_anchors: List[str] = Field(
        default_factory=list,
        description="5-10 formas en que un usuario buscaría esta información"
    )
    
    # Atomic Facts - Hechos concretos para búsqueda exacta
    atomic_facts: List[str] = Field(
        default_factory=list,
        description="Hechos verificables extraídos (Categoría: valor)"
    )
    
    # Fact Density - Métrica de calidad objetiva
    fact_density: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Densidad de hechos concretos (0-1). Usado para Score-Boosting"
    )
    
    # Entidades normalizadas - Para filtrado estructurado
    normalized_entities: Dict[str, Any] = Field(
        default_factory=dict,
        description="Entidades normalizadas (person, organization, date, amount, location)"
    )
    
    # Clasificación
    document_nature: str = Field(
        default="other",
        description="Tipo de documento (transactional, narrative, technical, etc.)"
    )
    
    # Metadata adicional
    word_count: int = Field(default=0)
    language: str = Field(default="es")
    
    class Config:
        use_enum_values = True


class PreprocessingResult(BaseModel):
    """Resultado completo del preprocesamiento de un documento."""
    
    # Chunks enriquecidos
    chunks: List[EnrichedChunk] = Field(default_factory=list)
    total_chunks: int = Field(default=0)
    
    # Contexto del documento
    document_context: Optional[DocumentContext] = None
    
    # Tracking
    processing_errors: List[str] = Field(default_factory=list)
    llm_usage: Dict[str, int] = Field(default_factory=dict)
    
    # Metadata
    document_name: str = Field(default="")
    document_type: str = Field(default="")
    was_preprocessed: bool = Field(default=False)
    
    # Estadísticas
    avg_fact_density: float = Field(default=0.0)
    total_search_anchors: int = Field(default=0)
    total_atomic_facts: int = Field(default=0)


# =============================================================================
# PARSER FUNCTIONS
# =============================================================================

def parse_document_context_response(raw_output: str) -> Dict[str, Any]:
    """
    Parsea la respuesta del LLM para contexto de documento.
    
    Args:
        raw_output: Respuesta JSON del LLM
        
    Returns:
        Dict con summary, main_topics, document_type, key_entities
    """
    try:
        # Limpiar respuesta
        cleaned = _clean_json_response(raw_output)
        data = json.loads(cleaned)
        
        return {
            "summary": data.get("summary", ""),
            "main_topics": data.get("main_topics", []),
            "document_type": data.get("document_type", "other"),
            "key_entities": data.get("key_entities", []),
            "language": data.get("language", "es")
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing document context JSON: {e}")
        return {
            "summary": "",
            "main_topics": [],
            "document_type": "other",
            "key_entities": [],
            "language": "es"
        }


def parse_chunk_enrichment_response(raw_output: str) -> Dict[str, Any]:
    """
    Parsea la respuesta del LLM para enriquecimiento de chunk.
    
    Args:
        raw_output: Respuesta JSON del LLM
        
    Returns:
        Dict con contextual_prefix, search_anchors, atomic_facts, 
        fact_density, normalized_entities, document_nature
    """
    try:
        # Limpiar respuesta
        cleaned = _clean_json_response(raw_output)
        data = json.loads(cleaned)
        
        # Validar y normalizar fact_density
        fact_density = data.get("fact_density", 0.5)
        if isinstance(fact_density, str):
            try:
                fact_density = float(fact_density)
            except ValueError:
                fact_density = 0.5
        fact_density = max(0.0, min(1.0, fact_density))
        
        # Validar search_anchors
        search_anchors = data.get("search_anchors", [])
        if not isinstance(search_anchors, list):
            search_anchors = []
        search_anchors = [str(s).strip() for s in search_anchors if s]
        
        # Validar atomic_facts
        atomic_facts = data.get("atomic_facts", [])
        if not isinstance(atomic_facts, list):
            atomic_facts = []
        atomic_facts = [str(f).strip() for f in atomic_facts if f]
        
        # Validar normalized_entities
        normalized_entities = data.get("normalized_entities", {})
        if not isinstance(normalized_entities, dict):
            normalized_entities = {}
        # Filtrar entidades vacías
        normalized_entities = {
            k: v for k, v in normalized_entities.items() 
            if v and str(v).strip()
        }
        
        # Validar document_nature
        document_nature = data.get("document_nature", "other")
        valid_natures = [n.value for n in DocumentNature]
        if document_nature not in valid_natures:
            document_nature = "other"
        
        return {
            "contextual_prefix": data.get("contextual_prefix", "").strip(),
            "search_anchors": search_anchors,
            "atomic_facts": atomic_facts,
            "fact_density": fact_density,
            "normalized_entities": normalized_entities,
            "document_nature": document_nature
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing chunk enrichment JSON: {e}")
        logger.debug(f"Raw output was: {raw_output[:500]}...")
        return _get_fallback_enrichment()


def _clean_json_response(raw: str) -> str:
    """Limpia respuesta del LLM para extraer JSON válido."""
    # Eliminar bloques de código markdown
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw)
    
    # Eliminar texto antes del primer {
    first_brace = raw.find('{')
    if first_brace > 0:
        raw = raw[first_brace:]
    
    # Eliminar texto después del último }
    last_brace = raw.rfind('}')
    if last_brace > 0:
        raw = raw[:last_brace + 1]
    
    return raw.strip()


def _get_fallback_enrichment() -> Dict[str, Any]:
    """Retorna enriquecimiento por defecto cuando falla el parsing."""
    return {
        "contextual_prefix": "",
        "search_anchors": [],
        "atomic_facts": [],
        "fact_density": 0.3,  # Valor conservador
        "normalized_entities": {},
        "document_nature": "other"
    }


def create_enriched_chunk(
    chunk_content: str,
    chunk_id: str,
    document_id: str,
    chunk_index: int,
    enrichment_data: Dict[str, Any]
) -> EnrichedChunk:
    """
    Crea un EnrichedChunk a partir del contenido y datos de enriquecimiento.
    
    Args:
        chunk_content: Contenido original del chunk
        chunk_id: ID único del chunk
        document_id: ID del documento padre
        chunk_index: Índice del chunk en el documento
        enrichment_data: Datos parseados del LLM
        
    Returns:
        EnrichedChunk completamente poblado
    """
    contextual_prefix = enrichment_data.get("contextual_prefix", "")
    
    # Construir contenido contextualizado
    if contextual_prefix:
        content_contextualized = f"{contextual_prefix}\n\n{chunk_content}"
    else:
        content_contextualized = chunk_content
    
    return EnrichedChunk(
        chunk_id=chunk_id,
        document_id=document_id,
        chunk_index=chunk_index,
        content_raw=chunk_content,
        content_contextualized=content_contextualized,
        contextual_prefix=contextual_prefix,
        search_anchors=enrichment_data.get("search_anchors", []),
        atomic_facts=enrichment_data.get("atomic_facts", []),
        fact_density=enrichment_data.get("fact_density", 0.5),
        normalized_entities=enrichment_data.get("normalized_entities", {}),
        document_nature=enrichment_data.get("document_nature", "other"),
        word_count=len(chunk_content.split()),
        language=enrichment_data.get("language", "es")
    )
