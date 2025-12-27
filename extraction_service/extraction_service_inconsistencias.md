# Análisis de Inconsistencias - Extraction Service

**Fecha de análisis:** Diciembre 2024  
**Servicio:** `extraction_service`  
**Versión analizada:** 1.0.0

---

## Resumen Ejecutivo

Se identificaron **23 inconsistencias** en el código del `extraction_service`, categorizadas por severidad:

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| 🔴 Crítica | 4 | Pueden causar fallos en producción |
| 🟠 Alta | 7 | Afectan funcionalidad o mantenibilidad |
| 🟡 Media | 8 | Mejoras recomendadas |
| 🟢 Baja | 4 | Estilo y documentación |

---

## 🔴 Inconsistencias Críticas

### 1. Callback a Ingestion Service No Implementado

**Archivo:** `workers/extraction_worker.py`  
**Líneas:** 24-28, 60-95

**Problema:**  
El docstring indica que el worker envía callbacks a `ingestion.extraction_callback`, pero no existe código que implemente esta funcionalidad. El método `_handle_action` retorna un diccionario pero no hay lógica para enviarlo al stream de ingestion-service.

```python
# Documentación dice:
"""
Envía callbacks a:
- ingestion.extraction_callback
"""

# Pero el código solo retorna el resultado sin enviarlo:
async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
    ...
    return result  # ← No se envía a ningún stream
```

**Impacto:** El pipeline de ingestion nunca recibe notificación de que la extracción terminó.

**Solución propuesta:**
```python
async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
    result = await self.extraction_service.process_action(action)
    
    if result:
        # Enviar callback a ingestion-service
        callback_action = DomainAction(
            action_type="ingestion.extraction_callback",
            tenant_id=action.tenant_id,
            data=result,
            correlation_id=action.correlation_id
        )
        await self._send_to_stream("ingestion-service:actions", callback_action)
    
    return result
```

---

### 2. Configuración de Docling Incompatible con API v2.x

**Archivo:** `handlers/docling_handler.py`  
**Líneas:** 64-79

**Problema:**  
El código intenta inicializar `DocumentConverter` con parámetros que no existen en Docling 2.31.0:

```python
# Código actual (INCORRECTO para Docling 2.x):
pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = self.enable_ocr
pipeline_options.do_table_structure = True

self._converter = DocumentConverter(
    allowed_formats=[...],
    pdf_backend=PyPdfiumDocumentBackend,  # ← No existe este parámetro
    pipeline_options=pipeline_options      # ← No existe este parámetro
)
```

**Impacto:** El servicio fallará al inicializar si Docling está instalado.

**Solución propuesta:**
```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline

def _initialize_converter(self):
    try:
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = self.enable_ocr
        pipeline_options.do_table_structure = True
        
        self._converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=pipeline_options
                )
            }
        )
```

---

### 3. Doble Inicialización del Servicio

**Archivos:** `main.py` (línea 52) y `workers/extraction_worker.py` (línea 51)

**Problema:**  
El servicio de extracción se inicializa dos veces:

```python
# main.py - Primera inicialización
await extraction_service.initialize()

# Luego en el worker - Segunda inicialización
async def initialize(self):
    if self.extraction_service:
        await self.extraction_service.initialize()  # ← DUPLICADO
```

**Impacto:** 
- Los modelos de spaCy podrían cargarse múltiples veces
- Desperdicio de memoria y tiempo de arranque
- Posibles race conditions si hay múltiples workers

**Solución propuesta:**
```python
# extraction_worker.py
async def initialize(self):
    # Remover la inicialización del servicio aquí
    # El servicio ya fue inicializado en main.py
    await super().initialize()
```

---

### 4. Componentes de spaCy No Se Deshabilitan Realmente

**Archivo:** `handlers/spacy_handler.py`  
**Líneas:** 85-94

**Problema:**  
Se construye una lista de componentes a deshabilitar pero nunca se usa:

```python
disable_components = []
for comp in ['parser', 'textcat', 'tagger']:
    if comp in nlp.pipe_names and comp != 'ner':
        disable_components.append(comp)

if disable_components:
    self._logger.debug(f"Disabling components: {disable_components}")
    # ← FALTA: nlp.disable_pipes(*disable_components)

nlp.max_length = self.max_text_length
self._loaded_models[model_name] = nlp  # Se guarda sin deshabilitar
```

**Impacto:** Procesamiento más lento y mayor uso de memoria.

**Solución propuesta:**
```python
if disable_components:
    self._logger.debug(f"Disabling components: {disable_components}")
    for comp in disable_components:
        nlp.disable_pipe(comp)
```

---

## 🟠 Inconsistencias de Alta Severidad

### 5. `TableInfo` No Exportado en `__init__.py`

**Archivo:** `models/__init__.py`

**Problema:**  
El modelo `TableInfo` se usa en `docling_handler.py` y `fallback_handler.py` pero no está exportado:

```python
# models/__init__.py - FALTA TableInfo
from .extraction_models import (
    ProcessingMode,
    SpacyModelSize,
    ExtractionRequest,
    ExtractionResult,
    DocumentStructure,
    SectionInfo,
    SpacyEnrichment,
    EntityInfo,
    ExtractionStatus,
    ExtractionError
    # TableInfo ← FALTA
)
```

**Impacto:** Imports inconsistentes en el código.

---

### 6. Acceso a Método Privado Entre Módulos

**Archivo:** `services/extraction_service.py`  
**Línea:** 193

**Problema:**  
Se accede a un método privado `_get_model_name` desde otro módulo:

```python
spacy_model_used = self.spacy_handler._get_model_name(
    enrichment.language, model_size
)
```

**Impacto:** Viola el encapsulamiento y dificulta refactorizaciones.

**Solución propuesta:**
```python
# En spacy_handler.py - hacer el método público
def get_model_name(self, language: str, size: SpacyModelSize) -> str:
    """Obtiene el nombre del modelo según idioma y tamaño."""
    lang = language if language in self.MODEL_MAP else self.default_language
    return self.MODEL_MAP[lang][size]
```

---

### 7. Inconsistencia en Fuente de `tenant_id`

**Archivo:** `services/extraction_service.py`  
**Líneas:** 98-108 vs 116

**Problema:**  
En errores de validación, `tenant_id` viene de `action.tenant_id`, pero en el request parseado viene de `action.data`:

```python
# En error de validación (línea 107):
str(action.tenant_id)  # ← Viene del DomainAction

# En request parseado (línea 116):
request = ExtractionRequest(**action.data)  # ← tenant_id de action.data
```

**Impacto:** Posible discrepancia si los valores difieren.

---

### 8. Falta Validación de Archivo Antes de Procesamiento

**Archivo:** `services/extraction_service.py`

**Problema:**  
No se valida que el archivo exista o sea accesible antes de delegarle al handler:

```python
async def _handle_extraction(self, action: DomainAction) -> Dict[str, Any]:
    request = ExtractionRequest(**action.data)
    # ← FALTA: Validar que request.file_path existe y es legible
    
    if self.docling_handler and self.docling_handler.is_available:
        text, doc_structure, error = await self.docling_handler.extract_document(...)
```

**Solución propuesta:**
```python
# Validar archivo antes de procesar
file_path = Path(request.file_path)
if not file_path.exists():
    return self._create_error_result(
        request.task_id, request.document_id, request.tenant_id,
        ExtractionError(
            error_type="FileNotFoundError",
            error_message=f"File not found: {request.file_path}",
            stage="validation",
            recoverable=False
        )
    )
```

---

### 9. Manejo Inconsistente de Excepciones en Fallback

**Archivo:** `handlers/fallback_handler.py`  
**Líneas:** 64-89

**Problema:**  
En `extract_document`, si el tipo no es reconocido, se intenta `_extract_text` como fallback genérico, pero si esto falla para binarios, la excepción no es informativa:

```python
else:
    # Intento genérico de texto plano
    text, structure = await self._extract_text(path)  # ← Fallará para binarios
```

---

### 10. Falta Límite de Tamaño de Archivo

**Archivo:** `services/extraction_service.py`

**Problema:**  
Existe configuración `max_file_size_mb` en settings pero nunca se usa:

```python
# settings.py
max_file_size_mb: int = Field(
    default=50,
    description="Tamaño máximo de archivo en MB"
)

# extraction_service.py - NO SE VALIDA
```

---

### 11. Stream de Redis Hardcodeado

**Archivo:** `main.py`  
**Línea:** 43

**Problema:**  
El nombre del stream debería venir de configuración, no estar implícito en el BaseWorker.

---

## 🟡 Inconsistencias de Severidad Media

### 12. Detección de Idioma Indistinguible

**Archivo:** `handlers/spacy_handler.py`  
**Líneas:** 121-135

**Problema:**  
Cuando langdetect no está disponible y cuando falla, ambos retornan `(default_language, 0.5)`:

```python
if not LANGDETECT_AVAILABLE:
    return self.default_language, 0.5  # No disponible

except Exception:
    return self.default_language, 0.5  # Error
```

**Solución:** Usar valores de confianza distintos (ej: 0.0 para no disponible).

---

### 13. Logs Sin Contexto de Correlación

**Múltiples archivos**

**Problema:**  
Muchos logs no incluyen `correlation_id` para trazabilidad distribuida:

```python
self._logger.info("Docling extraction successful")  # ← Sin correlation_id
```

**Solución:**
```python
self._logger.info(
    "Docling extraction successful",
    extra={"correlation_id": correlation_id, ...}
)
```

---

### 14. Constantes Mágicas en Código

**Archivo:** `handlers/fallback_handler.py`

**Problema:**  
Valores hardcodeados que deberían ser configurables:

```python
return sections[:50]  # ← Por qué 50?
page_count=max(1, len(text) // 3000)  # ← Por qué 3000?
```

---

### 15. Falta Retry en Operaciones de Redis

**Archivo:** `workers/extraction_worker.py`

**Problema:**  
No hay lógica de retry para operaciones que podrían fallar temporalmente.

---

### 16. Cleanup de Archivo Sin Verificar Éxito

**Archivo:** `services/extraction_service.py`  
**Líneas:** 223-230

**Problema:**  
Se limpia el archivo temporal incluso si la extracción falló parcialmente:

```python
# Se limpia siempre si cleanup_temp_files está habilitado
if self.cleanup_temp_files:
    self._cleanup_file(request.file_path)  # ← Podría necesitarse para debug
```

---

### 17. Modelo de Error Sin Timestamp

**Archivo:** `models/extraction_models.py`

**Problema:**  
`ExtractionError` no tiene timestamp, dificultando debugging:

```python
class ExtractionError(BaseModel):
    error_type: str
    error_message: str
    stage: str
    recoverable: bool
    details: Optional[Dict[str, Any]]
    # timestamp: datetime ← FALTA
```

---

### 18. Falta Métricas/Observabilidad

**Múltiples archivos**

**Problema:**  
No hay exportación de métricas (Prometheus, StatsD, etc.) para:
- Tiempo de extracción por tipo de documento
- Tasa de éxito/fallo de Docling vs Fallback
- Uso de modelos spaCy

---

### 19. Inconsistencia en Tipos de Retorno Async

**Archivo:** `handlers/fallback_handler.py`

**Problema:**  
Algunos métodos `_extract_*` son async pero no hacen operaciones async:

```python
async def _extract_text(self, path: Path) -> Tuple[str, DocumentStructure]:
    text = path.read_text(...)  # ← Operación síncrona
```

---

## 🟢 Inconsistencias de Baja Severidad

### 20. Documentación Desactualizada

**Archivo:** `__init__.py`

**Problema:**  
El docstring menciona características que no están claramente implementadas.

---

### 21. Imports No Utilizados Potenciales

**Archivo:** `handlers/docling_handler.py`

**Problema:**  
Se importa `InputFormat` pero podría no usarse correctamente con la nueva API.

---

### 22. Inconsistencia en Estilo de Logging

**Múltiples archivos**

**Problema:**  
Mezcla de f-strings y formato con extra:

```python
self._logger.info(f"Starting extraction")  # f-string
self._logger.info("Completed", extra={...})  # Con extra
```

---

### 23. Comentarios en Español e Inglés Mezclados

**Múltiples archivos**

**Problema:**  
Mezcla de idiomas en documentación y comentarios.

---

## Recomendaciones Prioritarias

### Acción Inmediata (Antes de Producción)

1. **Implementar callback a ingestion-service** - Sin esto, el pipeline está roto
2. **Corregir inicialización de Docling** - El servicio no arrancará
3. **Eliminar doble inicialización** - Evitar problemas de memoria

### Corto Plazo (Sprint Actual)

4. Exportar `TableInfo` en `__init__.py`
5. Hacer público el método `get_model_name`
6. Agregar validación de archivo y tamaño máximo
7. Deshabilitar componentes de spaCy no usados

### Mediano Plazo (Próximo Sprint)

8. Implementar métricas de observabilidad
9. Agregar retry logic para Redis
10. Unificar estilo de logging
11. Documentar API de handlers

---

## Diagrama de Dependencias con Problemas

```
┌─────────────────────────────────────────────────────────────────┐
│                          main.py                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ extraction_service.initialize() ──────────────────────┐ │    │
│  └─────────────────────────────────────────────────────────┘ │    │
│                           │                                  │    │
│                           ▼                                  │    │
│  ┌─────────────────────────────────────────────────────────┐ │    │
│  │ ExtractionWorker.initialize()                          │ │    │
│  │   └── extraction_service.initialize() ◄── DUPLICADO ──┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ExtractionWorker                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ _handle_action()                                        │    │
│  │   └── return result ◄── NO ENVÍA CALLBACK               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           ✗                                      │
│                     (debería enviar a)                           │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ingestion-service:actions ◄── NUNCA RECIBE              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archivos Afectados por Severidad

| Archivo | 🔴 | 🟠 | 🟡 | 🟢 |
|---------|-----|-----|-----|-----|
| `workers/extraction_worker.py` | 2 | 1 | 1 | 0 |
| `handlers/docling_handler.py` | 1 | 0 | 1 | 1 |
| `handlers/spacy_handler.py` | 1 | 1 | 1 | 0 |
| `services/extraction_service.py` | 0 | 3 | 2 | 0 |
| `handlers/fallback_handler.py` | 0 | 1 | 2 | 0 |
| `models/extraction_models.py` | 0 | 0 | 1 | 0 |
| `models/__init__.py` | 0 | 1 | 0 | 0 |
| `main.py` | 0 | 0 | 0 | 1 |
| `config/settings.py` | 0 | 0 | 0 | 1 |

---

## Conclusión

El servicio tiene una arquitectura sólida pero requiere correcciones críticas antes de desplegarse en producción. Los problemas más urgentes están relacionados con:

1. **Comunicación inter-servicios rota** (callback no implementado)
2. **Incompatibilidad con la versión de Docling** usada en requirements.txt
3. **Ineficiencias de recursos** (doble inicialización, componentes no deshabilitados)

Se recomienda abordar las 4 inconsistencias críticas antes de cualquier despliegue.
