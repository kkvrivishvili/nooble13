"""
Handler para chat simple con RAG automático.
"""
import logging
import time
from typing import List, Dict, Any
from uuid import UUID, uuid4

from common.handlers import BaseHandler
from common.errors.exceptions import ExternalServiceError, AppValidationError
from common.models.chat_models import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    EmbeddingRequest,
    TokenUsage
)
from common.models.config_models import RAGConfig

from ..clients.groq_client import GroqClient
from ..clients.qdrant_client import QdrantClient
from ..clients.embedding_client import EmbeddingClient


class SimpleHandler(BaseHandler):
    """Handler para procesamiento de chat simple con RAG automático."""
    
    def __init__(self, app_settings, embedding_client: EmbeddingClient, qdrant_client: QdrantClient, 
                 groq_client: GroqClient, direct_redis_conn=None):
        """
        Inicializa el handler recibiendo todos los clientes como dependencias.
        
        Args:
            app_settings: Configuración del servicio
            embedding_client: Cliente para comunicación con Embedding Service
            qdrant_client: Cliente para búsqueda vectorial en Qdrant
            groq_client: Cliente para consultas LLM en Groq
            direct_redis_conn: Conexión directa a Redis (opcional)
        """
        super().__init__(app_settings, direct_redis_conn)
        
        # Validar que todos los clientes requeridos estén presentes
        if not embedding_client:
            raise ValueError("embedding_client es requerido para SimpleHandler")
        if not qdrant_client:
            raise ValueError("qdrant_client es requerido para SimpleHandler")
        if not groq_client:
            raise ValueError("groq_client es requerido para SimpleHandler")
            
        # Asignar los clientes recibidos como dependencias
        self.embedding_client = embedding_client
        self.qdrant_client = qdrant_client
        self.groq_client = groq_client
        
        self._logger.info("SimpleHandler inicializado con inyección de clientes")
    
    async def process_simple_query(
        self,
        data: Dict[str, Any],
        query_config: "QueryConfig",  # Config explícita desde DomainAction
        rag_config: "RAGConfig",      # Config explícita desde DomainAction
        tenant_id: UUID,
        session_id: UUID,
        task_id: UUID,
        trace_id: UUID,
        correlation_id: UUID,
        agent_id: UUID,
    ) -> ChatResponse:
        """Procesa una consulta simple con RAG automático."""
        start_time = time.time()
        conversation_id = str(correlation_id) if correlation_id else str(uuid4())
        
        try:
            # Extraer datos limpios del payload (sin configuraciones)
            raw_messages = data.get("messages", [])
            
            # Validar datos requeridos
            if not raw_messages:
                raise AppValidationError("messages es requerido")
            if not query_config:
                raise AppValidationError("query_config es requerido")
            
            # Validaciones específicas de Query Service para query_config
            self._validate_query_config(query_config)
            
            # Validaciones específicas de Query Service para rag_config (si está presente)
            if rag_config:
                self._validate_rag_config(rag_config)
            
            # Convertir raw messages a ChatMessage objects
            messages = []
            for msg_data in raw_messages:
                if isinstance(msg_data, dict):
                    messages.append(ChatMessage.model_validate(msg_data))
                else:
                    messages.append(msg_data)  # Ya es ChatMessage

            # Log resumen de mensajes recibidos
            try:
                roles = [m.role for m in messages]
                last_user = next((m.content for m in reversed(messages) if m.role == "user" and m.content), None)
                self._logger.info(
                    "QueryService.SimpleHandler: mensajes recibidos",
                    extra={
                        "query_id": conversation_id,
                        "roles": roles,
                        "last_user_snippet": (last_user[:120] + "...") if last_user and len(last_user) > 120 else last_user,
                        "count": len(messages)
                    }
                )
            except Exception:
                pass
            
            # Extraer mensaje del usuario (último mensaje con role="user")
            user_message = None
            for msg in reversed(messages):
                if msg.role == "user" and msg.content:
                    user_message = msg.content
                    break
            
            if not user_message:
                raise AppValidationError("No se encontró mensaje del usuario")
            
            self._logger.info(
                f"Procesando simple query: '{user_message[:50]}...'",
                extra={
                    "query_id": conversation_id,
                    "tenant_id": str(tenant_id),
                    "collections": rag_config.collection_ids if rag_config else []
                }
            )
            
            # Copiar mensajes originales para construir el payload final
            final_messages = messages.copy()
            sources = []
            search_results = []  # Inicializar search_results en scope global
            
            # ORQUESTACIÓN RAG: Si hay configuración RAG, hacer búsqueda
            if rag_config and rag_config.collection_ids != ["no_documents_available"]:
                # 1. Obtener embedding de la consulta
                embedding_request = EmbeddingRequest(
                    input=user_message,
                    model=rag_config.embedding_model,
                    dimensions=rag_config.embedding_dimensions
                )
                
                query_embedding = await self._get_query_embedding(
                    embedding_request=embedding_request,
                    rag_config=rag_config,
                    tenant_id=tenant_id,
                    session_id=session_id,
                    task_id=task_id,
                    trace_id=trace_id,
                    agent_id=agent_id
                )
                
                # LOG DETALLADO: Parámetros de búsqueda RAG
                self._logger.info(
                    f"QueryService.SimpleHandler: COLLECTION_IDS USADOS = {rag_config.collection_ids}"
                )
                self._logger.info(
                    f"QueryService.SimpleHandler: Parámetros RAG - tenant_id={tenant_id}, agent_id={agent_id}, top_k={rag_config.top_k}, threshold={rag_config.similarity_threshold}"
                )
                
                # 2. Buscar en vector store
                search_results = await self.qdrant_client.search(
                    query_embedding=query_embedding,
                    query_text=user_message,
                    collection_ids=rag_config.collection_ids,
                    top_k=rag_config.top_k,
                    similarity_threshold=rag_config.similarity_threshold,
                    tenant_id=tenant_id,
                    agent_id=str(agent_id),
                    fact_density_boost=getattr(rag_config, 'fact_density_boost', 0.0),
                    filters={"document_ids": rag_config.document_ids} if rag_config.document_ids else None
                )

                try:
                    self._logger.info(
                        "QueryService.SimpleHandler: RAG search ejecutada",
                        extra={
                            "query_id": conversation_id,
                            "collections": rag_config.collection_ids,
                            "top_k": rag_config.top_k,
                            "threshold": rag_config.similarity_threshold,
                            "results": len(search_results or [])
                        }
                    )
                except Exception:
                    pass
                
                # Extraer sources para la respuesta si hay resultados
                if search_results:
                    sources = [chunk.chunk_id for chunk in search_results]  # chunk_id ya es UUID
            elif rag_config and rag_config.collection_ids == ["no_documents_available"]:
                # RAG omitido: no hay documentos ingresados
                self._logger.info(
                    f"QueryService.SimpleHandler: RAG omitido para query '{user_message[:50]}...': No hay documentos ingresados para el tenant {tenant_id}"
                )
            
            # CONSTRUCCIÓN DEL SYSTEM PROMPT DINÁMICO CON CONTEXTO RAG INTEGRADO
            base_prompt = query_config.system_prompt_template
            
            if search_results:
                # Construir contexto RAG
                context = self._build_context(search_results, max_results=rag_config.top_k)
                
                # System prompt limpio con contexto RAG
                dynamic_prompt = f"""{base_prompt}

Knowledge Chunks:
{context}"""
            else:
                # System prompt base sin contexto RAG
                dynamic_prompt = base_prompt
            
            # Verificar si ya existe un system message y reemplazarlo o crearlo
            has_system_msg = any(msg.role == "system" for msg in final_messages)
            if not has_system_msg:
                # Agregar system prompt dinámico al inicio
                system_msg = ChatMessage(role="system", content=dynamic_prompt)
                final_messages.insert(0, system_msg)
            else:
                # Actualizar el primer system message encontrado con el prompt dinámico
                for i, msg in enumerate(final_messages):
                    if msg.role == "system":
                        # Crear nuevo ChatMessage con el prompt dinámico
                        final_messages[i] = ChatMessage(role="system", content=dynamic_prompt)
                        break
            
            # LLAMADA A GROQ: enviar conversación completa desde el handler
            # Log seguro de los mensajes finales (roles y conteo)
            try:
                roles_finales = [m.role for m in final_messages]
                self._logger.info(
                    "QueryService.SimpleHandler: mensajes finales preparados para Groq",
                    extra={
                        "query_id": conversation_id,
                        "count": len(final_messages),
                        "roles": roles_finales,
                        "model": query_config.model.value,
                        "temperature": query_config.temperature,
                        "max_completion_tokens": query_config.max_tokens,
                        "top_p": query_config.top_p,
                        "has_stop": bool(query_config.stop),
                    }
                )
            except Exception:
                pass
            
            # Aplicar configuración dinámica si está especificada en query_config
            groq_client_instance = self.groq_client
            
            # Si hay configuración específica en query_config (timeout o max_retries), usar with_options
            if query_config.timeout is not None or query_config.max_retries is not None:
                options = {}
                if query_config.timeout is not None:
                    options["timeout"] = query_config.timeout
                if query_config.max_retries is not None:
                    options["max_retries"] = query_config.max_retries
                
                # Crear una copia del cliente con las opciones específicas
                groq_client_instance = self.groq_client.with_options(**options)
            
            # ===== LOGGING DETALLADO PARA DEBUG =====
            self._logger.info("🔍 [TEST] INICIANDO LOGS DETALLADOS - LÍNEA 275")
            self._logger.info("=" * 80)
            self._logger.info("[DEBUG] INFORMACIÓN COMPLETA DE LA CONSULTA RAG")
            self._logger.info("=" * 80)
            
            # Log de configuraciones aplicadas
            self._logger.info(f"[CONFIG] Modelo: {query_config.model.value}")
            self._logger.info(f"[CONFIG] Temperature: {query_config.temperature}")
            self._logger.info(f"[CONFIG] Max tokens: {query_config.max_tokens}")
            self._logger.info(f"[CONFIG] Top-p: {query_config.top_p}")
            if rag_config:
                self._logger.info(f"[CONFIG] RAG Top-k: {rag_config.top_k}")
                self._logger.info(f"[CONFIG] RAG Threshold: {rag_config.similarity_threshold}")
                self._logger.info(f"[CONFIG] RAG Collection IDs: {rag_config.collection_ids}")
            
            # Log de chunks RAG encontrados
            if search_results:
                self._logger.info(f"[RAG] Se encontraron {len(search_results)} chunks relevantes:")
                for i, chunk in enumerate(search_results, 1):
                    self._logger.info(f"[RAG] Chunk {i}:")
                    self._logger.info(f"[RAG]   - ID: {chunk.chunk_id}")
                    self._logger.info(f"[RAG]   - Collection: {chunk.collection_id}")
                    self._logger.info(f"[RAG]   - Score: {chunk.similarity_score:.4f}")
                    self._logger.info(f"[RAG]   - Content: {chunk.content[:200]}...")
            else:
                self._logger.info("[RAG] No se encontraron chunks RAG")
            
            # Log del system prompt y mensajes finales
            self._logger.info("[MESSAGES] Mensajes enviados a Groq:")
            for i, msg in enumerate(final_messages):
                # ChatMessage es un objeto Pydantic, usar acceso directo a atributos
                role = msg.role if hasattr(msg, 'role') else 'unknown'
                content = msg.content if hasattr(msg, 'content') else ''
                if role == 'system':
                    self._logger.info(f"[MESSAGES] {i+1}. SYSTEM PROMPT:")
                    self._logger.info(f"[MESSAGES] {content}")
                elif role == 'user':
                    self._logger.info(f"[MESSAGES] {i+1}. USER: {content[:200] if content else ''}...")
                elif role == 'assistant':
                    self._logger.info(f"[MESSAGES] {i+1}. ASSISTANT: {content[:200] if content else ''}...")
            
            self._logger.info("=" * 80)
            
            # Llamar al cliente de Groq (original o con opciones específicas) con la conversación completa
            self._logger.info("🚀 [TEST] LLAMANDO A GROQ - LÍNEA 319")
            response_text, token_usage = await groq_client_instance.generate_chat(
                messages=final_messages,
                model=query_config.model.value,
                temperature=query_config.temperature,
                max_completion_tokens=query_config.max_tokens,
                top_p=query_config.top_p,
                frequency_penalty=query_config.frequency_penalty,
                presence_penalty=query_config.presence_penalty,
                stop=query_config.stop if query_config.stop else None,
            )

            # Normalizar uso de tokens a modelo TokenUsage para logging y respuesta tipada
            token_usage_model = TokenUsage(**token_usage)
            
            # Construir respuesta
            end_time = time.time()
            
            # Crear mensaje de respuesta
            response_message = ChatMessage(
                role="assistant",
                content=response_text
            )
            
            response = ChatResponse(
                conversation_id=UUID(conversation_id),
                message=response_message,
                usage=token_usage_model,
                sources=sources,
                execution_time_ms=int((end_time - start_time) * 1000)
            )

            try:
                self._logger.info(
                    "QueryService.SimpleHandler: respuesta construida",
                    extra={
                        "query_id": conversation_id,
                        "processing_time": response.execution_time_ms,
                        "context_chunks": len(sources),
                        "usage": token_usage_model.model_dump(),
                        "content_length": len(response_message.content or "")
                    }
                )
            except Exception:
                pass
            
            return response
            
        except Exception as e:
            self._logger.error(f"Error procesando simple query: {str(e)}", exc_info=True)
            if isinstance(e, (AppValidationError, ExternalServiceError)):
                raise
            raise ExternalServiceError(f"Error interno en simple query: {str(e)}")
    
    async def _get_query_embedding(
        self,
        embedding_request: EmbeddingRequest,
        rag_config: RAGConfig,
        tenant_id: UUID,
        session_id: UUID,
        task_id: UUID,
        trace_id: UUID,
        agent_id: UUID,
    ) -> List[float]:
        """Obtiene el embedding de la consulta usando el Embedding Service con configuración RAG."""
        # Usar el embedding client refactorizado para obtener el embedding
        response = await self.embedding_client.get_embeddings(
            texts=[embedding_request.input],
            rag_config=rag_config,
            tenant_id=tenant_id,
            session_id=session_id,
            task_id=task_id,
            agent_id=agent_id,
            trace_id=trace_id
        )
        
        if not response.success or not response.data:
            raise ExternalServiceError("Error obteniendo embedding del Embedding Service")
        
        # CORRECCIÓN 4: Manejar la estructura correcta de respuesta de embeddings
        embeddings_data = response.data.get("embeddings", [])
        if not embeddings_data:
            raise ExternalServiceError("No se recibieron embeddings del Embedding Service")
        
        # Manejar la estructura correcta: lista de objetos con chunk_id, embedding, error
        first_result = embeddings_data[0]
        if "error" in first_result and first_result["error"]:
            raise ExternalServiceError(f"Error en embedding: {first_result['error']}")
        
        # Extraer el embedding del primer resultado
        embedding = first_result.get("embedding", [])
        if not embedding:
            raise ExternalServiceError("No se recibió embedding válido del Embedding Service")
        
        return embedding
    
    def _build_context(self, search_results, max_results: int = 5) -> str:
        """Construye el contexto a partir de los resultados de búsqueda."""
        if not search_results:
            return ""
        
        context_parts = []
        for i, result in enumerate(search_results[:max_results]):
            source_info = f"[Source {i+1}: {result.collection_id}"
            if hasattr(result, 'document_id') and result.document_id:
                source_info += f"/{result.document_id}"
            source_info += f", Score: {result.similarity_score:.3f}]"
            
            context_parts.append(f"{source_info}\n{result.content}")
        
        return "\n\n".join(context_parts)
    
    def _validate_query_config(self, query_config):
        """Valida la configuración de query."""        
        # Validar campos requeridos
        if not query_config.model:
            raise AppValidationError("Modelo de lenguaje es requerido")
        if not query_config.system_prompt_template:
            raise AppValidationError("Plantilla de prompt del sistema es requerida")
        if query_config.temperature is None:
            raise AppValidationError("Temperatura es requerida")
        if not query_config.max_tokens:
            raise AppValidationError("Cantidad máxima de tokens es requerida")
        if query_config.top_p is None:
            raise AppValidationError("Umbral de probabilidad es requerido")
        if query_config.frequency_penalty is None:
            # Aceptar None asignando el default del modelo (0.0)
            query_config.frequency_penalty = 0.0
        if query_config.presence_penalty is None:
            # Aceptar None asignando el default del modelo (0.0)
            query_config.presence_penalty = 0.0
        
        # Validar valores válidos
        if query_config.temperature < 0 or query_config.temperature > 1:
            raise AppValidationError("Temperatura debe estar entre 0 y 1")
        if query_config.max_tokens < 1:
            raise AppValidationError("Cantidad máxima de tokens debe ser mayor que 0")
        if query_config.top_p < 0 or query_config.top_p > 1:
            raise AppValidationError("Umbral de probabilidad debe estar entre 0 y 1")
        if query_config.frequency_penalty < 0 or query_config.frequency_penalty > 1:
            raise AppValidationError("Penalización de frecuencia debe estar entre 0 y 1")
        if query_config.presence_penalty < 0 or query_config.presence_penalty > 1:
            raise AppValidationError("Penalización de presencia debe estar entre 0 y 1")
    
    def _validate_rag_config(self, rag_config: "RAGConfig"):
        # Validar campos requeridos
        if not rag_config.collection_ids:
            raise AppValidationError("IDs de colección son requeridos")
        if not rag_config.embedding_model:
            raise AppValidationError("Modelo de embedding es requerido")
        if rag_config.embedding_dimensions is None or rag_config.embedding_dimensions <= 0:
            raise AppValidationError("Dimensiones de embedding son requeridas")
        if rag_config.top_k is None or rag_config.top_k < 1:
            raise AppValidationError("Cantidad de resultados es requerida")
        if rag_config.similarity_threshold is None:
            raise AppValidationError("Umbral de similitud es requerido")
        
        # Validar valores válidos
        if rag_config.top_k < 1:
            raise AppValidationError("Cantidad de resultados debe ser mayor que 0")
        if rag_config.similarity_threshold < 0 or rag_config.similarity_threshold > 1:
            raise AppValidationError("Umbral de similitud debe estar entre 0 y 1")