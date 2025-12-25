"""
Servicio principal de ingestion simplificado.
Estado solo en Redis, sin agent_id en embeddings.
"""
import asyncio
import json
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path
import tempfile

import aiofiles
from fastapi import UploadFile

from common.services.base_service import BaseService
from common.models.actions import DomainAction
from common.clients.base_redis_client import BaseRedisClient
from common.supabase.client import SupabaseClient
from common.supabase.models import IngestionMetadata

from ..models import (
    DocumentIngestionRequest,
    IngestionStatus,
    ChunkModel,
    RAGIngestionConfig
)
from ..handler import DocumentHandler, QdrantHandler, EmbeddingHandler
from ..config.settings import IngestionSettings

logger = logging.getLogger(__name__)


class IngestionService(BaseService):
    """
    Servicio principal de ingestion simplificado.
    - Estado solo en Redis
    - Sin agent_id para embeddings
    - Flujo linear y robusto
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        service_redis_client: Optional[BaseRedisClient] = None,
        direct_redis_conn = None,
        supabase_client: Optional[SupabaseClient] = None,
        qdrant_client = None,
        embedding_client = None
    ):
        """Inicializa el servicio de ingestion."""
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        # Almacenar dependencias
        self.supabase_client = supabase_client
        self.qdrant_client = qdrant_client
        self.embedding_client = embedding_client
        
        # Handlers se inicializan en initialize()
        self.document_handler = None
        self.qdrant_handler = None
        self.embedding_handler = None
        self.websocket_manager = None
        
        # TTL para estados en Redis
        self.task_ttl = 3600  # 1 hora
    
    async def initialize(self):
        """Inicializa handlers y componentes del servicio."""
        try:
            self._logger.info("Inicializando IngestionService...")
            
            # Inicializar handlers
            self.document_handler = DocumentHandler(
                app_settings=self.app_settings
            )
            
            if self.qdrant_client:
                self.qdrant_handler = QdrantHandler(
                    app_settings=self.app_settings,
                    qdrant_client=self.qdrant_client
                )
                await self.qdrant_handler.initialize()
            
            if self.embedding_client:
                self.embedding_handler = EmbeddingHandler(
                    app_settings=self.app_settings,
                    embedding_client=self.embedding_client
                )
            
            self._logger.info("IngestionService inicializado correctamente")
            
        except Exception as e:
            self._logger.error(f"Error inicializando IngestionService: {e}")
            raise
    
    def set_websocket_manager(self, websocket_manager):
        """Configura el WebSocket manager."""
        self.websocket_manager = websocket_manager
        self._logger.info("WebSocket manager configurado")
    
    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una DomainAction de ingestion.
        
        Tipos de acciones soportadas:
        - ingestion.embedding_callback: Callback con embeddings generados
        """
        try:
            action_type = action.action_type
            self._logger.info(
                f"Procesando acción: {action_type}",
                extra={
                    "action_id": str(action.action_id),
                    "tenant_id": str(action.tenant_id)
                }
            )

            # Enrutar según tipo de acción
            if action_type == "ingestion.embedding_callback":
                return await self.handle_embedding_callback(action)
            else:
                self._logger.warning(f"Tipo de acción no soportado: {action_type}")
                return None

        except Exception as e:
            self._logger.error(f"Error procesando acción: {e}", exc_info=True)
            raise
    
    # === Estado en Redis ===
    
    async def get_task_state(self, task_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """Obtiene estado de tarea desde Redis."""
        try:
            key = f"ingestion:task:{task_id}"
            data = await self.direct_redis_conn.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            self._logger.error(f"Error obteniendo estado de tarea {task_id}: {e}")
            return None
    
    async def update_task_state(
        self, 
        task_id: uuid.UUID, 
        updates: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> None:
        """Actualiza estado de tarea en Redis."""
        try:
            # Obtener estado actual
            task = await self.get_task_state(task_id)
            if not task:
                task = {"task_id": str(task_id)}
            
            # Actualizar campos
            task.update(updates)
            task["updated_at"] = datetime.utcnow().isoformat()
            
            # Guardar en Redis
            key = f"ingestion:task:{task_id}"
            ttl = ttl or self.task_ttl
            await self.direct_redis_conn.setex(
                key, ttl, json.dumps(task, default=str)
            )
            
            # Notificar por WebSocket si está configurado
            if self.websocket_manager and "status" in updates:
                await self.websocket_manager.send_progress_update(
                    task_id=task_id,
                    status=updates.get("status"),
                    message=updates.get("message", ""),
                    percentage=updates.get("percentage", 0),
                    total_chunks=task.get("total_chunks"),
                    processed_chunks=task.get("processed_chunks"),
                    error=updates.get("error")
                )
            
        except Exception as e:
            self._logger.error(f"Error actualizando estado de tarea {task_id}: {e}")
    
    async def get_task_status(
        self, 
        task_id: uuid.UUID, 
        user_id: uuid.UUID
    ) -> Optional[Dict[str, Any]]:
        """Obtiene estado de tarea para un usuario."""
        try:
            task = await self.get_task_state(task_id)
            if not task:
                return None
            
            # Verificar que el usuario tiene acceso
            if task.get("user_id") != str(user_id):
                self._logger.warning(f"Usuario {user_id} intentó acceder a tarea {task_id}")
                return None
            
            return {
                "task_id": str(task_id),
                "status": task.get("status", "unknown"),
                "message": task.get("message", ""),
                "percentage": task.get("percentage", 0),
                "total_chunks": task.get("total_chunks", 0),
                "processed_chunks": task.get("processed_chunks", 0),
                "error": task.get("error")
            }
            
        except Exception as e:
            self._logger.error(f"Error obteniendo estado de tarea: {e}")
            return None
    
    # === Ingestion Principal ===
    
    async def ingest_document(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        request: DocumentIngestionRequest,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Procesa la ingestion de un documento.
        
        - RAG config viene del request
        - collection_id se genera si no viene
        - document_id siempre se genera aquí
        - agent_ids es opcional (lista vacía por defecto)
        """
        # Generar IDs
        task_id = uuid.uuid4()
        document_id = uuid.uuid4()
        
        # Generar collection_id si no viene
        if not request.collection_id:
            request.collection_id = f"col_{uuid.uuid4().hex[:8]}"
            logger.info(f"Generated collection_id: {request.collection_id}")
        
        # Usar RAG config del request o defaults
        rag_config = request.rag_config or RAGIngestionConfig()
        
        # Asegurar que agent_ids es lista
        if not isinstance(request.agent_ids, list):
            request.agent_ids = []
        
        # Validar consistencia del modelo en la collection
        await self._validate_collection_consistency(
            tenant_id=str(tenant_id),
            collection_id=request.collection_id,
            rag_config=rag_config,
            auth_token=auth_token
        )
        
        # Crear estado inicial en Redis
        initial_state = {
            "task_id": str(task_id),
            "document_id": str(document_id),
            "tenant_id": str(tenant_id),
            "user_id": str(user_id),
            "collection_id": request.collection_id,
            "agent_ids": request.agent_ids,
            "status": IngestionStatus.PROCESSING.value,
            "percentage": 0,
            "message": "Starting ingestion",
            "created_at": datetime.utcnow().isoformat(),
            "request": request.model_dump(mode='json'),
            "rag_config": rag_config.model_dump(mode='json'),
            "total_chunks": 0,
            "processed_chunks": 0,
            "auth_token": auth_token
        }
        
        await self.update_task_state(task_id, initial_state)
        
        # Iniciar procesamiento asíncrono
        asyncio.create_task(
            self._process_document_async(task_id)
        )
        
        return {
            "task_id": str(task_id),
            "document_id": str(document_id),
            "collection_id": request.collection_id,
            "agent_ids": request.agent_ids,
            "status": IngestionStatus.PROCESSING.value,
            "message": "Document ingestion started"
        }
    
    async def _process_document_async(self, task_id: uuid.UUID):
        """Procesamiento asíncrono del documento."""
        try:
            # Obtener estado
            task = await self.get_task_state(task_id)
            if not task:
                raise ValueError(f"Task {task_id} not found")
            
            # Reconstruir request y config
            request = DocumentIngestionRequest(**task["request"])
            rag_config = RAGIngestionConfig(**task["rag_config"])
            
            # 1. CHUNKING
            await self.update_task_state(task_id, {
                "status": IngestionStatus.CHUNKING.value,
                "percentage": 20,
                "message": "Processing document"
            })
            
            chunks = await self.document_handler.process_document(
                request=request,
                document_id=task["document_id"],
                tenant_id=task["tenant_id"],
                collection_id=task["collection_id"],
                agent_ids=task["agent_ids"]
            )
            
            # Guardar chunks en Redis temporalmente
            chunks_key = f"ingestion:chunks:{task_id}"
            chunks_data = [chunk.model_dump(mode='json') for chunk in chunks]
            await self.direct_redis_conn.setex(
                chunks_key, 
                self.task_ttl, 
                json.dumps(chunks_data, default=str)
            )
            
            await self.update_task_state(task_id, {
                "status": IngestionStatus.EMBEDDING.value,
                "percentage": 40,
                "message": f"Created {len(chunks)} chunks",
                "total_chunks": len(chunks),
                "processed_chunks": 0
            })
            
            # 2. EMBEDDINGS - Sin agent_id real
            await self.embedding_handler.generate_embeddings(
                chunks=chunks,
                tenant_id=uuid.UUID(task["tenant_id"]),
                task_id=task_id,
                rag_config=rag_config
            )
            
            # El callback manejará el resto...
            
        except Exception as e:
            logger.error(f"Document processing error: {e}", exc_info=True)
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "percentage": 0,
                "message": "Processing failed",
                "error": str(e)
            })
    
    async def handle_embedding_callback(
        self,
        action: DomainAction
    ) -> Dict[str, Any]:
        """Maneja callback con embeddings del embedding service."""
        data = action.data
        task_id = uuid.UUID(data["task_id"])
        
        # Obtener estado de Redis
        task = await self.get_task_state(task_id)
        if not task:
            logger.error(f"Task not found: {task_id}")
            return {"error": "Task not found"}
        
        try:
            # Obtener chunks de Redis
            chunks_key = f"ingestion:chunks:{task_id}"
            chunks_data = await self.direct_redis_conn.get(chunks_key)
            if not chunks_data:
                raise ValueError("Chunks not found in Redis")
            
            chunks = [
                ChunkModel(**chunk_dict) 
                for chunk_dict in json.loads(chunks_data)
            ]
            
            # Verificar si el embedding service reportó un error
            embedding_status = data.get("status", "completed")
            if embedding_status == "failed":
                error_msg = data.get("error", "Embedding generation failed")
                logger.error(f"Embedding service reported failure: {error_msg}")
                raise ValueError(f"Embedding generation failed: {error_msg}")
            
            # Actualizar chunks con embeddings
            chunk_embeddings = data["embeddings"]
            if not chunk_embeddings or len(chunk_embeddings) == 0:
                raise ValueError("No embeddings received from embedding service")
                
            for i, chunk in enumerate(chunks):
                if i < len(chunk_embeddings):
                    chunk.embedding = chunk_embeddings[i]
            
            await self.update_task_state(task_id, {
                "status": IngestionStatus.STORING.value,
                "percentage": 80,
                "message": "Storing vectors",
                "processed_chunks": min(len(chunk_embeddings), len(chunks))
            })
            
            # Metadata de embedding
            embedding_metadata = {
                "embedding_model": data.get("embedding_model"),
                "embedding_dimensions": data.get("embedding_dimensions"),
                "encoding_format": data.get("encoding_format", "float")
            }
            
            # Almacenar en Qdrant
            result = await self.qdrant_handler.store_chunks(
                chunks=chunks,
                tenant_id=task["tenant_id"],
                collection_id=task["collection_id"],
                agent_ids=task["agent_ids"],
                embedding_metadata=embedding_metadata
            )
            
            # Persistir en Supabase
            await self._persist_document_metadata(task, embedding_metadata)
            
            # Completar
            await self.update_task_state(task_id, {
                "status": IngestionStatus.COMPLETED.value,
                "percentage": 100,
                "message": "Ingestion completed",
                "processed_chunks": result["stored"]
            })
            
            # Limpiar chunks de Redis
            await self.direct_redis_conn.delete(chunks_key)
            
            return {"status": "completed", "processed_chunks": result["stored"]}
            
        except Exception as e:
            logger.error(f"Callback error: {e}", exc_info=True)
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "error": str(e)
            })
            return {"error": str(e)}
    
    # === Helpers ===
    
    async def save_uploaded_file(self, file: UploadFile) -> Path:
        """Guarda archivo temporal para procesamiento."""
        temp_dir = Path(tempfile.gettempdir()) / "ingestion_uploads"
        temp_dir.mkdir(exist_ok=True)
        
        file_path = temp_dir / f"{uuid.uuid4()}_{file.filename}"
        
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        return file_path
    
    async def _validate_collection_consistency(
        self,
        tenant_id: str,
        collection_id: str,
        rag_config: RAGIngestionConfig,
        auth_token: Optional[str] = None
    ):
        """Valida que todos los docs en una collection usen el mismo modelo."""
        try:
            # Establecer auth del usuario para respetar RLS
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(auth_token)
                except Exception:
                    self._logger.debug("Could not set postgrest auth token", exc_info=True)
            # Consultar si ya hay documentos en esta collection
            def _select_existing():
                # Usar admin_client para bypass de RLS
                client = self.supabase_client.admin_client or self.supabase_client.client
                return (
                    client
                    .table("documents_rag")
                    .select("embedding_model, embedding_dimensions")
                    .eq("user_id", tenant_id)
                    .eq("collection_id", collection_id)
                    .limit(1)
                    .execute()
                )
            existing = await asyncio.to_thread(_select_existing)
            
            if existing.data:
                existing_model = existing.data[0]["embedding_model"]
                existing_dims = existing.data[0]["embedding_dimensions"]
                
                # Obtener valor string del modelo
                req_model_value = (
                    rag_config.embedding_model.value 
                    if hasattr(rag_config.embedding_model, 'value')
                    else str(rag_config.embedding_model)
                )

                if (existing_model != req_model_value or 
                    existing_dims != rag_config.embedding_dimensions):
                    raise ValueError(
                        f"Collection '{collection_id}' already uses model '{existing_model}' "
                        f"with {existing_dims} dimensions. Cannot mix models in same collection."
                    )
            
        except Exception as e:
            if "Cannot mix models" in str(e):
                raise
            self._logger.warning(f"Error validating collection: {e}")
        finally:
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(None)
                except Exception:
                    pass
    
    async def _persist_document_metadata(
        self,
        task: Dict[str, Any],
        embedding_metadata: Dict[str, Any]
    ):
        """Persiste metadata en tabla documents_rag."""
        try:
            # agent_ids como array
            agent_ids = task.get("agent_ids") or []
            
            # Obtener tipo de documento
            request_data = task.get("request", {})
            doc_type = request_data.get("document_type", "unknown")
            
            # Configuración RAG usada
            rag_cfg = task.get("rag_config", {})
            
            # Crear modelo de metadata para validación y mapeo (tenant_id -> user_id)
            metadata_model = IngestionMetadata(
                tenant_id=uuid.UUID(str(task["tenant_id"])),
                collection_id=task["collection_id"],
                document_id=uuid.UUID(str(task["document_id"])),
                document_name=request_data.get("document_name", "Unknown"),
                document_type=doc_type,
                
                # Datos de embeddings
                embedding_model=embedding_metadata["embedding_model"],
                embedding_dimensions=embedding_metadata["embedding_dimensions"],
                encoding_format=embedding_metadata.get("encoding_format", "float"),
                
                # Configuración de chunking
                chunk_size=rag_cfg.get("chunk_size", 512),
                chunk_overlap=rag_cfg.get("chunk_overlap", 50),
                
                # Estado
                status="completed",
                total_chunks=task.get("total_chunks", 0),
                processed_chunks=task.get("processed_chunks", task.get("total_chunks", 0)),
                
                # Agentes
                agent_ids=agent_ids,
                
                # Metadata adicional
                metadata={
                    **request_data.get("metadata", {}),
                    "task_id": str(task["task_id"])
                }
            )
            
            # Convertir a dict usando alias para Supabase (user_id)
            document_data = metadata_model.model_dump(by_alias=True, mode='json')
            
            # LOG PARA DIAGNÓSTICO (DEBUG)
            self._logger.debug(f"Supabase persistence payload keys: {list(document_data.keys())}")
            self._logger.debug(f"Supabase persistence payload (JSON): {json.dumps(document_data, indent=2)}")
            
            self._logger.info(f"[INGESTION] Persisting metadata for: {metadata_model.document_name}")

            # Usar admin_client para evitar problemas de RLS en worker de background
            # y race conditions con el auth token compartido
            def _insert_document():
                # Forzar admin_client para bypass de RLS
                client = self.supabase_client.admin_client or self.supabase_client.client
                self._logger.debug(f"Using Supabase client type: {'admin' if self.supabase_client.admin_client else 'standard'}")
                return (
                    client
                    .table("documents_rag")
                    .insert(document_data)
                    .execute()
                )
                
            response = await asyncio.to_thread(_insert_document)
            
            # Verificar si hubo error en la respuesta (algunas versiones no levantan excepción)
            if hasattr(response, 'error') and response.error:
                raise Exception(f"Supabase API error (PGRST): {response.error}")
                
            self._logger.info(f"[INGESTION] Metadata persisted successfully in Supabase")
            
        except Exception as e:
            self._logger.error(f"Error persisting metadata in Supabase: {e}", exc_info=True)
            # No levantamos excepción para no romper el flujo del worker, 
            # pero el error queda logueado.
        finally:
            # No es necesario limpiar auth porque usamos admin_client o no tocamos el auth del client
            pass
    
    async def delete_document(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
        collection_id: str,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Elimina documento de Qdrant y Supabase."""
        try:
            # 1. Eliminar de Qdrant
            chunks_deleted = await self.qdrant_handler.delete_document(
                tenant_id=str(tenant_id),
                document_id=str(document_id),
                collection_id=collection_id
            )
            
            # 2. Eliminar de Supabase
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(auth_token)
                except Exception:
                    self._logger.debug("Could not set postgrest auth token for delete", exc_info=True)
            def _delete_document():
                # Usar admin_client para bypass de RLS
                client = self.supabase_client.admin_client or self.supabase_client.client
                self._logger.info(f"Deleting document from Supabase (user_id={tenant_id}, document_id={document_id})")
                return (
                    client
                    .table("documents_rag")
                    .delete()
                    .match({
                        "user_id": str(tenant_id),
                        "document_id": str(document_id),
                        "collection_id": collection_id
                    })
                    .execute()
                )
            response = await asyncio.to_thread(_delete_document)
            
            # Verificar si se eliminó algo en Supabase
            if hasattr(response, 'data') and not response.data:
                self._logger.warning(
                    f"Document {document_id} was deleted from Qdrant but not found in Supabase "
                    f"(or no permission for tenant {tenant_id})"
                )
            elif response:
                self._logger.info(f"Document {document_id} deleted successfully from Supabase")
            
            return {
                "message": "Document deleted successfully",
                "document_id": str(document_id),
                "chunks_deleted": chunks_deleted
            }
            
        except Exception as e:
            self._logger.error(f"Error deleting document: {e}")
            raise
        finally:
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(None)
                except Exception:
                    pass
    
    async def update_document_agents(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
        agent_ids: List[str],
        operation: str = "set",
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Actualiza agentes con acceso a un documento."""
        try:
            # 1. Actualizar en Qdrant
            await self.qdrant_handler.update_chunk_agents(
                tenant_id=str(tenant_id),
                document_id=str(document_id),
                agent_ids=agent_ids,
                operation=operation
            )
            
            # 2. Actualizar en Supabase usando RPC
            def _update_supabase():
                # Usar admin_client para bypass de RLS y asegurar ejecución
                client = self.supabase_client.admin_client or self.supabase_client.client
                self._logger.info(f"Updating agents for document {document_id} via RPC (op={operation})")
                
                return (
                    client.rpc("update_document_agents", {
                        "p_document_id": str(document_id),
                        "p_agent_ids": agent_ids,
                        "p_operation": operation
                    })
                    .execute()
                )
            
            await asyncio.to_thread(_update_supabase)
            
            return {
                "success": True,
                "document_id": str(document_id),
                "agent_ids": agent_ids,
                "operation": operation
            }
            
        except Exception as e:
            self._logger.error(f"Error updating agents: {e}", exc_info=True)
            raise
        finally:
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(None)
                except Exception:
                    pass