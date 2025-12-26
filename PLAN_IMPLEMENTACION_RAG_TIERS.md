# Plan de Implementación: Sistema de Tiers + Mejoras RAG

**Versión:** 1.0  
**Fecha:** Diciembre 2025  
**Servicio:** Nooble8 Ingestion Service  

---

## Principios de Implementación

1. **Backward Compatible:** Cada fase mantiene funcionalidad existente
2. **Feature Flags:** Nuevas features activables por configuración
3. **Graceful Degradation:** Si falla algo nuevo, fallback a comportamiento anterior
4. **Incremental:** Cada fase es desplegable independientemente

---

## Definición de Tiers

| Tier | Doc Size Max | Docs/Mes | Chunks/Doc Max | Features |
|------|--------------|----------|----------------|----------|
| **FREE** | 8K tokens (~6 páginas) | 50 | 100 | Matryoshka básico, BM25 |
| **STARTER** | 32K tokens (~24 páginas) | 500 | 500 | + Re-ranking, + Semantic chunking |
| **PRO** | 64K tokens (~48 páginas) | 5,000 | 1,000 | + LLM preprocessing opcional |
| **BUSINESS** | Unlimited | Unlimited | Unlimited | + Late Chunking (Jina), + Custom models |

---

# FASE 1: Sistema de Tiers + Matryoshka Base

**Duración estimada:** 1-2 semanas  
**Objetivo:** Establecer infraestructura de diferenciación y vectores Matryoshka

## 1.1 Modelos de Configuración de Tiers

### Archivos a crear:
- `ingestion_service/models/tier_models.py`

### Contenido:
- **Enum `TierLevel`:** FREE, STARTER, PRO, BUSINESS
- **Model `TierLimits`:** Límites específicos por tier
  - `max_document_tokens: int`
  - `max_documents_per_month: int`
  - `max_chunks_per_document: int`
  - `features_enabled: List[str]`
  - `embedding_dimensions_search: int` (256 para búsqueda rápida)
  - `embedding_dimensions_full: int` (1536 para re-ranking)
  - `llm_preprocessing_enabled: bool`
  - `late_chunking_enabled: bool`
- **Model `TierConfig`:** Configuración completa del sistema de tiers
  - Diccionario con límites por cada tier
  - Método `get_limits(tier: TierLevel) -> TierLimits`
- **Model `UserTierInfo`:** Info del tier del usuario actual
  - `tier: TierLevel`
  - `documents_used_this_month: int`
  - `limits: TierLimits`

### Lógica de defaults:
- Si no hay tier en JWT → FREE
- Si tier inválido → FREE con warning en logs

---

## 1.2 Validador de Tiers (Middleware)

### Archivos a crear:
- `ingestion_service/validators/tier_validator.py`

### Funciones principales:

#### `validate_document_size(doc_tokens: int, tier: TierLevel) -> ValidationResult`
- Compara tokens del documento vs límite del tier
- Retorna `ValidationResult` con:
  - `is_valid: bool`
  - `error_message: Optional[str]`
  - `upgrade_suggestion: Optional[str]` (ej: "Upgrade a Starter para documentos hasta 32K tokens")

#### `validate_monthly_quota(user_id: str, tier: TierLevel) -> ValidationResult`
- Consulta contador en Supabase (tabla `user_usage_stats`)
- Verifica si puede procesar más documentos este mes

#### `validate_chunk_count(chunk_count: int, tier: TierLevel) -> ValidationResult`
- Verifica que el número de chunks no exceda límite

#### `get_user_tier(auth_data: Dict) -> TierLevel`
- Extrae tier de `app_metadata` del JWT
- Fallback a FREE si no existe

### Integración:
- Llamar desde `ingestion_routes.py` ANTES de procesar
- Si validación falla → HTTP 402 (Payment Required) con mensaje claro

---

## 1.3 Configuración Matryoshka en Settings

### Archivos a modificar:
- `ingestion_service/config/settings.py`

### Nuevas configuraciones:
```
# Matryoshka Configuration
matryoshka_enabled: bool = True
matryoshka_search_dimensions: int = 256
matryoshka_full_dimensions: int = 1536
matryoshka_rerank_candidates: int = 100  # Top-K para re-ranking

# Tier System
tier_system_enabled: bool = True
default_tier: str = "free"
```

---

## 1.4 Modificación de RAGIngestionConfig

### Archivos a modificar:
- `ingestion_service/models/ingestion_models.py`

### Cambios en `RAGIngestionConfig`:
- Agregar campo `use_matryoshka: bool = True`
- Agregar campo `search_dimensions: Optional[int] = None` (se calcula según tier)
- Agregar campo `rerank_dimensions: Optional[int] = None`
- Mantener `embedding_dimensions` para backward compatibility (mapea a full)

### Nuevo modelo `ProcessingMode`:
- Enum con: MATRYOSHKA_BASIC, MATRYOSHKA_RERANK, LLM_ENRICHED, LATE_CHUNKING
- Se determina automáticamente según tier y tamaño de documento

---

## 1.5 Modificación de QdrantHandler para Dual Vectors

### Archivos a modificar:
- `ingestion_service/handler/qdrant_handler.py`

### Cambios en `initialize()`:
- Crear collection con DOS vectores densos:
  - `dense_search`: 256 dimensiones (para búsqueda rápida)
  - `dense_full`: 1536 dimensiones (para re-ranking)
- Mantener `bm25` sparse vector
- Crear índices para ambos vectores

### Cambios en `store_chunks()`:
- Recibir DOS embeddings por chunk (o uno y truncar)
- Almacenar ambos en el punto
- Si solo viene uno de 1536d → truncar primeros 256 para `dense_search`

### Nuevo método `search_with_rerank()`:
- Fase 1: Buscar con `dense_search` (256d) → Top 100
- Fase 2: Re-ordenar con `dense_full` (1536d) → Top K final
- Usar `Prefetch` para eficiencia

### Mantener métodos existentes:
- `search_by_agent()` sigue funcionando (usa dense_full por defecto)
- `search_hybrid_with_boost()` adaptado para usar nuevo schema

---

## 1.6 Modificación de EmbeddingClient/Handler

### Archivos a modificar:
- `ingestion_service/clients/embedding_client.py`
- `ingestion_service/handler/embedding_handler.py`

### Cambios:
- Agregar parámetro `dimensions` en request al embedding service
- El embedding service debe soportar parámetro `dimensions` de OpenAI API
- Si Matryoshka enabled:
  - Generar embedding con 1536d
  - El truncamiento a 256d se hace en QdrantHandler al almacenar

### Nota técnica:
OpenAI text-embedding-3 permite especificar `dimensions` en la API call.
Podemos pedir 1536d y truncar localmente, o pedir dos veces (ineficiente).
Mejor: pedir 1536d una vez, truncar los primeros 256 para búsqueda.

---

## 1.7 Modificación de Rutas API

### Archivos a modificar:
- `ingestion_service/api/ingestion_routes.py`

### Cambios en `ingest_document()`:
1. Extraer tier del usuario de `user_auth`
2. Llamar `TierValidator.validate_document_size()` (estimación inicial)
3. Si falla → retornar HTTP 402 con mensaje y sugerencia de upgrade
4. Pasar tier info al `IngestionService`

### Cambios en `upload_and_ingest()`:
1. Estimar tokens del archivo antes de procesar
2. Validar contra tier
3. Si falla → retornar error antes de guardar archivo

### Nuevos endpoints:
- `GET /api/v1/tier/info` → Retorna info del tier del usuario
- `GET /api/v1/tier/usage` → Retorna uso actual del mes

---

## 1.8 Mensajes de Error por Tier

### Archivos a crear:
- `ingestion_service/validators/tier_messages.py`

### Mensajes predefinidos:
```python
TIER_ERRORS = {
    "doc_too_large_free": {
        "code": "DOC_SIZE_EXCEEDED",
        "message": "El documento excede el límite de 8K tokens del plan Free",
        "suggestion": "Intenta con un documento más pequeño o actualiza al plan Starter para documentos hasta 32K tokens",
        "upgrade_url": "/pricing"
    },
    "doc_too_large_starter": {
        "code": "DOC_SIZE_EXCEEDED",
        "message": "El documento excede el límite de 32K tokens del plan Starter",
        "suggestion": "Actualiza al plan Pro para documentos hasta 64K tokens",
        "upgrade_url": "/pricing"
    },
    "monthly_quota_exceeded": {
        "code": "MONTHLY_QUOTA_EXCEEDED",
        "message": "Has alcanzado el límite de documentos de este mes",
        "suggestion": "Espera al próximo mes o actualiza tu plan",
        "upgrade_url": "/pricing"
    }
}
```

---

## 1.9 Tabla de Usage en Supabase

### SQL a ejecutar:
```sql
CREATE TABLE IF NOT EXISTS user_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    month_year VARCHAR(7) NOT NULL,  -- "2025-12"
    documents_processed INT DEFAULT 0,
    chunks_processed INT DEFAULT 0,
    tokens_processed BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, month_year)
);

-- Índice para consultas rápidas
CREATE INDEX idx_usage_user_month ON user_usage_stats(user_id, month_year);

-- RLS
ALTER TABLE user_usage_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON user_usage_stats
    FOR SELECT USING (auth.uid() = user_id);
```

---

## 1.10 Flujo Completo Fase 1

```
1. Usuario envía documento
                │
                ▼
2. Extraer tier de JWT (default: FREE)
                │
                ▼
3. Estimar tokens del documento
                │
                ▼
4. TierValidator.validate_document_size()
        │
        ├── FAIL → HTTP 402 + mensaje + upgrade_suggestion
        │
        └── OK ──▼
                 
5. TierValidator.validate_monthly_quota()
        │
        ├── FAIL → HTTP 402 + mensaje
        │
        └── OK ──▼

6. Procesar documento (chunking normal)
                │
                ▼
7. Generar embeddings 1536d via Embedding Service
                │
                ▼
8. Almacenar en Qdrant:
   - dense_search: primeros 256d (truncados)
   - dense_full: 1536d completos
   - bm25: sparse vector
                │
                ▼
9. Actualizar user_usage_stats
                │
                ▼
10. Retornar respuesta exitosa
```

---

## 1.11 Tests a Implementar

### Unit Tests:
- `test_tier_validator.py`
  - Test validación tamaño documento por tier
  - Test validación quota mensual
  - Test extracción de tier desde JWT

### Integration Tests:
- `test_matryoshka_storage.py`
  - Test almacenamiento dual vectors
  - Test búsqueda con 256d
  - Test re-ranking con 1536d

### E2E Tests:
- `test_tier_flow.py`
  - Test documento pequeño en FREE (debe pasar)
  - Test documento grande en FREE (debe fallar con 402)
  - Test documento grande en STARTER (debe pasar)

---

## 1.12 Checklist de Completitud Fase 1

- [ ] `tier_models.py` creado con todos los modelos
- [ ] `tier_validator.py` con todas las validaciones
- [ ] `tier_messages.py` con mensajes de error
- [ ] `settings.py` actualizado con config Matryoshka
- [ ] `ingestion_models.py` actualizado
- [ ] `qdrant_handler.py` soporta dual vectors
- [ ] `ingestion_routes.py` integra validaciones
- [ ] Tabla `user_usage_stats` creada en Supabase
- [ ] Tests unitarios pasando
- [ ] Tests de integración pasando
- [ ] Documentación de API actualizada

---

# FASE 2: Matryoshka Re-ranking Completo + Semantic Chunking

**Duración estimada:** 1-2 semanas  
**Objetivo:** Optimizar retrieval y chunking sin dependencia de LLM
**Prerrequisito:** Fase 1 completada

## 2.1 Two-Stage Retrieval Completo

### Archivos a modificar:
- `ingestion_service/handler/qdrant_handler.py`

### Nuevo método `search_two_stage()`:
```
Parámetros:
- query_embedding_full: List[float] (1536d)
- tenant_id, agent_id, collection_ids (filtros existentes)
- candidates_count: int = 100 (configurable por tier)
- final_limit: int = 10

Flujo:
1. Truncar query a 256d
2. Buscar Top-{candidates_count} con dense_search
3. Para cada candidato, calcular similaridad con dense_full
4. Re-ordenar por score full
5. Aplicar fact_density boost si existe
6. Retornar Top-{final_limit}
```

### Optimización con Qdrant Prefetch:
- Usar `Prefetch` para traer dense_full en segunda fase
- Evitar múltiples round-trips

---

## 2.2 Semantic Chunking

### Archivos a crear:
- `ingestion_service/chunking/__init__.py`
- `ingestion_service/chunking/semantic_chunker.py`
- `ingestion_service/chunking/chunking_strategy.py`

### Enum `ChunkingStrategy`:
- FIXED_SIZE (actual)
- SEMANTIC (nuevo)
- RECURSIVE (por estructura)

### Clase `SemanticChunker`:
```
Métodos:
- chunk_document(text: str, max_chunk_size: int) -> List[Chunk]

Algoritmo:
1. Dividir texto en oraciones (usando spaCy o NLTK)
2. Generar embeddings para cada oración (batch, económico)
3. Calcular similaridad entre oraciones consecutivas
4. Cuando similaridad < threshold → boundary de chunk
5. Agrupar oraciones en chunks respetando max_size
6. Retornar chunks con metadata de boundaries
```

### Configuración por Tier:
- FREE: FIXED_SIZE (más rápido, menos costoso)
- STARTER+: SEMANTIC (mejor calidad)

---

## 2.3 Modificación de DocumentHandler

### Archivos a modificar:
- `ingestion_service/handler/document_handler.py`

### Cambios:
- Inyectar `ChunkingStrategy` según tier
- Si SEMANTIC:
  - Usar SemanticChunker en lugar de SentenceSplitter
  - Generar embeddings de oraciones (llamada batch pequeña)
- Mantener fallback a FIXED_SIZE si falla

### Nuevo parámetro en `process_document()`:
- `chunking_strategy: ChunkingStrategy`
- Se determina según tier del usuario

---

## 2.4 Flag para Desactivar LLM Preprocessing

### Archivos a modificar:
- `ingestion_service/handler/document_handler.py`
- `ingestion_service/config/settings.py`

### Lógica:
```python
# Determinar si usar preprocessing
use_preprocessing = (
    settings.enable_document_preprocessing and
    tier_limits.llm_preprocessing_enabled and
    document_tokens > settings.preprocessing_min_tokens  # ej: 4000
)
```

### Para FREE y STARTER:
- `llm_preprocessing_enabled = False`
- Saltar todo el flujo de PreprocessHandler
- Usar chunking tradicional con Matryoshka

### Para PRO+:
- Preprocessing opcional (flag en request)
- Default: desactivado para velocidad

---

## 2.5 Optimización de BM25 Text

### Archivos a modificar:
- `ingestion_service/models/ingestion_models.py`

### Cambios en `ChunkModel.get_bm25_text()`:
```python
def get_bm25_text(self) -> str:
    """BM25 sin repeticiones artificiales."""
    parts = []
    
    # Keywords extraídas (si existen)
    if self.keywords:
        parts.append(" ".join(self.keywords))
    
    # Contenido principal
    parts.append(self.content_raw or self.content)
    
    return " ".join(parts)
```

### Eliminar:
- Repetición x3 de search_anchors
- Repetición x2 de atomic_facts
- Esto no mejora BM25 y aumenta tamaño

---

## 2.6 Extracción de Keywords con TF-IDF

### Archivos a crear:
- `ingestion_service/extractors/keyword_extractor.py`

### Clase `KeywordExtractor`:
```
Métodos:
- extract_keywords(text: str, top_k: int = 10) -> List[str]

Implementación:
- Usar sklearn TfidfVectorizer
- Extraer top-k términos por TF-IDF score
- Filtrar stopwords
- Retornar lista de keywords
```

### Uso:
- Reemplaza `search_anchors` generados por LLM
- Costo: ~0 (procesamiento local)
- Calidad: Similar para BM25

---

## 2.7 Flujo Completo Fase 2

```
1. Documento pasa validación de Tier (Fase 1)
                │
                ▼
2. Determinar ChunkingStrategy según tier
   - FREE: FIXED_SIZE
   - STARTER+: SEMANTIC
                │
                ▼
3. Ejecutar chunking apropiado
                │
                ▼
4. Extraer keywords con TF-IDF (reemplaza search_anchors)
                │
                ▼
5. Generar embeddings 1536d
                │
                ▼
6. Almacenar con dual vectors (256d + 1536d)
                │
                ▼
7. En búsqueda:
   - Fase 1: Top-100 con 256d
   - Fase 2: Re-rank con 1536d
   - Aplicar boost si aplica
```

---

## 2.8 Checklist de Completitud Fase 2

- [ ] `SemanticChunker` implementado y testeado
- [ ] `ChunkingStrategy` enum creado
- [ ] `DocumentHandler` usa estrategia según tier
- [ ] `search_two_stage()` implementado en QdrantHandler
- [ ] `KeywordExtractor` reemplaza LLM search_anchors
- [ ] BM25 text optimizado (sin repeticiones)
- [ ] Flag de preprocessing respeta tier
- [ ] Tests de calidad de retrieval (benchmark interno)
- [ ] Documentación actualizada

---

# FASE 3: LLM Preprocessing como Feature Premium

**Duración estimada:** 1 semana  
**Objetivo:** Optimizar uso de LLM solo para casos que lo justifiquen
**Prerrequisito:** Fase 2 completada

## 3.1 Batch LLM Calls

### Archivos a modificar:
- `ingestion_service/handler/preprocess_handler.py`
- `ingestion_service/prompts/document_preprocess.py`

### Cambio de arquitectura:
**Actual:** 1 llamada LLM por chunk
**Nuevo:** 1 llamada LLM para N chunks (batch)

### Nuevo prompt batch:
```
Dado el documento y sus chunks, genera enrichment para cada uno.

DOCUMENTO CONTEXTO:
{document_summary}

CHUNKS:
[1] {chunk_1_content}
[2] {chunk_2_content}
...
[N] {chunk_n_content}

Responde con JSON array:
[
  {"chunk_id": 1, "contextual_prefix": "...", "fact_density": 0.7, ...},
  {"chunk_id": 2, ...},
  ...
]
```

### Beneficios:
- Reducción 90%+ en llamadas LLM
- Mejor contexto (LLM ve todos los chunks juntos)
- Menor latencia total

### Límites batch:
- Max chunks por batch: 10-15 (según context window del modelo)
- Si más chunks → múltiples batches

---

## 3.2 Preprocessing Condicional

### Archivos a modificar:
- `ingestion_service/services/ingestion_service.py`
- `ingestion_service/handler/document_handler.py`

### Lógica de decisión:
```python
def should_use_llm_preprocessing(
    tier: TierLevel,
    doc_tokens: int,
    user_preference: bool
) -> bool:
    # Solo disponible para PRO+
    if tier not in [TierLevel.PRO, TierLevel.BUSINESS]:
        return False
    
    # Usuario debe solicitarlo explícitamente
    if not user_preference:
        return False
    
    # Solo útil para documentos medianos/grandes
    if doc_tokens < 4000:  # ~3 páginas
        return False
    
    return True
```

### Nuevo campo en Request:
- `enable_llm_enrichment: bool = False`
- Solo se procesa si tier lo permite

---

## 3.3 NER con spaCy para Entities

### Archivos a crear:
- `ingestion_service/extractors/entity_extractor.py`

### Clase `EntityExtractor`:
```
Dependencia: spacy con modelo es_core_news_lg

Métodos:
- extract_entities(text: str) -> Dict[str, List[str]]

Retorna:
{
  "persons": ["Juan García", "María López"],
  "organizations": ["Acme Corp", "Universidad X"],
  "dates": ["2024-03-15", "enero 2025"],
  "amounts": ["$15,000", "25%"],
  "locations": ["Madrid", "España"]
}
```

### Ventajas sobre LLM:
- 1000x más rápido
- Más preciso para NER estándar
- Costo: $0
- Reproducible

### Uso:
- Reemplaza `normalized_entities` del LLM
- Se ejecuta para todos los tiers (es gratis)

---

## 3.4 Fact Density Heurística

### Archivos a crear:
- `ingestion_service/extractors/density_calculator.py`

### Función `calculate_fact_density()`:
```python
def calculate_fact_density(
    text: str,
    entities: Dict[str, List[str]]
) -> float:
    """
    Calcula densidad de hechos basada en signals objetivos.
    
    Signals:
    - Proporción de entidades nombradas
    - Proporción de números
    - Proporción de fechas
    - Presencia de tablas/listas
    
    Retorna: float entre 0.0 y 1.0
    """
    word_count = len(text.split())
    
    # Contar signals
    entity_count = sum(len(v) for v in entities.values())
    number_count = len(re.findall(r'\d+', text))
    has_table = '[TABLE]' in text or '|' in text
    
    # Calcular densidades parciales
    entity_density = min(entity_count / word_count, 0.3) / 0.3
    number_density = min(number_count / word_count, 0.2) / 0.2
    table_bonus = 0.2 if has_table else 0
    
    # Combinar
    density = (
        0.4 * entity_density +
        0.3 * number_density +
        0.1 * table_bonus +
        0.2 * 0.5  # baseline
    )
    
    return min(density, 1.0)
```

### Ventajas:
- Reproducible (mismo input = mismo output)
- Interpretable
- Sin costo

---

## 3.5 Flujo Completo Fase 3

```
1. Documento llega con enable_llm_enrichment=True
                │
                ▼
2. Verificar tier >= PRO
   │
   ├── NO → Usar flujo Fase 2 (sin LLM)
   │
   └── SÍ ──▼

3. Verificar doc_tokens > 4000
   │
   ├── NO → Usar flujo Fase 2 (LLM no aporta valor)
   │
   └── SÍ ──▼

4. Chunking (Semantic o Fixed según tier)
                │
                ▼
5. Extraer entidades con spaCy (todos los chunks)
                │
                ▼
6. Calcular fact_density heurístico
                │
                ▼
7. Batch LLM enrichment (10 chunks por llamada)
   - Generar contextual_prefix
   - Generar search_anchors mejorados
                │
                ▼
8. Combinar: entities de spaCy + enrichment de LLM
                │
                ▼
9. Generar embeddings y almacenar
```

---

## 3.6 Checklist de Completitud Fase 3

- [ ] Batch prompting implementado
- [ ] Preprocessing condicional por tier
- [ ] `EntityExtractor` con spaCy funcionando
- [ ] `calculate_fact_density()` heurístico
- [ ] Nuevo campo `enable_llm_enrichment` en request
- [ ] Tests comparando calidad LLM vs heurístico
- [ ] Documentación de cuándo usar LLM enrichment

---

# FASE 4: Late Chunking con Jina v3

**Duración estimada:** 2-3 semanas  
**Objetivo:** Máxima calidad para documentos largos en Business tier
**Prerrequisito:** Fases 1-3 completadas

## 4.1 Cliente Jina v3

### Archivos a crear:
- `ingestion_service/clients/jina_client.py`

### Clase `JinaEmbeddingClient`:
```
Configuración:
- api_key: str
- model: str = "jina-embeddings-v3"
- task: str = "retrieval.passage"

Métodos:
- embed_with_late_chunking(
    document: str,
    chunk_boundaries: List[Tuple[int, int]]
  ) -> List[List[float]]
  
- embed_query(query: str) -> List[float]
```

### API Jina v3:
- Soporta `late_chunking=True`
- Soporta `dimensions` (MRL como OpenAI)
- Context length: 8192 tokens

---

## 4.2 Late Chunking Pipeline

### Archivos a crear:
- `ingestion_service/chunking/late_chunker.py`

### Clase `LateChunker`:
```
Flujo:
1. Recibir documento completo
2. Tokenizar y marcar boundaries de chunks
3. Enviar a Jina con late_chunking=True
4. Recibir embeddings ya contextualizados por chunk
5. Retornar chunks con embeddings

Diferencia clave:
- Chunking tradicional: Chunk → Embed (pierde contexto)
- Late chunking: Embed(doc completo) → Chunk en embedding space (preserva contexto)
```

---

## 4.3 Selector de Modelo Dinámico

### Archivos a crear:
- `ingestion_service/services/model_selector.py`

### Clase `EmbeddingModelSelector`:
```
Lógica:
- Si tier == BUSINESS y doc_tokens > 8000:
  → Usar Jina v3 con Late Chunking
- Si tier >= STARTER:
  → Usar OpenAI con Matryoshka Re-ranking
- Si tier == FREE:
  → Usar OpenAI básico (sin re-ranking)

Métodos:
- select_model(tier: TierLevel, doc_tokens: int) -> EmbeddingConfig
- get_client(config: EmbeddingConfig) -> BaseEmbeddingClient
```

---

## 4.4 Almacenamiento Híbrido

### Archivos a modificar:
- `ingestion_service/handler/qdrant_handler.py`

### Cambios:
- Soportar embeddings de diferentes dimensiones
- Jina v3 default: 1024d (configurable)
- Índice separado o mismo con padding? → Mismo con metadata de modelo

### Nuevo campo en payload:
- `embedding_model: str` ("openai" | "jina")
- `embedding_dimensions: int`

### Búsqueda:
- Filtrar por modelo si es necesario
- O normalizar dimensiones

---

## 4.5 A/B Testing Framework

### Archivos a crear:
- `ingestion_service/evaluation/ab_test.py`

### Funcionalidad:
```
Métodos:
- create_test(name: str, variants: List[str])
- assign_variant(user_id: str, test_name: str) -> str
- log_result(user_id: str, test_name: str, metric: str, value: float)
- get_results(test_name: str) -> Dict[str, Stats]

Uso:
- 50% usuarios Business con Late Chunking
- 50% usuarios Business con Matryoshka
- Medir: retrieval quality, latencia, satisfacción
```

---

## 4.6 Flujo Completo Fase 4

```
1. Documento llega de usuario BUSINESS
                │
                ▼
2. EmbeddingModelSelector evalúa:
   - doc_tokens > 8000? → Late Chunking candidato
   - A/B test activo? → Asignar variante
                │
                ▼
3. Si Late Chunking:
   │
   ├── Tokenizar documento completo
   │
   ├── Marcar chunk boundaries
   │
   ├── Enviar a Jina v3 con late_chunking=True
   │
   ├── Recibir embeddings contextualizados
   │
   └── Almacenar con metadata modelo="jina"
                │
                ▼
4. Si Matryoshka (fallback o A/B):
   │
   └── Flujo Fase 2 normal
                │
                ▼
5. Log de métricas para A/B test
```

---

## 4.7 Migración de Documentos Existentes

### Consideraciones:
- Documentos indexados con OpenAI siguen funcionando
- Late Chunking es opt-in para nuevos documentos
- Re-indexación manual disponible para Business

### Nuevo endpoint:
- `POST /api/v1/document/{id}/reindex`
- Permite re-procesar con nuevo modelo
- Solo disponible para BUSINESS

---

## 4.8 Checklist de Completitud Fase 4

- [ ] `JinaEmbeddingClient` implementado
- [ ] `LateChunker` funcionando
- [ ] `EmbeddingModelSelector` con lógica de decisión
- [ ] Almacenamiento híbrido en Qdrant
- [ ] A/B testing framework
- [ ] Endpoint de re-indexación
- [ ] Benchmarks comparativos documentados
- [ ] Documentación de cuándo usar Late Chunking

---

# Resumen de Dependencias entre Fases

```
FASE 1 (Base)
    │
    ├── Sistema de Tiers
    ├── Matryoshka dual vectors
    └── Validaciones
         │
         ▼
FASE 2 (Optimización)
    │
    ├── Two-stage retrieval
    ├── Semantic chunking
    └── Keyword extraction
         │
         ▼
FASE 3 (Premium Features)
    │
    ├── Batch LLM (opcional)
    ├── NER con spaCy
    └── Fact density heurístico
         │
         ▼
FASE 4 (Enterprise)
    │
    ├── Late Chunking Jina
    ├── Multi-model support
    └── A/B testing
```

---

# Timeline Estimado

| Fase | Duración | Recursos | Entregable |
|------|----------|----------|------------|
| **Fase 1** | 1-2 semanas | 1 dev | Tiers + Matryoshka base funcionando |
| **Fase 2** | 1-2 semanas | 1 dev | Retrieval optimizado + Semantic chunking |
| **Fase 3** | 1 semana | 1 dev | LLM como feature premium |
| **Fase 4** | 2-3 semanas | 1-2 dev | Late Chunking + A/B testing |

**Total estimado:** 5-8 semanas para implementación completa

---

# Métricas de Éxito

| Métrica | Baseline (actual) | Target Fase 2 | Target Fase 4 |
|---------|-------------------|---------------|---------------|
| Costo indexación/doc | ~$0.50 | ~$0.02 | ~$0.05 |
| Latencia indexación | 100s | 5s | 10s |
| NDCG@10 | 0.58 (est) | 0.67 | 0.72 |
| Recall@10 | 0.65 (est) | 0.75 | 0.80 |
| Docs >8k soportados | Sí (caro) | Sí (según tier) | Sí (óptimo) |
