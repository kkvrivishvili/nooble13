# Análisis de Inconsistencias - Extraction Service (v2)

**Fecha de análisis:** Diciembre 2024  
**Servicio:** `extraction_service`  
**Versión analizada:** 1.0.0  
**Revisión:** Segunda iteración

---

## Resumen de Correcciones Aplicadas

| # | Inconsistencia Original | Estado |
|---|------------------------|--------|
| 1 | Callback no implementado | ❌ **NO CORREGIDO** |
| 2 | Configuración Docling incompatible | ⚠️ **PARCIALMENTE** |
| 3 | Doble inicialización | ✅ Corregido |
| 4 | Componentes spaCy no deshabilitados | ✅ Corregido |
| 5 | `TableInfo` no exportado | ✅ Corregido |
| 6 | Acceso a método privado | ✅ Corregido |
| 7 | Falta validación archivo/tamaño | ✅ Corregido |
| 12 | Detección idioma indistinguible | ✅ Corregido |
| 14 | Constantes mágicas | ✅ Corregido |
| 17 | Error sin timestamp | ✅ Corregido |
| 19 | Métodos async síncronos | ✅ Corregido |

---

## 🔴 Inconsistencias Críticas Pendientes

### 1. Callback a Ingestion Service NO IMPLEMENTADO

**Archivo:** `workers/extraction_worker.py`  
**Estado:** ❌ **SIN CORREGIR - CRÍTICO**

**Problema:**  
El worker procesa la extracción y retorna el resultado, pero NUNCA lo envía al stream de ingestion-service:

```python
async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
    # ...
    result = await self.extraction_service.process_action(action)
    
    if result:
        self.logger.info(...)
    
    return result  # ← Solo retorna, NO ENVÍA A NINGÚN LADO
```

**Impacto:** 
- El pipeline de ingestion está **completamente roto**
- ingestion-service nunca sabe que la extracción terminó
- Los documentos quedan en estado "processing" indefinidamente

**Solución requerida:**
```python
async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
    result = await self.extraction_service.process_action(action)
    
    if result:
        # Crear callback action para ingestion-service
        callback_action = DomainAction(
            action_type="ingestion.extraction.callback",
            tenant_id=action.tenant_id,
            data=result,
            correlation_id=action.correlation_id,
            source_service=self.app_settings.service_name
        )
        
        # Enviar al stream de ingestion-service
        await self.async_redis_conn.xadd(
            "ingestion-service:actions",
            {"payload": callback_action.model_dump_json()}
        )
        
        self.logger.info(
            f"Callback sent to ingestion-service",
            extra={"task_id": result.get("task_id")}
        )
    
    return result
```

---

### 2. Configuración de Docling Parcialmente Incorrecta

**Archivo:** `handlers/docling_handler.py`  
**Estado:** ⚠️ **PARCIALMENTE CORREGIDO**

**Problema actual:**  
Se intentó corregir pero la importación y uso siguen siendo incorrectos para Docling 2.31.0:

```python
# Código actual (líneas 64-85):
from docling.document_converter import PdfFormatOption  # ← Este import está DENTRO del método

self._converter = DocumentConverter(
    allowed_formats=[...],  # ← Este parámetro NO existe en Docling 2.31
    format_options={
        InputFormat.PDF: PdfFormatOption(
            pipeline_options=pipeline_options,
            backend=PyPdfiumDocumentBackend  # ← Sintaxis incorrecta
        )
    }
)
```

**Problemas específicos:**
1. `allowed_formats` no es un parámetro válido de `DocumentConverter`
2. `PdfFormatOption` se importa dentro del método pero podría fallar
3. La estructura de `format_options` no coincide con la API real

**Solución correcta para Docling 2.31.0:**
```python
# En imports globales:
try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption
    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False

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

**Nota:** Se debe eliminar `allowed_formats` y `backend` ya que no son parámetros válidos.

---

## 🟠 Nuevas Inconsistencias Encontradas

### 3. Falta Import de `asyncio` en `fallback_handler.py`

**Archivo:** `handlers/fallback_handler.py`  
**Líneas:** 232, 260, 284, 303

**Problema:**  
Se usa `asyncio.get_event_loop()` pero `asyncio` no está importado:

```python
# Línea 232:
loop = asyncio.get_event_loop()  # ← asyncio no está importado!

# El archivo solo importa:
import logging
import time
import re
from pathlib import Path
from typing import Tuple, Optional, List
# Falta: import asyncio
```

**Impacto:** `NameError: name 'asyncio' is not defined` en runtime.

---

### 4. Inconsistencia en Fuente de `tenant_id` Persiste

**Archivo:** `services/extraction_service.py`  
**Líneas:** 117-127 vs 134

**Problema:**  
En el bloque de validación de archivo, se usa `request.tenant_id`, pero en el catch de excepción se usa `action.tenant_id`:

```python
# Líneas 117-127 - Usa request.tenant_id (correcto)
if not file_path.exists():
    return self._create_error_result(
        str(request.task_id),
        str(request.document_id),
        str(request.tenant_id),  # ← De request
        ...
    )

# Líneas 134-143 - Usa action.tenant_id (potencialmente diferente)
except Exception as e:
    return self._create_error_result(
        action.data.get("task_id", "unknown"),
        action.data.get("document_id", "unknown"),
        str(action.tenant_id),  # ← De action, NO de action.data
        ...
    )
```

**Impacto:** Si `action.tenant_id` y `action.data["tenant_id"]` difieren, habrá inconsistencia.

---

### 5. Configuración de `supported_languages` Sin Tipo Correcto

**Archivo:** `config/settings.py`  
**Línea:** 113

**Problema:**  
`supported_languages` está tipado como `list` genérico en vez de `List[str]`:

```python
supported_languages: list = Field(
    default=["es", "en"],
    description="Idiomas soportados para procesamiento"
)
```

**Debería ser:**
```python
from typing import List

supported_languages: List[str] = Field(
    default=["es", "en"],
    description="Idiomas soportados para procesamiento"
)
```

---

### 6. Manejo de Señales No Funciona en Windows

**Archivo:** `main.py`  
**Líneas:** 97-98

**Problema:**  
`signal.signal()` con `SIGTERM` no funciona correctamente en Windows:

```python
signal.signal(signal.SIGTERM, handle_signal)  # ← No funciona en Windows
signal.signal(signal.SIGINT, handle_signal)
```

**Solución:**
```python
import sys

if sys.platform != "win32":
    signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)
```

---

### 7. Logs Usan f-strings en Lugar de Lazy Formatting

**Múltiples archivos**

**Problema:**  
Se usan f-strings para logging, lo cual evalúa los argumentos incluso si el nivel de log no está habilitado:

```python
# Ineficiente:
self._logger.info(f"Starting Docling extraction")
self._logger.debug(f"Disabling components: {disable_components}")

# Eficiente:
self._logger.info("Starting Docling extraction")
self._logger.debug("Disabling components: %s", disable_components)
```

---

### 8. `uuid` Importado Pero No Usado

**Archivo:** `models/extraction_models.py`  
**Línea:** 12

**Problema:**  
```python
import uuid  # ← Nunca se usa en el archivo
```

---

### 9. Falta Manejo de `correlation_id` en Logs

**Archivo:** `services/extraction_service.py`

**Problema:**  
Los logs no propagan `correlation_id` para trazabilidad distribuida:

```python
self._logger.info(
    "Extraction completed successfully",
    extra={
        "task_id": request.task_id,
        # Falta: "correlation_id": action.correlation_id
    }
)
```

---

### 10. Worker No Tiene Método `stop()` Explícito

**Archivo:** `workers/extraction_worker.py`

**Problema:**  
En `main.py` se llama `await worker.stop()`, pero `ExtractionWorker` no define este método. Depende completamente de `BaseWorker`:

```python
# main.py línea 80:
for worker in workers:
    await worker.stop()  # ← Asume que BaseWorker lo tiene
```

Si `BaseWorker` no implementa `stop()` correctamente, esto fallará silenciosamente.

---

### 11. Docling `max_pages` No Se Usa en Conversión

**Archivo:** `handlers/docling_handler.py`  
**Líneas:** 130-137

**Problema:**  
Se recibe `max_pages` pero nunca se pasa a Docling:

```python
async def extract_document(
    self,
    file_path: str,
    document_type: str,
    max_pages: Optional[int] = None  # ← Se recibe
) -> Tuple[str, DocumentStructure, Optional[ExtractionError]]:
    # ...
    result = await loop.run_in_executor(
        None,
        self._convert_document,
        path,
        max_pages or self.max_pages  # ← Se pasa al método
    )

def _convert_document(self, path: Path, max_pages: int):
    result = self._converter.convert(str(path))  # ← Pero NO se usa max_pages!
    return result
```

**Impacto:** Se procesan todas las páginas sin importar el límite configurado.

---

### 12. Posible Memory Leak en Modelos spaCy

**Archivo:** `handlers/spacy_handler.py`

**Problema:**  
Los modelos se cachean indefinidamente sin límite:

```python
self._loaded_models: Dict[str, spacy.Language] = {}

def _load_model(self, model_name: str) -> Optional[spacy.Language]:
    if model_name in self._loaded_models:
        return self._loaded_models[model_name]
    # ...
    self._loaded_models[model_name] = nlp  # ← Se acumulan sin límite
```

Con 4 modelos (es_md, es_lg, en_md, en_lg), esto podría usar ~1.3GB de RAM.

---

## 🟡 Inconsistencias Menores

### 13. Dockerfile Copia `.env` (Mala Práctica)

**Archivo:** `Dockerfile`  
**Línea:** 21

```dockerfile
COPY .env .  # ← NUNCA copiar .env al container
```

**Impacto:** Credenciales expuestas en la imagen.

---

### 14. `python-magic` Importado Pero No Usado

**Archivo:** `requirements.txt`

```
python-magic==0.4.27  # ← No se usa en ningún archivo
```

---

### 15. Comentarios Inconsistentes en Idioma

Mezcla de español e inglés en docstrings y comentarios.

---

## Resumen de Estado Actual

| Severidad | Pendientes | Nuevas | Total |
|-----------|------------|--------|-------|
| 🔴 Crítica | 2 | 0 | **2** |
| 🟠 Alta | 0 | 10 | **10** |
| 🟡 Media | 0 | 3 | **3** |

---

## Acciones Requeridas Antes de Producción

### Bloquers (No desplegar sin esto)

1. **Implementar callback a ingestion-service** (Inconsistencia #1)
2. **Corregir inicialización de Docling** (Inconsistencia #2)
3. **Agregar import de asyncio** en fallback_handler.py (Inconsistencia #3)

### Alta Prioridad

4. Usar `max_pages` en conversión de Docling
5. Unificar fuente de `tenant_id`
6. Remover `.env` del Dockerfile

### Recomendado

7. Agregar `correlation_id` a logs
8. Implementar límite de cache de modelos spaCy
9. Remover imports no usados

---

## Diagrama de Flujo con Problemas

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FLUJO ACTUAL (ROTO)                         │
└─────────────────────────────────────────────────────────────────────┘

ingestion-service                    extraction-service
      │                                     │
      │  DomainAction                       │
      │  (extraction.document.process)      │
      ├────────────────────────────────────►│
      │                                     │
      │                              ┌──────┴──────┐
      │                              │   Worker    │
      │                              │  procesa    │
      │                              │  documento  │
      │                              └──────┬──────┘
      │                                     │
      │                              ┌──────┴──────┐
      │                              │   Retorna   │
      │                              │   result    │
      │                              └──────┬──────┘
      │                                     │
      │         ❌ NUNCA SE ENVÍA           │
      │◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
      │                                     │
      ▼                                     ▼
  [Documento queda                    [Resultado se
   en "processing"                     pierde]
   para siempre]


┌─────────────────────────────────────────────────────────────────────┐
│                      FLUJO ESPERADO (CORRECTO)                       │
└─────────────────────────────────────────────────────────────────────┘

ingestion-service                    extraction-service
      │                                     │
      │  DomainAction                       │
      │  (extraction.document.process)      │
      ├────────────────────────────────────►│
      │                                     │
      │                              ┌──────┴──────┐
      │                              │   Worker    │
      │                              │  procesa    │
      │                              │  documento  │
      │                              └──────┬──────┘
      │                                     │
      │  DomainAction                       │
      │  (ingestion.extraction.callback)    │
      │◄────────────────────────────────────┤ ✅ ENVIAR CALLBACK
      │                                     │
      ▼                                     ▼
  [Documento                          [Resultado
   actualizado                         entregado]
   a "completed"]
```
