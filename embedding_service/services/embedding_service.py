"""
Implementación del servicio principal de Embedding Service.

Este servicio extiende BaseService y orquesta la lógica de negocio,
delegando operaciones específicas a los handlers correspondientes.
"""

import logging
from typing import Optional, Dict, Any
from uuid import uuid4

from pydantic import ValidationError

from common.config.service_settings.embedding import EmbeddingServiceSettings
from ..clients.openai_client import OpenAIClient
from common.services import BaseService
from common.models import DomainAction
from common.errors.exceptions import InvalidActionError, ExternalServiceError
from common.models.chat_models import (
    EmbeddingRequest,
    EmbeddingResponse,
    EmbeddingModel,
    TokenUsage
)

from ..models.payloads import (
    EmbeddingBatchPayload,
    EmbeddingBatchResult
)
from ..handlers.openai_handler import OpenAIHandler
from ..handlers.validation_handler import ValidationHandler


class EmbeddingService(BaseService):
    """
    Servicio principal para generación de embeddings.
    
    Maneja las acciones:
    - embedding.generate: Generación de embeddings para múltiples textos
    - embedding.generate_query: Generación de embedding para consulta única
    - embedding.batch_process: Procesamiento por lotes
    """
    
    def __init__(self, app_settings, service_redis_client=None, direct_redis_conn=None):
        """
        Inicializa el servicio con sus clientes y handlers.
        """
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        self.app_settings = app_settings

        # Inicializar clientes a nivel de servicio
        self.openai_client = OpenAIClient(
            api_key=app_settings.openai_api_key,
            timeout=getattr(app_settings, 'openai_timeout_seconds', 30),  # Usar un valor por defecto seguro
            max_retries=getattr(app_settings, 'openai_max_retries', 3), # Usar un valor por defecto seguro
            base_url=app_settings.openai_base_url
        )
        
        # Inicializar handlers e inyectar dependencias
        self.openai_handler = OpenAIHandler(
            app_settings=app_settings,
            openai_client=self.openai_client,
            direct_redis_conn=direct_redis_conn
        )
        
        self.validation_handler = ValidationHandler(
            app_settings=app_settings,
            direct_redis_conn=direct_redis_conn
        )
        
        self._logger.info("EmbeddingService inicializado correctamente con inyección de cliente")
    
    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una DomainAction según su tipo.
        """
        self._logger.info(
            f"Procesando acción: {action.action_type} ({action.action_id})",
            extra={
                "action_id": str(action.action_id),
                "action_type": action.action_type,
                "tenant_id": action.tenant_id,
                "correlation_id": str(action.correlation_id) if action.correlation_id else None
            }
        )
        
        try:
            # Enrutar según el tipo de acción
            if action.action_type == "embedding.generate":
                return await self._handle_generate(action)
                
            elif action.action_type == "embedding.generate_query":
                return await self._handle_generate_query(action)
                
            elif action.action_type == "embedding.batch_process":
                return await self._handle_batch_process(action)
                
            else:
                self._logger.warning(f"Tipo de acción no soportado: {action.action_type}")
                raise InvalidActionError(
                    f"Acción '{action.action_type}' no es soportada por Embedding Service"
                )
                
        except ValidationError as e:
            self._logger.error(f"Error de validación en {action.action_type}: {e}")
            raise InvalidActionError(f"Error de validación en el payload: {str(e)}")
            
        except ExternalServiceError:
            raise
            
        except Exception as e:
            self._logger.exception(f"Error inesperado procesando {action.action_type}")
            raise ExternalServiceError(f"Error interno en Embedding Service: {str(e)}")
    
    async def _handle_generate(self, action: DomainAction) -> Dict[str, Any]:
        """
        Maneja la acción embedding.generate para múltiples textos, con reporte de errores por chunk.
        """
        if not action.rag_config:
            raise ValueError("rag_config es requerido para embedding.generate")

        texts = action.data.get("texts", [])
        origin = getattr(action, "origin_service", "") or ""
        chunk_ids = action.data.get("chunk_ids")
        if not texts:
            raise ValueError("Payload debe contener 'texts'.")
        # Si viene de ingestion-service, 'chunk_ids' es obligatorio y debe coincidir en longitud.
        if origin == "ingestion-service":
            if not chunk_ids or len(texts) != len(chunk_ids):
                raise ValueError("Para ingestion-service, el payload debe contener 'texts' y 'chunk_ids' con la misma longitud.")
        else:
            # Para query (u otros), si no hay chunk_ids o la longitud no coincide, generamos IDs efímeros
            if not chunk_ids or len(texts) != len(chunk_ids):
                chunk_ids = [f"query_{i}" for i in range(len(texts))]

        rag_config = action.rag_config
        results = {}
        valid_chunks = []

        # 1. Validar cada chunk individualmente
        for i, text in enumerate(texts):
            chunk_id = chunk_ids[i]
            validation_result = await self.validation_handler.validate_texts(
                texts=[text],
                rag_config=rag_config,
                tenant_id=action.tenant_id
            )
            if not validation_result["is_valid"]:
                results[chunk_id] = {
                    "chunk_id": chunk_id,
                    "error": {
                        "error_type": "ValidationError",
                        "message": validation_result['messages'][0]
                    }
                }
            else:
                valid_chunks.append({"id": chunk_id, "text": text})

        # 2. Procesar chunks válidos en un solo lote
        if valid_chunks:
            valid_texts = [chunk["text"] for chunk in valid_chunks]
            try:
                embedding_api_result = await self.openai_handler.generate_embeddings(
                    texts=valid_texts,
                    model=rag_config.embedding_model.value,
                    dimensions=rag_config.embedding_dimensions,
                    encoding_format=rag_config.encoding_format,
                    tenant_id=action.tenant_id,
                    agent_id=action.agent_id,
                    trace_id=action.trace_id,
                    rag_config=rag_config
                )
                
                # Mapear resultados de vuelta a los chunk_ids
                for i, chunk in enumerate(valid_chunks):
                    results[chunk["id"]] = {
                        "chunk_id": chunk["id"],
                        "embedding": embedding_api_result["embeddings"][i],
                        "text_index": i
                    }

            except Exception as e:
                self._logger.error(f"Error llamando a OpenAI para un lote de embeddings: {e}", exc_info=True)
                # Si la API falla, todos los chunks en el lote fallan
                for chunk in valid_chunks:
                    results[chunk["id"]] = {
                        "chunk_id": chunk["id"],
                        "error": {
                            "error_type": "ExternalServiceError",
                            "message": f"Failed to get embedding from provider: {str(e)}"
                        }
                    }
        
        # 3. Ordenar los resultados para que coincidan con el orden de entrada
        final_results = [results[chunk_id] for chunk_id in chunk_ids]

        return {"embeddings": final_results}

    async def _handle_generate_query(self, action: DomainAction) -> Dict[str, Any]:
        """
        Maneja la acción embedding.generate_query para una consulta única.
        """
        if not action.rag_config:
            raise ValueError("rag_config es requerido para embedding.generate_query")

        query_text = action.data.get("query_text", "")
        if not query_text:
            raise ValueError("query_text es requerido en el payload")

        rag_config = action.rag_config

        # Añadimos validación también para la consulta única
        validation_result = await self.validation_handler.validate_texts(
            texts=[query_text],
            rag_config=rag_config,
            tenant_id=action.tenant_id
        )

        if not validation_result["is_valid"]:
            raise ValueError(f"Validación de consulta fallida: {validation_result['messages'][0]}")

        # Pasamos el rag_config completo para que el handler decida cómo usarlo
        result = await self.openai_handler.generate_embeddings(
            texts=[query_text],
            model=rag_config.embedding_model.value,
            dimensions=rag_config.embedding_dimensions,
            encoding_format=rag_config.encoding_format,
            tenant_id=action.tenant_id,
            agent_id=action.agent_id,
            trace_id=action.trace_id,
            rag_config=rag_config
        )

        response = EmbeddingResponse(
            embeddings=result["embeddings"],
            model=result["model"],
            dimensions=result["dimensions"],
            usage=TokenUsage(
                prompt_tokens=result.get("prompt_tokens", 0),
                completion_tokens=0,
                total_tokens=result.get("total_tokens", 0)
            )
        )

        return response.model_dump()
    
    async def _handle_batch_process(self, action: DomainAction) -> Dict[str, Any]:
        # Log detallado de entrada
        self._logger.info(
            f"[EmbeddingService] _handle_batch_process iniciado",
            extra={
                "action_id": str(action.action_id),
                "task_id": str(action.task_id),
                "tenant_id": str(action.tenant_id),
                "agent_id": str(action.agent_id),
                "correlation_id": str(action.correlation_id) if action.correlation_id else None
            }
        )
        
        # Validar y parsear payload
        try:
            payload = EmbeddingBatchPayload.model_validate(action.data)
            self._logger.debug(
                f"[EmbeddingService] Payload validado: "
                f"texts_count={len(payload.texts)}, "
                f"model={payload.model}, "
                f"dimensions={payload.dimensions}, "
                f"chunk_ids_count={len(payload.chunk_ids) if payload.chunk_ids else 0}"
            )
        except ValidationError as e:
            self._logger.error(
                f"[EmbeddingService] Error validando payload: {e}",
                extra={"action_id": str(action.action_id)}
            )
            raise
        
        try:
            # El modelo ahora es un campo obligatorio en el payload
            model = payload.model
            
            # Extraer configuración RAG del DomainAction
            rag_config = action.rag_config.dict() if action.rag_config else None
            
            if rag_config:
                self._logger.debug(
                    f"[EmbeddingService] RAG config extraída: {list(rag_config.keys())}"
                )
            
            # Log antes de generar embeddings
            self._logger.info(
                f"[EmbeddingService] Generando embeddings para {len(payload.texts)} textos",
                extra={
                    "model": model,
                    "dimensions": payload.dimensions,
                    "tenant_id": str(action.tenant_id),
                    "task_id": str(action.task_id)
                }
            )
            
            # Generar embeddings con configuración dinámica
            result = await self.openai_handler.generate_embeddings(
                texts=payload.texts,
                model=model,
                dimensions=payload.dimensions,
                tenant_id=action.tenant_id,
                agent_id=action.agent_id,
                trace_id=action.trace_id,
                rag_config=rag_config
            )
            
            self._logger.info(
                f"[EmbeddingService] Embeddings generados exitosamente",
                extra={
                    "embeddings_count": len(result["embeddings"]),
                    "model": result["model"],
                    "dimensions": result["dimensions"],
                    "total_tokens": result.get("total_tokens", 0),
                    "processing_time_ms": result.get("processing_time_ms", 0)
                }
            )
            
            # Construir respuesta de batch con todos los IDs necesarios
            batch_result = EmbeddingBatchResult(
                chunk_ids=payload.chunk_ids or [f"idx_{i}" for i in range(len(payload.texts))],
                embeddings=result["embeddings"],
                model=result["model"],
                dimensions=result["dimensions"],
                total_tokens=result.get("total_tokens", 0),
                processing_time_ms=result.get("processing_time_ms", 0),
                status="completed",
                failed_indices=[],
                metadata=payload.metadata
            )
            
            # IMPORTANTE: Incluir IDs necesarios para el callback
            response_data = batch_result.model_dump()
            
            # Agregar información crítica para el callback
            response_data.update({
                # IDs del contexto original
                "task_id": str(action.task_id),
                "tenant_id": str(action.tenant_id),
                "agent_id": str(action.agent_id),  # FIX: Incluir agent_id
                "session_id": str(action.session_id) if action.session_id else None,
                
                # Información del modelo usado
                "embedding_model": result["model"],
                "embedding_dimensions": result["dimensions"],
                "encoding_format": "float",  # Por defecto
                
                # Métricas
                "total_tokens": result.get("total_tokens", 0),
                "processing_time_ms": result.get("processing_time_ms", 0)
            })
            
            self._logger.info(
                f"[EmbeddingService] Batch process completado exitosamente",
                extra={
                    "task_id": str(action.task_id),
                    "chunks_processed": len(batch_result.chunk_ids),
                    "status": "completed",
                    "tokens_used": result.get("total_tokens", 0)
                }
            )
            
            return response_data
            
        except Exception as e:
            self._logger.error(
                f"[EmbeddingService] Error en batch process: {type(e).__name__}: {e}",
                exc_info=True,
                extra={
                    "action_id": str(action.action_id),
                    "task_id": str(action.task_id),
                    "tenant_id": str(action.tenant_id),
                    "error_type": type(e).__name__
                }
            )
            
            # En caso de error, devolver resultado fallido con contexto completo
            batch_result = EmbeddingBatchResult(
                chunk_ids=payload.chunk_ids or [],
                embeddings=[],
                model=payload.model or "unknown",
                dimensions=0,
                total_tokens=0,
                processing_time_ms=0,
                status="failed",
                failed_indices=list(range(len(payload.texts))),
                metadata=payload.metadata
            )
            
            # Incluir IDs incluso en caso de error para callback
            error_response = batch_result.model_dump()
            error_response.update({
                "task_id": str(action.task_id),
                "tenant_id": str(action.tenant_id),
                "agent_id": str(action.agent_id),  # FIX: Incluir agent_id incluso en error
                "error": str(e),
                "error_type": type(e).__name__
            })
            
            self._logger.warning(
                f"[EmbeddingService] Devolviendo resultado de error para callback",
                extra={"task_id": str(action.task_id)}
            )
            
            return error_response