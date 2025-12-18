"""
Cliente para la API de OpenAI Embeddings - CORREGIDO.

Proporciona una interfaz limpia para generar embeddings
usando la API de OpenAI con manejo de errores y reintentos.
FIXES:
- Serialización correcta de UUIDs
- Logging detallado
- Manejo de errores mejorado
"""

import logging
import time
import json
from typing import List, Optional, Dict, Any
from uuid import UUID

from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError, APIConnectionError
from common.errors.exceptions import ExternalServiceError


class OpenAIClient:
    """
    Cliente asíncrono para la API de OpenAI Embeddings usando el SDK oficial.
    """
    
    def __init__(
        self, 
        api_key: str,
        timeout: int,
        max_retries: int,
        base_url: Optional[str] = None
    ):
        """
        Inicializa el cliente con la API key y otras configuraciones.
        
        Args:
            api_key: API key de OpenAI
            base_url: URL base de la API (opcional)
            timeout: Timeout en segundos para las peticiones
            max_retries: Número máximo de reintentos automáticos por el SDK
        """
        if not api_key:
            raise ValueError("API key de OpenAI es requerida")
        
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url, 
            timeout=timeout,
            max_retries=max_retries
        )
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.DEBUG)  # Más detalle para debugging

    def _serialize_value(self, value: Any) -> Any:
        """
        Serializa valores para que sean JSON-compatible.
        Convierte UUIDs a strings, etc.
        """
        if isinstance(value, UUID):
            return str(value)
        elif isinstance(value, dict):
            return {k: self._serialize_value(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [self._serialize_value(item) for item in value]
        else:
            return value

    def with_options(self, timeout: Optional[float] = None, max_retries: Optional[int] = None) -> 'OpenAIClient':
        """
        Crea una nueva instancia del cliente con opciones personalizadas.
        """
        new_client = OpenAIClient(
            api_key=self.api_key,
            timeout=timeout if timeout is not None else self.timeout,
            max_retries=max_retries if max_retries is not None else self.max_retries,
            base_url=self.base_url
        )
        
        self.logger.debug(
            f"Cliente OpenAI clonado con opciones: timeout={new_client.timeout}s, "
            f"max_retries={new_client.max_retries}"
        )
        
        return new_client

    async def generate_embeddings(
        self,
        texts: List[str],
        model: str = "text-embedding-3-small",
        dimensions: Optional[int] = None,
        encoding_format: str = "float", 
        user: Optional[Any] = None,  # Acepta Any para manejar UUIDs
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Genera embeddings para una lista de textos usando el SDK de OpenAI.
        CORREGIDO: Serialización de UUID y logging detallado.
        
        Args:
            texts: Lista de textos para generar embeddings.
            model: Modelo de embedding a usar.
            dimensions: Dimensiones del embedding (opcional, soportado por modelos v3).
            encoding_format: Formato de codificación ('float' o 'base64').
            user: Identificador único del usuario final (UUID o string).
            timeout: Timeout personalizado en segundos.
            max_retries: Número máximo de reintentos.
            
        Returns:
            Un diccionario conteniendo embeddings y metadata.
        """
        start_time = time.time()
        
        # Log detallado de entrada
        self.logger.debug(
            f"[OpenAI] generate_embeddings llamado con: "
            f"texts_count={len(texts)}, model={model}, dimensions={dimensions}, "
            f"user_type={type(user).__name__}, user={user}"
        )
        
        # FIX PRINCIPAL: Serializar user (tenant_id) si es UUID
        serialized_user = self._serialize_value(user) if user else None
        
        self.logger.debug(f"[OpenAI] User serializado: {serialized_user} (tipo: {type(serialized_user).__name__})")
        
        # Filtrar textos vacíos
        non_empty_texts_with_original_indices = []
        for i, text in enumerate(texts):
            if text and text.strip():
                non_empty_texts_with_original_indices.append({"text": text, "original_index": i})
        
        self.logger.info(
            f"[OpenAI] Textos filtrados: {len(non_empty_texts_with_original_indices)}/{len(texts)} "
            f"son no-vacíos"
        )
        
        if not non_empty_texts_with_original_indices:
            actual_dimensions = dimensions or 1536 
            self.logger.warning("[OpenAI] No hay textos válidos, devolviendo vectores de ceros")
            return {
                "embeddings": [[0.0] * actual_dimensions for _ in texts],
                "model": model,
                "dimensions": actual_dimensions,
                "prompt_tokens": 0,
                "total_tokens": 0,
                "processing_time_ms": int((time.time() - start_time) * 1000)
            }

        input_texts_for_api = [item["text"] for item in non_empty_texts_with_original_indices]
        
        # Construir parámetros de API
        api_params = {
            "input": input_texts_for_api,
            "model": model,
            "encoding_format": encoding_format
        }
        
        if dimensions and "text-embedding-3" in model:
            api_params["dimensions"] = dimensions
            self.logger.debug(f"[OpenAI] Usando dimensions personalizadas: {dimensions}")
        
        # USAR user SERIALIZADO
        if serialized_user:
            api_params["user"] = serialized_user
            
        # Log de parámetros finales (sin el contenido completo de input)
        self.logger.info(
            f"[OpenAI] Llamando API con: model={model}, input_count={len(input_texts_for_api)}, "
            f"dimensions={dimensions}, user={serialized_user}"
        )

        try:
            # Preparar overrides para la llamada
            request_options = {}
            if timeout is not None:
                request_options["timeout"] = timeout
            if max_retries is not None:
                request_options["max_retries"] = max_retries

            # Log antes de llamada
            self.logger.debug(f"[OpenAI] Iniciando llamada a embeddings.create con {len(input_texts_for_api)} textos")
            
            # LLAMADA A LA API
            response = await self.client.embeddings.create(**api_params, **request_options)
            
            # Log de respuesta exitosa
            self.logger.info(
                f"[OpenAI] Respuesta exitosa: model={response.model}, "
                f"embeddings_count={len(response.data)}, "
                f"usage={response.usage.total_tokens if response.usage else 'N/A'}"
            )
            
            # Mapear embeddings
            sdk_embeddings_map = {item.index: item.embedding for item in response.data}
            
            actual_dimensions = len(response.data[0].embedding) if response.data else (dimensions or 1536)
            
            # Reconstruir lista completa con embeddings
            full_embeddings: List[List[float]] = []
            current_sdk_idx = 0
            for i in range(len(texts)):
                is_processed = False
                for item in non_empty_texts_with_original_indices:
                    if item["original_index"] == i:
                        if current_sdk_idx in sdk_embeddings_map:
                            full_embeddings.append(sdk_embeddings_map[current_sdk_idx])
                            current_sdk_idx += 1
                        else:
                            self.logger.error(
                                f"[OpenAI] Falta embedding para índice SDK {current_sdk_idx} "
                                f"(índice original {i})"
                            )
                            full_embeddings.append([0.0] * actual_dimensions)
                        is_processed = True
                        break
                if not is_processed:
                    full_embeddings.append([0.0] * actual_dimensions)

            processing_time_ms = int((time.time() - start_time) * 1000)
            
            self.logger.info(
                f"[OpenAI] Embeddings generados exitosamente en {processing_time_ms}ms. "
                f"Modelo: {response.model}, Dimensiones: {actual_dimensions}, "
                f"Tokens: {response.usage.total_tokens if response.usage else 'N/A'}"
            )
            
            return {
                "embeddings": full_embeddings,
                "model": response.model,
                "dimensions": actual_dimensions, 
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
                "processing_time_ms": processing_time_ms
            }

        except APITimeoutError as e:
            self.logger.error(f"[OpenAI] Timeout en API: {e}", exc_info=True)
            raise ExternalServiceError(f"OpenAI API timeout: {e}")
            
        except RateLimitError as e:
            self.logger.error(f"[OpenAI] Rate limit excedido: {e}", exc_info=True)
            raise ExternalServiceError(f"OpenAI API rate limit excedido: {e}")
            
        except APIConnectionError as e:
            self.logger.error(f"[OpenAI] Error de conexión: {e}", exc_info=True)
            raise ExternalServiceError(f"OpenAI API error de conexión: {e}")
            
        except APIError as e: 
            self.logger.error(f"[OpenAI] Error de API: {e}", exc_info=True)
            raise ExternalServiceError(f"OpenAI API error: {e}")
            
        except Exception as e: 
            self.logger.error(
                f"[OpenAI] Error inesperado: {type(e).__name__}: {e}",
                exc_info=True
            )
            # NO usar original_exception - solo el mensaje
            raise ExternalServiceError(f"Error inesperado en el cliente OpenAI: {str(e)}")

    async def list_models(self) -> List[Dict[str, Any]]:
        """Lista los modelos disponibles."""
        self.logger.info("[OpenAI] list_models no implementado completamente")
        return []
    
    async def health_check(self) -> bool:
        """
        Verifica si la API de OpenAI está disponible.
        """
        try:
            self.logger.debug("[OpenAI] Iniciando health check")
            result = await self.generate_embeddings(
                texts=["health check"],
                model="text-embedding-3-small"
            )
            is_healthy = bool(result and result.get("embeddings") and result["embeddings"][0])
            self.logger.info(f"[OpenAI] Health check: {'OK' if is_healthy else 'FAILED'}")
            return is_healthy
            
        except ExternalServiceError as e:
            self.logger.warning(f"[OpenAI] Health check fallido: {e}")
            return False
        except Exception as e:
            self.logger.error(f"[OpenAI] Health check error inesperado: {e}", exc_info=True)
            return False