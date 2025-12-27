# 🎯 Técnicas Agnósticas de Preprocesamiento - Ingestion Service

## Compatibilidad

| Componente | Versión Mínima | Versión Recomendada |
|------------|---------------|---------------------|
| **Qdrant** | 1.10+ | **1.16+** |
| **qdrant-client** | 1.9+ | 1.12+ |
| **Python** | 3.10+ | 3.11+ |

### Features por Versión de Qdrant

| Feature | Qdrant 1.10 | Qdrant 1.14 | Qdrant 1.16 |
|---------|-------------|-------------|-------------|
| Query API + Prefetch | ✅ | ✅ | ✅ |
| RRF Fusion | ✅ | ✅ | ✅ |
| DBSF Fusion | ✅ (1.11+) | ✅ | ✅ |
| FormulaQuery (Score-Boosting) | ❌ | ✅ | ✅ |
| RRF parametrizado (k) | ❌ | ❌ | ✅ |
| Full-Text Index | ✅ | ✅ | ✅ mejorado |

---

## Resumen

Este módulo implementa **4 técnicas agnósticas avanzadas** de preprocesamiento para mejorar significativamente la calidad del RAG:

| Técnica | Campo Generado | Uso en Qdrant | Beneficio |
|---------|---------------|---------------|-----------|
| **Contextual Injected Chunking** | `content_contextualized` | Vector Denso | Mejor calidad de embedding |
| **Search Anchors** | `search_anchors` | BM25 + Full-Text | Mejor recall (encuentra lo que busca el usuario) |
| **Fact Density** | `fact_density` | Score-Boosting | Prioriza contenido valioso |
| **Entity Normalization** | `normalized_entities` | Filtrado | Búsqueda estructurada |

---

## 🔥 Las 4 Técnicas Explicadas

### 1. Contextual Injected Chunking

**Problema:** Un chunk de la página 50 pierde sentido sin contexto.

**Solución:** El LLM genera un `contextual_prefix` de 1-2 frases que sitúa el chunk en contexto.

```
ANTES (pierdes contexto):
"El pago será de 500€"

DESPUÉS (contexto inyectado):
"En el contexto del contrato de servicios de limpieza entre Empresa A 
y Empresa B para el período Marzo 2024: El pago será de 500€"
```

**Impacto:**
- El embedding captura mejor el significado real
- El LLM final entiende el chunk sin necesitar más contexto

---

### 2. Search Anchors (Queries Sintéticas)

**Problema:** El usuario busca "dolor de cabeza" pero el documento dice "cefalea tensional".

**Solución:** El LLM genera 5-10 formas en que un humano buscaría esa información.

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
- Se concatenan y se indexan en Full-Text Index
- Se incluyen en el texto para BM25
- La búsqueda encuentra el chunk aunque el usuario use términos diferentes

---

### 3. Fact Density (Hechos Atómicos)

**Problema:** ¿Cómo saber qué chunks son más valiosos objetivamente?

**Solución:** 
1. Extraer hechos concretos (`atomic_facts`)
2. Calcular densidad de hechos (`fact_density` 0-1)

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
  "fact_density": 0.85
}
```

**Uso en Qdrant:**
- `fact_density` se usa en Score-Boosting durante búsqueda
- Chunks con más datos concretos suben en el ranking
- `atomic_facts` se indexan para búsqueda exacta

---

### 4. Entity Normalization

**Problema:** El mismo concepto tiene mil nombres (CIF, VAT ID, NIF, Tax ID).

**Solución:** El LLM normaliza entidades a un estándar.

```json
{
  "original": "El CIF de la empresa es B12345678",
  "normalized_entities": {
    "organization_id": "B12345678",
    "entity_type": "company"
  }
}
```

---

## 📁 Estructura de Archivos

```
ingestion_service/
├── models/
│   ├── ingestion_models.py      # ChunkModel con campos agnósticos
│   └── preprocessing_models.py   # EnrichedChunk, DocumentContext, etc.
│
├── prompts/
│   └── document_preprocess.py    # Prompts agnósticos optimizados
│
├── handler/
│   ├── preprocess_handler.py     # AgnosticPreprocessHandler
│   ├── document_handler.py       # Integración con preprocesamiento
│   └── qdrant_handler.py         # Almacenamiento + búsqueda agnóstica
│
└── config/
    └── settings.py               # Configuración de preprocessing
```

---

## 🔧 Configuración

### Variables de Entorno

```bash
# Habilitar preprocesamiento agnóstico
ENABLE_DOCUMENT_PREPROCESSING=true

# API key de Groq
GROQ_API_KEY=gsk_your_api_key_here

# Modelo LLM para preprocesamiento
PREPROCESSING_MODEL=deepseek-r1-distill-llama-70b

# Tokens máximos por bloque
PREPROCESSING_MAX_TOKENS_PER_BLOCK=3000
```

### Configuración en RAGIngestionConfig

```python
rag_config = RAGIngestionConfig(
    embedding_model=EmbeddingModel.TEXT_EMBEDDING_3_SMALL,
    chunk_size=512,
    chunk_overlap=50,
    enable_preprocessing=True,    # Habilitar preprocesamiento
    fact_density_boost=0.3        # Peso del boost (0-1)
)
```

---

## 📊 Flujo de Procesamiento

```
┌─────────────────┐
│ Documento       │
│ (PDF/DOCX/etc)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extracción      │  PyMuPDF/python-docx
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Chunking        │  SentenceSplitter (raw chunks)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Contexto Doc    │  LLM genera summary + topics (UNA VEZ)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Enriquecimiento │  LLM genera por cada chunk:
│ Agnóstico       │  - contextual_prefix
│                 │  - search_anchors
│                 │  - atomic_facts
│                 │  - fact_density
│                 │  - normalized_entities
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Embedding       │  Del content_contextualized (con prefijo)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Qdrant          │  Vectores + payload agnóstico + índices
└─────────────────┘
```

---

## 📝 Estructura del Chunk Almacenado

```json
{
  "chunk_id": "uuid",
  "document_id": "uuid",
  "tenant_id": "uuid",
  "collection_id": "col_abc123",
  
  "content": "En el contexto del contrato de servicios...\n\nEl pago será de 500€",
  "content_raw": "El pago será de 500€",
  
  "search_anchors": "pago contrato cuánto cuesta precio servicios limpieza monto total",
  "atomic_facts": "Monto: 500 Moneda: EUR Tipo: pago servicios",
  "fact_density": 0.75,
  "document_nature": "transactional",
  "normalized_entities": {
    "amount": "500",
    "currency": "EUR"
  },
  
  "embedding_model": "text-embedding-3-small",
  "embedding_dimensions": 1536,
  
  "metadata": {
    "document_name": "Contrato_Limpieza.pdf",
    "preprocessing_used": true,
    "contextual_prefix": "En el contexto del contrato de servicios..."
  }
}
```

---

## 🔍 Búsqueda con Score-Boosting (Qdrant 1.14+)

La implementación usa **FormulaQuery nativo** de Qdrant para hacer el boost directamente en el servidor:

```python
# En query_service (ejemplo)
results = await qdrant_handler.search_hybrid_with_boost(
    tenant_id=tenant_id,
    agent_id=agent_id,
    query_dense=embedding,
    query_sparse=sparse_vector,
    fact_density_boost=0.3,  # Priorizar chunks con más datos
    rrf_k=60,                # Parámetro RRF (Qdrant 1.16+)
    limit=10
)
```

### FormulaQuery Interno

La búsqueda usa FormulaQuery nativo de Qdrant 1.14+:

```python
# Fórmula ejecutada en Qdrant (no en Python)
FormulaQuery(
    formula=SumExpression(sum=[
        "$score",  # Score del RRF/DBSF
        MultExpression(mult=[
            0.3,           # fact_density_boost
            "fact_density" # Payload key
        ])
    ]),
    defaults={"fact_density": 0.5}
)
```

### Métodos de Búsqueda Disponibles

| Método | Descripción | Qdrant Mínimo |
|--------|-------------|---------------|
| `search_hybrid_with_boost()` | RRF + FormulaQuery boost | 1.14+ |
| `search_hybrid_dbsf()` | DBSF + FormulaQuery boost | 1.14+ |
| `search_in_anchors()` | Full-Text en search_anchors | 1.10+ |
| `search_in_facts()` | Full-Text en atomic_facts | 1.10+ |
| `search_by_agent()` | Búsqueda simple (legacy) | 1.10+ |

### Fallback Automático

Si FormulaQuery falla (Qdrant < 1.14), el sistema hace fallback a boost manual en Python:

```python
# _fallback_hybrid_search() se activa automáticamente
boosted_score = score + (fact_density_boost * fact_density)
```

---

## 📈 Métricas de Éxito

### En PreprocessingResult

```python
result = await preprocess_handler.preprocess_document(...)

print(f"Chunks procesados: {result.total_chunks}")
print(f"Densidad promedio: {result.avg_fact_density}")
print(f"Total search anchors: {result.total_search_anchors}")
print(f"Total atomic facts: {result.total_atomic_facts}")
print(f"Tokens LLM usados: {result.llm_usage['total_tokens']}")
```

### Indicadores de Calidad

| Métrica | Valor Bajo | Valor Alto |
|---------|------------|------------|
| `avg_fact_density` | < 0.3 (texto vago) | > 0.7 (muchos datos) |
| `total_search_anchors` | < 3 por chunk | > 7 por chunk |
| `total_atomic_facts` | 0 (sin datos concretos) | > 5 por chunk |

---

## ⚠️ Fallback Automático

Si el preprocesamiento falla:
1. Se registra error en logs
2. Se usa chunking tradicional (SentenceSplitter)
3. Los chunks se crean con valores por defecto:
   - `search_anchors`: vacío
   - `fact_density`: 0.5
   - `document_nature`: "other"
4. `metadata.preprocessing_used = false`

---

## 💰 Costos Estimados (Groq)

| Documento | Chunks | Tokens Input | Tokens Output | Costo |
|-----------|--------|--------------|---------------|-------|
| 5,000 palabras | ~10 | ~15,000 | ~5,000 | ~$0.08 |
| 10,000 palabras | ~20 | ~30,000 | ~10,000 | ~$0.16 |
| 20,000 palabras | ~40 | ~60,000 | ~20,000 | ~$0.32 |

*Basado en precios de Groq para modelos 70B (Diciembre 2024)*

---

## 🚀 Próximos Pasos para Query Service

Para completar la implementación, el **query_service** necesita:

1. **Usar `search_hybrid_with_boost`** en lugar de búsqueda simple
2. **Pasar `fact_density_boost`** desde configuración del agente
3. **Opcionalmente** buscar en `search_anchors` y `atomic_facts` para casos específicos

Ejemplo de integración:

```python
# En query_service/handler/qdrant_handler.py

async def search_for_context(
    self,
    query: str,
    tenant_id: str,
    agent_id: str,
    fact_density_boost: float = 0.3
):
    # Generar embeddings
    dense = await self.embedding_client.embed(query)
    sparse = self.sparse_model.embed([query])[0]
    
    # Búsqueda híbrida con boost
    results = await self.client.search_hybrid_with_boost(
        tenant_id=tenant_id,
        agent_id=agent_id,
        query_dense=dense,
        query_sparse=sparse,
        fact_density_boost=fact_density_boost,
        limit=10
    )
    
    # Los resultados ya vienen ordenados por boosted_score
    return results
```
