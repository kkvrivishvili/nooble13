# 🎯 TÉCNICAS AGNÓSTICAS AVANZADAS - Implementación

## Lo que cambia TODO:

El documento que compartiste resuelve el problema que teníamos:

| Antes (tu sistema actual) | Después (técnicas agnósticas) |
|---------------------------|-------------------------------|
| Keywords genéricos | **Search Anchors** (cómo buscaría un humano) |
| Tags subjetivos | **Fact Density** (métrica objetiva 0-1) |
| Content crudo | **Contextual Prefix** (chunk con contexto) |
| Breadcrumb manual | **Atomic Facts** (datos extraídos) |

---

## 🔥 LAS 4 TÉCNICAS CLAVE

### 1. Contextual Injected Chunking

**Problema que resuelve:** Un chunk de la página 50 pierde sentido sin contexto.

**Técnica:** Añadir 1-2 frases de contexto ANTES de vectorizar.

```
ANTES (pierdes contexto):
"El pago será de 500€"

DESPUÉS (contexto inyectado):
"En el contexto de la factura de servicios de limpieza de Marzo 2024 
para la empresa ABC S.L., el pago será de 500€"
```

**Impacto:** 
- El vector denso captura mejor el significado
- ColBERT tiene tokens más ricos para comparar
- El LLM final entiende mejor el chunk

---

### 2. Search Anchors (Queries Sintéticas)

**Problema que resuelve:** El usuario busca "dolor de cabeza" pero el documento dice "cefalea tensional".

**Técnica:** El LLM genera 5-10 formas en que un humano buscaría esa información.

```json
{
  "chunk": "La cefalea tensional se caracteriza por...",
  "search_anchors": [
    "dolor de cabeza",
    "cefalea tensional síntomas",
    "qué es la cefalea",
    "dolor cabeza estrés",
    "tensión muscular cabeza"
  ]
}
```

**Uso en Qdrant:** 
- Se indexan en Full-Text Index
- La búsqueda encuentra el chunk aunque el usuario use términos diferentes

---

### 3. Fact Density (Hechos Atómicos)

**Problema que resuelve:** ¿Cómo saber qué chunks son más valiosos objetivamente?

**Técnica:** Extraer hechos concretos y calcular densidad.

```json
{
  "chunk": "La empresa, fundada en 1990 por Juan Pérez en Madrid, 
            se dedica al sector del acero inoxidable.",
  "atomic_facts": [
    "Año fundación: 1990",
    "Fundador: Juan Pérez",
    "Ubicación: Madrid",
    "Sector: Acero inoxidable"
  ],
  "fact_density": 0.85  // 4 hechos en ~20 palabras = alta densidad
}
```

**Uso en Qdrant:**
- `fact_density` se usa en Score-Boosting
- Chunks con más datos concretos suben en el ranking
- `atomic_facts` se indexan para búsqueda exacta

---

### 4. Entity Normalization

**Problema que resuelve:** El mismo concepto tiene mil nombres (CIF, VAT ID, NIF, Tax ID).

**Técnica:** El LLM normaliza entidades a un estándar.

```json
{
  "original": "El CIF de la empresa es B12345678",
  "normalized_entities": {
    "tax_id": "B12345678",
    "entity_type": "company"
  }
}
```

---

## 📋 EL PROMPT MAESTRO

```python
PREPROCESSING_PROMPT = """
Actúa como un Analista de Datos Estructurales. 
Procesa el siguiente fragmento y devuelve estrictamente JSON:

{
  "contextual_prefix": "1-2 frases que sitúen este chunk en contexto global",
  
  "search_anchors": [
    "5-10 formas en que alguien buscaría esta información",
    "incluir sinónimos, términos técnicos y coloquiales"
  ],
  
  "atomic_facts": [
    "Dato concreto 1: valor",
    "Dato concreto 2: valor"
  ],
  
  "fact_density": 0.0-1.0,  // hechos / palabras normalizado
  
  "normalized_entities": {
    "entity_type": "valor normalizado"
  },
  
  "document_nature": "transactional|narrative|technical|legal|recipe|manual"
}

REGLAS:
- fact_density alto (>0.7): muchos datos objetivos, fechas, nombres, números
- fact_density bajo (<0.3): texto vago, administrativo, sin datos concretos
- search_anchors: piensa como buscaría un experto Y un novato
- atomic_facts: solo hechos verificables, no opiniones

DOCUMENTO CONTEXTO (resumen):
{document_summary}

CHUNK A PROCESAR:
{chunk_content}
"""
```

---

## 🔧 IMPLEMENTACIÓN PARA TU SISTEMA

### Nuevo Modelo de Chunk Enriquecido

```python
from dataclasses import dataclass
from typing import List, Dict, Optional

@dataclass
class EnrichedChunk:
    # Identificadores
    chunk_id: str
    document_id: str
    chunk_index: int
    
    # Contenido original
    content_raw: str
    
    # NUEVO: Contenido con contexto inyectado (para vectorizar)
    content_contextualized: str
    
    # NUEVO: Para Full-Text Index
    search_anchors: List[str]
    atomic_facts: List[str]
    
    # NUEVO: Para Score-Boosting
    fact_density: float  # 0.0 - 1.0
    
    # NUEVO: Entidades normalizadas
    normalized_entities: Dict[str, str]
    
    # Metadata
    document_nature: str  # transactional, narrative, technical, etc.
    
    # Vectores (se generan del content_contextualized)
    embedding: Optional[List[float]] = None
```

### Flujo de Procesamiento

```python
async def process_chunk_advanced(
    chunk_content: str,
    document_summary: str,  # Resumen del doc completo
    llm_client
) -> EnrichedChunk:
    """
    Procesa un chunk usando las técnicas agnósticas avanzadas.
    """
    
    # 1. Llamar al LLM con el prompt maestro
    prompt = PREPROCESSING_PROMPT.format(
        document_summary=document_summary,
        chunk_content=chunk_content
    )
    
    response = await llm_client.generate(prompt)
    data = json.loads(response)
    
    # 2. Construir contenido contextualizado
    content_contextualized = f"{data['contextual_prefix']}\n\n{chunk_content}"
    
    # 3. Crear chunk enriquecido
    return EnrichedChunk(
        content_raw=chunk_content,
        content_contextualized=content_contextualized,
        search_anchors=data['search_anchors'],
        atomic_facts=data['atomic_facts'],
        fact_density=data['fact_density'],
        normalized_entities=data.get('normalized_entities', {}),
        document_nature=data['document_nature']
    )
```

### Almacenamiento en Qdrant

```python
async def store_enriched_chunk(
    chunk: EnrichedChunk,
    qdrant_client
):
    """
    Almacena chunk enriquecido con todas las técnicas.
    """
    
    # 1. Generar embedding del contenido CONTEXTUALIZADO
    embedding = await generate_embedding(chunk.content_contextualized)
    
    # 2. Generar BM25 del contenido contextualizado + search_anchors
    bm25_text = f"{chunk.content_contextualized} {' '.join(chunk.search_anchors)}"
    sparse_vector = generate_bm25(bm25_text)
    
    # 3. Construir payload
    payload = {
        # Para mostrar al usuario / pasar al LLM final
        "content": chunk.content_contextualized,
        "content_raw": chunk.content_raw,
        
        # Para Full-Text Index (búsqueda exacta)
        "search_anchors": " ".join(chunk.search_anchors),
        "atomic_facts": " ".join(chunk.atomic_facts),
        
        # Para Score-Boosting
        "fact_density": chunk.fact_density,
        
        # Para filtrado
        "document_nature": chunk.document_nature,
        "normalized_entities": chunk.normalized_entities,
        
        # Metadata estándar
        "document_id": chunk.document_id,
        "chunk_index": chunk.chunk_index,
    }
    
    # 4. Almacenar
    await qdrant_client.upsert(
        collection_name="nooble8_vectors",
        points=[
            PointStruct(
                id=chunk.chunk_id,
                vector={
                    "dense": embedding,
                    "bm25": sparse_vector
                },
                payload=payload
            )
        ]
    )
```

### Query con Score-Boosting

```python
async def search_with_fact_boosting(
    query: str,
    qdrant_client,
    boost_weight: float = 0.3
):
    """
    Búsqueda híbrida con boost por fact_density.
    """
    
    # Generar vectores de query
    dense_query = await generate_embedding(query)
    sparse_query = generate_bm25(query)
    
    # Búsqueda con Score-Boosting (Qdrant 1.14+)
    results = await qdrant_client.query_points(
        collection_name="nooble8_vectors",
        prefetch=[
            # Búsqueda densa
            Prefetch(
                query=dense_query,
                using="dense",
                limit=50
            ),
            # Búsqueda sparse (incluye search_anchors)
            Prefetch(
                query=sparse_query,
                using="bm25",
                limit=50
            )
        ],
        # Fusión + Boosting por fact_density
        query={
            "formula": {
                "sum": [
                    "$score",  # Score original de similitud
                    {
                        "mult": [
                            boost_weight,
                            {"key": "fact_density"}
                        ]
                    }
                ]
            }
        },
        limit=10,
        with_payload=True
    )
    
    return results
```

### Índices Necesarios

```python
async def setup_indexes_for_agnostic_search(qdrant_client, collection_name: str):
    """
    Configura índices para las técnicas agnósticas.
    """
    
    # 1. Full-Text en search_anchors (las queries sintéticas)
    await qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="search_anchors",
        field_schema={
            "type": "text",
            "tokenizer": "word",
            "min_token_len": 2,
            "lowercase": True
        }
    )
    
    # 2. Full-Text en atomic_facts
    await qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="atomic_facts",
        field_schema={
            "type": "text",
            "tokenizer": "word",
            "lowercase": True
        }
    )
    
    # 3. Índice numérico para fact_density (Score-Boosting)
    await qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="fact_density",
        field_schema="float"
    )
    
    # 4. Keyword index para document_nature (filtrado)
    await qdrant_client.create_payload_index(
        collection_name=collection_name,
        field_name="document_nature",
        field_schema="keyword"
    )
```

---

## 📊 COMPARATIVA: Antes vs Después

| Aspecto | Sistema Actual | Sistema Agnóstico |
|---------|---------------|-------------------|
| **Keywords** | Genéricas, no se usan | `search_anchors` = cómo buscaría un humano |
| **Tags** | Subjetivos, no se usan | `document_nature` = clasificación útil |
| **Quality Score** | No existe | `fact_density` = métrica objetiva |
| **Contexto** | Breadcrumb estático | `contextual_prefix` dinámico |
| **Entidades** | No normalizadas | `normalized_entities` estándar |
| **Full-Text** | Solo content | Content + anchors + facts |
| **Reranking** | Solo similitud | Similitud + fact_density |

---

## 🎯 LO MÁS IMPORTANTE

### El cambio de mentalidad:

**ANTES:** El LLM genera metadata "bonita" (keywords, tags) que nadie usa.

**DESPUÉS:** El LLM genera metadata "funcional":
1. `contextual_prefix` → Mejora el vector
2. `search_anchors` → Mejora Full-Text search
3. `fact_density` → Mejora el ranking
4. `atomic_facts` → Búsqueda exacta de datos

### El prompt es la clave:

El prompt que compartiste es brillante porque:
1. Es **agnóstico** (funciona con cualquier documento)
2. Genera **métricas objetivas** (fact_density)
3. Piensa como el **usuario final** (search_anchors)
4. Añade **contexto** (contextual_prefix)

---

## 🚀 PLAN DE MIGRACIÓN

### Fase 1: Cambiar el Prompt (1 día)
- Reemplazar prompt actual por el "Prompt Maestro"
- Parsear JSON de respuesta

### Fase 2: Modificar Almacenamiento (1 día)
- Vectorizar `content_contextualized` en vez de `content`
- Añadir `search_anchors` al texto BM25
- Almacenar `fact_density` en payload

### Fase 3: Configurar Índices (2 horas)
- Full-Text en `search_anchors`
- Full-Text en `atomic_facts`
- Float en `fact_density`

### Fase 4: Modificar Query (4 horas)
- Implementar Score-Boosting con `fact_density`
- Añadir búsqueda en `search_anchors`

### Resultado Esperado:
- Búsquedas más precisas (search_anchors)
- Resultados más relevantes (fact_density boost)
- Mejor contexto para el LLM final (contextual_prefix)
