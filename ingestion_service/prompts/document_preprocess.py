"""
Prompts para preprocesamiento agnóstico de documentos.

Implementa las 4 técnicas avanzadas:
1. Contextual Injected Chunking - contextual_prefix
2. Search Anchors - queries sintéticas para mejorar retrieval
3. Fact Density - métrica objetiva de calidad
4. Entity Normalization - entidades estructuradas

Estos prompts están diseñados para ser AGNÓSTICOS al tipo de documento.
"""

from typing import Optional
from dataclasses import dataclass


# =============================================================================
# PROMPT PARA CONTEXTO DE DOCUMENTO (se ejecuta UNA VEZ por documento)
# =============================================================================

DOCUMENT_CONTEXT_PROMPT = """Analiza este documento y genera un resumen estructurado para contextualizar fragmentos posteriores.

DOCUMENTO:
{document_text}

Responde SOLO con JSON válido (sin markdown, sin explicaciones):
{{
    "summary": "Resumen de 2-3 párrafos que capture: qué es el documento, su propósito, y los temas principales que cubre. Este resumen se usará para dar contexto a fragmentos individuales.",
    
    "main_topics": ["tema1", "tema2", "tema3", "tema4", "tema5"],
    
    "document_type": "contract|invoice|manual|recipe|article|report|legal|medical|technical|academic|narrative|other",
    
    "key_entities": ["entidad importante 1", "entidad importante 2", "entidad importante 3"],
    
    "language": "es|en"
}}

REGLAS:
- summary: Debe ser suficiente para entender cualquier fragmento del documento sin leer el resto
- main_topics: 3-7 temas principales, en orden de importancia
- document_type: Elige el más apropiado de la lista
- key_entities: Nombres propios, organizaciones, productos mencionados frecuentemente
- language: Idioma predominante del contenido
"""


# =============================================================================
# PROMPT MAESTRO PARA ENRIQUECIMIENTO DE CHUNKS (se ejecuta por cada chunk)
# =============================================================================

CHUNK_ENRICHMENT_PROMPT = """Actúa como un Analista de Datos Estructurales especializado en preparar contenido para búsqueda semántica.

CONTEXTO DEL DOCUMENTO:
{document_summary}

FRAGMENTO A PROCESAR:
{chunk_content}

Tu tarea es enriquecer este fragmento para optimizar su recuperación en búsquedas. 
Responde SOLO con JSON válido (sin markdown, sin explicaciones):

{{
    "contextual_prefix": "1-2 frases que sitúen este fragmento en el contexto del documento completo. Debe permitir entender el fragmento SIN leer el resto del documento. Ejemplo: 'En el contexto del contrato de servicios entre Empresa A y Empresa B para mantenimiento de equipos informáticos durante 2024...'",
    
    "search_anchors": [
        "cómo buscaría esto un experto",
        "cómo buscaría esto alguien sin conocimiento técnico",
        "sinónimo técnico del tema principal",
        "pregunta específica que este fragmento responde",
        "variación coloquial de los términos",
        "otra forma de preguntar por esta información",
        "términos relacionados que un usuario podría usar"
    ],
    
    "atomic_facts": [
        "Categoría: dato concreto y verificable",
        "Fecha: YYYY-MM-DD si aplica",
        "Monto: cantidad numérica si aplica",
        "Nombre: entidad específica mencionada"
    ],
    
    "fact_density": 0.0,
    
    "normalized_entities": {{
        "person": "Nombre Completo normalizado",
        "organization": "Nombre de Organización",
        "date": "YYYY-MM-DD",
        "amount": "valor numérico sin símbolos",
        "location": "Lugar normalizado",
        "product": "Nombre del producto/servicio"
    }},
    
    "document_nature": "transactional|narrative|technical|legal|recipe|manual|medical|academic|other"
}}

=== REGLAS DETALLADAS ===

CONTEXTUAL_PREFIX (CRÍTICO):
- Debe hacer el fragmento AUTOCONTENIDO
- Incluye: qué documento es, de qué trata, dónde estamos en la estructura
- NO copies el contenido, solo contextualiza
- Ejemplo bueno: "En la sección de ingredientes de la receta de paella valenciana del recetario 'Cocina Mediterránea'..."
- Ejemplo malo: "Este texto habla de ingredientes" (muy vago)

SEARCH_ANCHORS (CRÍTICO):
- PIENSA como buscaría un USUARIO REAL esta información
- Incluye al menos:
  * 1-2 búsquedas de EXPERTO (términos técnicos precisos)
  * 1-2 búsquedas de NOVATO (términos simples, coloquiales)
  * 1-2 PREGUNTAS que este fragmento responde
  * 1-2 SINÓNIMOS o variaciones
- Mínimo 5, máximo 10
- Deben ser DIFERENTES entre sí, no variaciones mínimas
- Ejemplo para receta de paella: ["paella valenciana ingredientes", "qué lleva la paella", "arroz con mariscos receta", "cómo hacer paella", "ingredientes paella tradicional", "arroz español ingredientes", "qué necesito para hacer paella"]

ATOMIC_FACTS:
- Solo hechos VERIFICABLES y CONCRETOS
- Formato estricto: "Categoría: valor"
- Tipos válidos: Fecha, Monto, Cantidad, Nombre, Código, Medida, Duración, Porcentaje
- Si no hay hechos concretos, devuelve lista vacía []
- Ejemplos buenos: "Fecha firma: 2024-03-15", "Monto total: 15000", "Cantidad personas: 4"
- Ejemplos malos: "El documento es importante", "Información útil" (no son hechos verificables)

FACT_DENSITY (0.0 a 1.0):
- 0.9-1.0: MUCHOS datos concretos (tabla de especificaciones, lista de ingredientes con medidas, datos financieros)
- 0.7-0.8: Información útil con VARIOS datos específicos (párrafo con fechas, nombres, cifras)
- 0.5-0.6: Mezcla equilibrada de texto explicativo y datos
- 0.3-0.4: Principalmente EXPLICATIVO, pocos datos concretos
- 0.1-0.2: Texto MUY general, introducciones, conclusiones genéricas
- 0.0: Fragmento roto, basura, sin información útil

NORMALIZED_ENTITIES:
- Solo incluye entidades que EXISTAN en el texto
- Normaliza fechas a YYYY-MM-DD (ej: "15 de marzo" → "2024-03-15")
- Normaliza montos a números sin símbolos (ej: "$15.000 USD" → "15000")
- Normaliza nombres propios con mayúsculas correctas
- Si no hay entidades de un tipo, OMITE esa clave (no pongas null o vacío)

DOCUMENT_NATURE:
- transactional: Facturas, contratos, órdenes de compra, recibos
- narrative: Artículos, noticias, historias, blogs
- technical: Documentación técnica, especificaciones, APIs
- legal: Leyes, términos y condiciones, acuerdos legales
- recipe: Recetas de cocina, procedimientos paso a paso
- manual: Guías de usuario, instructivos, tutoriales
- medical: Informes médicos, diagnósticos, tratamientos
- academic: Papers, investigaciones, tesis
- other: Si no encaja en ninguna categoría
"""


# =============================================================================
# PROMPT SIMPLIFICADO PARA CHUNKS PEQUEÑOS
# =============================================================================

CHUNK_ENRICHMENT_SIMPLE_PROMPT = """Enriquece este fragmento para búsqueda semántica.

DOCUMENTO: {document_name}
CONTEXTO: {document_summary_short}

FRAGMENTO:
{chunk_content}

Responde SOLO JSON:
{{
    "contextual_prefix": "1 frase que contextualice este fragmento",
    "search_anchors": ["5 formas de buscar esto"],
    "atomic_facts": ["hechos concretos si existen"],
    "fact_density": 0.5,
    "document_nature": "tipo"
}}
"""


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ChunkProcessingContext:
    """Contexto para procesar un chunk individual."""
    document_id: str
    document_name: str
    document_summary: str
    document_type: str
    chunk_index: int
    total_chunks: int
    is_first_chunk: bool
    is_last_chunk: bool


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def build_document_context_input(document_text: str, max_chars: int = 15000) -> str:
    """
    Construye el input para generar contexto de documento.
    
    Args:
        document_text: Texto completo del documento
        max_chars: Máximo de caracteres a enviar (para documentos largos)
        
    Returns:
        Prompt formateado listo para enviar al LLM
    """
    # Truncar si es muy largo
    if len(document_text) > max_chars:
        # Tomar inicio y fin para mejor comprensión
        half = max_chars // 2
        text_for_summary = (
            document_text[:half] + 
            "\n\n[... contenido intermedio omitido ...]\n\n" + 
            document_text[-half:]
        )
    else:
        text_for_summary = document_text
    
    return DOCUMENT_CONTEXT_PROMPT.format(document_text=text_for_summary)


def build_chunk_enrichment_input(
    chunk_content: str,
    document_summary: str,
    use_simple: bool = False,
    document_name: str = ""
) -> str:
    """
    Construye el input para enriquecer un chunk.
    
    Args:
        chunk_content: Contenido del chunk a procesar
        document_summary: Resumen del documento (de DocumentContext)
        use_simple: Usar prompt simplificado para chunks pequeños
        document_name: Nombre del documento (para prompt simple)
        
    Returns:
        Prompt formateado listo para enviar al LLM
    """
    if use_simple and len(chunk_content) < 500:
        # Usar prompt simplificado para chunks pequeños
        summary_short = document_summary[:300] + "..." if len(document_summary) > 300 else document_summary
        return CHUNK_ENRICHMENT_SIMPLE_PROMPT.format(
            document_name=document_name,
            document_summary_short=summary_short,
            chunk_content=chunk_content
        )
    
    return CHUNK_ENRICHMENT_PROMPT.format(
        document_summary=document_summary,
        chunk_content=chunk_content
    )


def get_document_context_prompt() -> str:
    """Retorna el prompt para contexto de documento."""
    return DOCUMENT_CONTEXT_PROMPT


def get_chunk_enrichment_prompt() -> str:
    """Retorna el prompt maestro para enriquecimiento."""
    return CHUNK_ENRICHMENT_PROMPT
