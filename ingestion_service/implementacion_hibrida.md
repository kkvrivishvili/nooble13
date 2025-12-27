# Guía de Implementación: Búsqueda Híbrida en Qdrant con BM25 Nativo

## 1. Análisis de Impacto y Beneficios

Antes de proceder, es importante entender qué ganamos y qué costo tiene esta implementación.

### 🚀 Beneficios (Precisión y Recall)
- **Mejora del Recall (+20-30%)**: Al combinar búsqueda semántica (OpenAI) con léxica (BM25), se recuperan documentos que usan terminología exacta pero que el modelo semántico podría haber omitido.
- **Robustez ante "Out-of-Domain"**: BM25 es excelente para encontrar códigos, IDs, nombres propios o terminología técnica específica que un modelo de embedding generalista (como `text-embedding-3-small`) no captura bien.
- **Mejor Ranking (Rank Fusion)**: El algoritmo RRF garantiza que si un documento es relevante tanto semánticamente como por palabras clave, subirá a la primera posición.

### ⚡ Impacto en Rendimiento (Latencia)
- **Incremento de Latencia**: La búsqueda híbrida requiere ejecutar DOS consultas en paralelo (Dense + Sparse) y luego fusionarlas.
- **Estimación**: Si tu búsqueda actual tarda ~50ms, la híbrida podría tardar ~80-100ms.
- **Sobrecarga en Ingestion**: Generar el vector disperso (BM25) es muy rápido (CPU), pero aumenta ligeramente el tamaño de almacenamiento en Qdrant.

---

## 2. Arquitectura de la Solución

Utilizaremos el enfoque **"Native BM25"** de Qdrant.

- **Modelo**: `Qdrant/bm25` (vía `fastembed`) para tokenización.
- **Cálculo IDF**: Qdrant lo maneja internamente en el servidor (no necesitamos calcularlo nosotros).
- **Almacenamiento**: Cada punto tendrá dos vectores:
  1. `dense` (1536 dim, OpenAI)
  2. `bm25` (Sparse Vector, Clave-Valor)

---

## 3. Guía de Implementación Paso a Paso

### Paso 1: Actualizar Dependencias

Necesitamos `qdrant-client` >= 1.12.0 con soporte para `fastembed`.

**En `ingestion_service/requirements.txt` y `query_service/requirements.txt`:**

```diff
- qdrant-client==1.9.1
+ qdrant-client[fastembed]>=1.12.0
```

### Paso 2: Modificar `Ingestion Service`

Archivo: `ingestion_service/handler/qdrant_handler.py`

#### 2.1. Inicializar el Modelo Sparse
En el `__init__`:

```python
from fastembed import SparseTextEmbedding

class QdrantHandler:
    def __init__(self, ...):
        # ... código existente ...
        
        # Inicializar modelo BM25 ligero
        self.sparse_embedding_model = SparseTextEmbedding(model_name="Qdrant/bm25")
```

#### 2.2. Actualizar Creación de Colección
Habilitar vector sparse con modificador IDF:

```python
from qdrant_client import models

async def create_collection(self):
    if not await self.client.collection_exists(self.collection_name):
        await self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config={
                "dense": models.VectorParams(
                    size=1536,
                    distance=models.Distance.COSINE
                )
            },
            # Configuración para BM25 Nativo
            sparse_vectors_config={
                "bm25": models.SparseVectorParams(
                    modifier=models.Modifier.IDF
                )
            }
        )
```

#### 2.3. Generar y Guardar Vectores
En `store_chunks`:

```python
async def store_chunks(self, chunks, ...):
    points = []
    
    # Pre-calcular sparse vectors (es rápido en CPU)
    texts = [c.content for c in chunks]
    sparse_vectors = list(self.sparse_embedding_model.embed(texts))

    for i, chunk in enumerate(chunks):
        # Convertir a formato SparseVector de Qdrant
        sparse_vec = models.SparseVector(
            indices=sparse_vectors[i].indices.tolist(),
            values=sparse_vectors[i].values.tolist()
        )

        point = models.PointStruct(
            id=chunk.chunk_id,
            vector={
                "dense": chunk.embedding,  # Vector de OpenAI
                "bm25": sparse_vec         # Vector BM25
            },
            payload={...} # Payload existente
        )
        points.append(point)
        
    # Upsert...
```

### Paso 3: Modificar `Query Service`

Archivo: `query_service/clients/qdrant_client.py`

#### 3.1. Inicializar Modelo
Igual que en Ingestion, necesitamos el modelo para tokenizar la query.

```python
# En __init__
self.sparse_embedding_model = SparseTextEmbedding(model_name="Qdrant/bm25")
```

#### 3.2. Implementar Búsqueda Híbrida
En el método `search`:

```python
async def search(self, query_embedding, query_text, ...):
    # 1. Generar vector sparse de la consulta
    query_sparse = list(self.sparse_embedding_model.embed([query_text]))[0]
    
    # 2. Construir Prefetch (Búsquedas paralelas)
    prefetch = [
        # Búsqueda Semántica
        models.Prefetch(
            query=query_embedding,
            using="dense",
            limit=limit
        ),
        # Búsqueda Léxica (BM25)
        models.Prefetch(
            query=models.SparseVector(
                indices=query_sparse.indices.tolist(),
                values=query_sparse.values.tolist()
            ),
            using="bm25",
            limit=limit
        )
    ]
    
    # 3. Ejecutar Query con Fusión RRF
    results = await self.client.query_points(
        collection_name=self.collection_name,
        prefetch=prefetch,
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        query_filter=qdrant_filter, # Tu filtro existente (tenant, agent...)
        limit=limit
    )
    
    return results.points
```

---

## 4. Notas Finales de Migración

> [!WARNING]
> **Re-Ingestion Requerida**: Como cambiamos la estructura de la colección (agregando `sparse_vectors_config`), la colección antigua no servirá.
> 
> 1. Detener servicios.
> 2. Borrar colección en Qdrant (o cambiar nombre en `.env`).
> 3. Reiniciar servicios (se creará la nueva colección).
> 4. Re-procesar documentos para llenar los vectores.

