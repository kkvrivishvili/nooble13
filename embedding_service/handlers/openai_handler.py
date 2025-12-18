"""
Handler para la generación de embeddings usando OpenAI API - CORREGIDO.

Maneja la comunicación con la API de OpenAI y la generación
de embeddings vectoriales.
FIXES:
- Manejo correcto de ExternalServiceError
- Logging detallado
"""

import logging
import time
from typing import List, Dict, Any, Optional
from uuid import UUID

from common.handlers import BaseHandler
from common.errors.exceptions import ExternalServiceError

from ..clients.openai_client import OpenAIClient


class OpenAIHandler(BaseHandler):
    """
    Handler para generar embeddings usando OpenAI.
    
    Coordina la generación de embeddings con reintentos,
    manejo de errores y tracking de métricas.
    """
    
    def __init__(self, app_settings, openai_client: OpenAIClient, direct_redis_conn=None):
        """
        Inicializa el handler con sus dependencias.
        
        Args:
            app_settings: Configuración global de la aplicación
            openai_client: Cliente de OpenAI inyectado
            direct_redis_conn: Conexión Redis directa (opcional)
        """
        super().__init__(app_settings, direct_redis_conn)
        
        self.app_settings = app_settings
        self.openai_client = openai_client
        
        # Configurar logging detallado
        self._logger.setLevel(logging.DEBUG)
        self._logger.info("[OpenAIHandler] Inicializado con cliente inyectado")
    
    async def generate_embeddings(
        self,
        texts: List[str],
        model: Optional[str] = None,
        dimensions: Optional[int] = None,
        encoding_format: Optional[str] = None,
        tenant_id: Optional[UUID] = None,
        agent_id: Optional[UUID] = None,
        trace_id: Optional[UUID] = None,
        rag_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Genera embeddings para una lista de textos.
        CORREGIDO: Manejo de errores y logging mejorado.
        
        Args:
            texts: Lista de textos
            model: Modelo específico a usar (string, no enum)
            dimensions: Dimensiones del embedding
            encoding_format: Formato de codificación
            tenant_id: ID del tenant (UUID)
            agent_id: ID del agente (UUID)
            trace_id: ID de traza (UUID)
            rag_config: Configuración RAG opcional con parámetros dinámicos
            
        Returns:
            Dict con embeddings y metadatos
        """
        # Configurar parámetros
        model = model or self.app_settings.default_model
        encoding_format = encoding_format or "float"
        
        # Logging detallado de entrada
        self._logger.info(
            f"[OpenAIHandler] generate_embeddings iniciado: "
            f"texts_count={len(texts)}, model={model}, dimensions={dimensions}, "
            f"tenant_id={tenant_id}, agent_id={agent_id}, trace_id={trace_id}",
            extra={
                "tenant_id": str(tenant_id) if tenant_id else None,
                "agent_id": str(agent_id) if agent_id else None,
                "trace_id": str(trace_id) if trace_id else None,
                "model": model,
                "dimensions": dimensions,
                "texts_sample": texts[:2] if texts else []  # Solo log primeros 2 para debug
            }
        )
        
        # Log RAG config si existe
        # Normalizar rag_config a dict si viene como modelo Pydantic
        if rag_config and not isinstance(rag_config, dict):
            try:
                rag_config = rag_config.model_dump()
            except Exception:
                try:
                    rag_config = rag_config.dict()
                except Exception:
                    rag_config = None

        if rag_config:
            self._logger.debug(
                f"[OpenAIHandler] RAG config recibida: "
                f"timeout={rag_config.get('timeout')}, "
                f"max_retries={rag_config.get('max_retries')}, "
                f"keys={list(rag_config.keys())}"
            )
        
        try:
            request_timeout = None
            request_max_retries = None

            if rag_config:
                request_timeout = rag_config.get('timeout')
                request_max_retries = rag_config.get('max_retries')
                self._logger.debug(
                    f"[OpenAIHandler] Usando configuración RAG: "
                    f"timeout={request_timeout}, max_retries={request_max_retries}"
                )

            # Log antes de llamar al cliente
            self._logger.debug(
                f"[OpenAIHandler] Llamando a openai_client.generate_embeddings con "
                f"tenant_id={tenant_id} (tipo: {type(tenant_id).__name__})"
            )

            # Llamar al cliente OpenAI - tenant_id se pasará como user
            result = await self.openai_client.generate_embeddings(
                texts=texts,
                model=model,
                dimensions=dimensions,
                encoding_format=encoding_format,
                timeout=request_timeout,
                max_retries=request_max_retries,
                user=tenant_id  # Pasamos el UUID directamente, el cliente lo serializará
            )
            
            # Log de resultado exitoso
            self._logger.info(
                f"[OpenAIHandler] Embeddings generados exitosamente: "
                f"processing_time={result.get('processing_time_ms')}ms, "
                f"tokens={result.get('total_tokens', 0)}, "
                f"dimensions={result.get('dimensions', 0)}",
                extra={
                    "tenant_id": str(tenant_id) if tenant_id else None,
                    "agent_id": str(agent_id) if agent_id else None,
                    "model": model,
                    "text_count": len(texts),
                    "total_tokens": result.get("total_tokens", 0),
                    "dimensions": result.get("dimensions", 0),
                    "processing_time_ms": result.get("processing_time_ms", 0)
                }
            )
            
            return result
            
        except ExternalServiceError:
            # Re-lanzar errores de servicio externo tal cual
            self._logger.error(
                f"[OpenAIHandler] ExternalServiceError en generate_embeddings",
                exc_info=True,
                extra={"tenant_id": str(tenant_id) if tenant_id else None}
            )
            raise
            
        except Exception as e:
            # Capturar cualquier otro error
            self._logger.error(
                f"[OpenAIHandler] Error inesperado: {type(e).__name__}: {e}",
                exc_info=True,
                extra={
                    "tenant_id": str(tenant_id) if tenant_id else None,
                    "model": model,
                    "error_type": type(e).__name__
                }
            )
            # FIX: NO usar original_exception
            raise ExternalServiceError(
                f"Error al generar embeddings con OpenAI: {str(e)}"
            )
    
    async def validate_model(self, model: str) -> bool:
        """
        Valida si un modelo está disponible.
        
        Args:
            model: Nombre del modelo
            
        Returns:
            True si el modelo está disponible
        """
        try:
            # Lista actualizada de modelos válidos
            valid_models = [
                "text-embedding-3-small",
                "text-embedding-3-large",
                "text-embedding-ada-002"
            ]
            
            is_valid = model in valid_models
            
            self._logger.debug(
                f"[OpenAIHandler] Validación de modelo '{model}': "
                f"{'VÁLIDO' if is_valid else 'INVÁLIDO'}"
            )
            
            return is_valid
            
        except Exception as e:
            self._logger.error(
                f"[OpenAIHandler] Error validando modelo {model}: {e}",
                exc_info=True
            )
            return False
    
    def estimate_tokens(self, texts: List[str]) -> int:
        """
        Estima el número de tokens para una lista de textos.
        
        Esta es una estimación aproximada. Para una estimación
        precisa se debería usar tiktoken.
        
        Args:
            texts: Lista de textos
            
        Returns:
            Número estimado de tokens
        """
        # Estimación simple: ~4 caracteres por token (promedio para inglés)
        total_chars = sum(len(text) for text in texts)
        estimated_tokens = max(1, total_chars // 4)
        
        self._logger.debug(
            f"[OpenAIHandler] Tokens estimados: {estimated_tokens} "
            f"(para {len(texts)} textos, {total_chars} caracteres)"
        )
        
        return estimated_tokens