"""
Servicio principal de Ingestion.

Actualizado para:
1. Delegar extracción a extraction-service
2. Procesar callbacks de extracción
3. Aplicar chunking jerárquico
4. Enviar a embedding-service
"""

import asyncio
import json
import logging
import uuid
import os
import aiofiles
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile

from common.services.base_service import BaseService
from common.models.actions import DomainAction
from common.models.config_models import ProcessingMode, SpacyModelSize
from common.clients.base_redis_client import BaseRedisClient
from common.supabase.client import SupabaseClient

from ..config.settings import IngestionSettings
from ..models.ingestion_models import (
    IngestionStatus,
    DocumentIngestionRequest,
    IngestionResponse,
    IngestionProgress,
    ChunkModel,
    RAGIngestionConfig
)
from ..handler.document_handler import DocumentHandler
from ..handler.hierarchical_chunker import HierarchicalChunker
from ..handler.qdrant_handler import QdrantHandler
from ..handler.embedding_handler import EmbeddingHandler
from ..clients.extraction_client import ExtractionClient
from ..clients.embedding_client import EmbeddingClient
from ..websocket.ingestion_websocket_manager import IngestionWebSocketManager


class IngestionService(BaseService):
    """
    Servicio principal de Ingestion.
    
    Pipeline v2:
    1. Recibe documento → guarda archivo temp
    2. Consulta límites de suscripción
    3. Envía a extraction-service (async con callback)
    4. Recibe callback con texto + spaCy enrichment
    5. Aplica chunking jerárquico
    6. Envía a embedding-service
    7. Almacena en Qdrant
    8. Notifica completado
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        service_redis_client: Optional[BaseRedisClient] = None,
        direct_redis_conn=None,
        supabase_client: Optional[SupabaseClient] = None,
        qdrant_client: Optional[Any] = None,
        embedding_client: Optional[EmbeddingClient] = None
    ):
        """Inicializa el servicio de ingestion."""
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        # Clients
        self.supabase_client = supabase_client
        self.qdrant_client = qdrant_client
        self.embedding_client = embedding_client
        self.websocket_manager: Optional[IngestionWebSocketManager] = None
        
        # Handlers
        self.hierarchical_chunker: Optional[HierarchicalChunker] = None
        self.document_handler: Optional[DocumentHandler] = None
        self.qdrant_handler: Optional[QdrantHandler] = None
        self.embedding_handler: Optional[EmbeddingHandler] = None
        
        # Clients
        self.extraction_client: Optional[ExtractionClient] = None
        
        # Estado de tareas en progreso
        self._tasks_state: Dict[str, Dict[str, Any]] = {}
        
        # Config
        self.use_extraction_service = app_settings.use_extraction_service
        self.temp_dir = Path(app_settings.temp_dir)

    def set_websocket_manager(self, manager: IngestionWebSocketManager):
        """Configura el WebSocket manager."""
        self.websocket_manager = manager
    
    async def initialize(self):
        """Inicializa componentes del servicio."""
        self._logger.info("Initializing IngestionService...")
        
        # Crear directorio temporal
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        # Inicializar handlers
        self.hierarchical_chunker = HierarchicalChunker(self.app_settings)
        self.document_handler = DocumentHandler(
            self.app_settings,
            self.hierarchical_chunker
        )
        
        # Inicializar handler de Qdrant
        if self.qdrant_client:
            self.qdrant_handler = QdrantHandler(
                app_settings=self.app_settings,
                qdrant_client=self.qdrant_client
            )
            await self.qdrant_handler.initialize()
            
        # Inicializar handler de Embedding
        if self.embedding_client:
            self.embedding_handler = EmbeddingHandler(
                app_settings=self.app_settings,
                embedding_client=self.embedding_client
            )
        
        # Inicializar client de extracción
        if self.use_extraction_service and self.service_redis_client:
            self.extraction_client = ExtractionClient(self.service_redis_client)
        
        # TTL para estados en Redis
        self.task_ttl = 3600  # 1 hora
        
        self._logger.info(
            "IngestionService initialized",
            extra={
                "use_extraction_service": self.use_extraction_service,
                "temp_dir": str(self.temp_dir),
                "has_supabase": self.supabase_client is not None,
                "has_qdrant": self.qdrant_client is not None,
                "has_embedding": self.embedding_client is not None
            }
        )

    async def get_task_state(self, task_id: Union[uuid.UUID, str]) -> Optional[Dict[str, Any]]:
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
        task_id: Union[uuid.UUID, str], 
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
                # Mapear status de enum a string si es necesario
                status_val = updates.get("status")
                if hasattr(status_val, 'value'):
                    status_val = status_val.value
                
                await self.websocket_manager.send_progress_update(
                    task_id=uuid.UUID(str(task_id)) if isinstance(task_id, str) else task_id,
                    status=str(status_val),
                    message=updates.get("message", ""),
                    percentage=updates.get("percentage", 0),
                    total_chunks=task.get("total_chunks"),
                    processed_chunks=task.get("processed_chunks"),
                    error=updates.get("error")
                )
            
        except Exception as e:
            self._logger.error(f"Error actualizando estado de tarea {task_id}: {e}")

    async def _validate_collection_consistency(
        self,
        tenant_id: str,
        collection_id: str,
        rag_config: RAGIngestionConfig,
        auth_token: Optional[str] = None
    ):
        """Valida que todos los docs en una collection usen el mismo modelo."""
        if not self.supabase_client:
            return
            
        try:
            # Establecer auth del usuario para respetar RLS
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(auth_token)
                except Exception:
                    self._logger.debug("Could not set postgrest auth token", exc_info=True)
            
            # Consultar si ya hay documentos en esta collection
            def _select_existing():
                return (
                    self.supabase_client.client
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

    async def ingest_document(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        request: DocumentIngestionRequest,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Inicia el proceso de ingestion de un documento.
        Punto de entrada para la API.
        """
        # Crear DomainAction para iniciar el flujo
        action = DomainAction(
            action_type="ingestion.document.ingest",
            tenant_id=tenant_id,
            user_id=user_id,
            task_id=uuid.uuid4(),
            session_id=uuid.uuid4(), # Sesión temporal para tracking
            origin_service=self.service_name,
            data={
                **request.model_dump(),
                "auth_token": auth_token
            }
        )
        
        # Procesar usando la lógica de acción existente
        return await self._handle_ingest(action)

    async def save_uploaded_file(self, file: UploadFile) -> Path:
        """Guarda un archivo subido temporalmente."""
        content = await file.read()
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
        
        path_str = await self._save_temp_file(
            content=content,
            document_name=file.filename,
            document_type=file_extension
        )
        return Path(path_str)

    async def delete_document(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
        collection_id: str,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Elimina un documento y sus chunks."""
        # TODO: Implementar eliminación real
        self._logger.info(f"Deleting document {document_id}")
        return {"status": "success", "message": f"Document {document_id} marked for deletion"}

    async def update_document_agents(
        self,
        tenant_id: uuid.UUID,
        document_id: uuid.UUID,
        agent_ids: List[str],
        operation: str = "set",
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Actualiza los agentes asociados a un documento."""
        # TODO: Implementar actualización real
        self._logger.info(f"Updating agents for document {document_id}")
        return {"status": "success", "message": f"Document {document_id} agents updated"}
    
    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una DomainAction de ingestion.
        
        Tipos soportados:
        - ingestion.document.ingest: Iniciar ingestion de documento
        - ingestion.extraction_callback: Callback de extraction-service
        - ingestion.embedding_callback: Callback de embedding-service
        """
        action_type = action.action_type
        
        self._logger.info(
            f"Processing action: {action_type}",
            extra=action.get_log_extra()
        )
        
        if action_type == "ingestion.document.ingest":
            return await self._handle_ingest(action)
        elif action_type == "ingestion.extraction_callback":
            return await self.handle_extraction_callback(action)
        elif action_type == "ingestion.embedding_callback":
            return await self._handle_embedding_callback(action)
        else:
            self._logger.warning(f"Unknown action type: {action_type}")
            return None
    
    async def _handle_ingest(self, action: DomainAction) -> Dict[str, Any]:
        """
        Maneja request de ingestion de documento.
        """
        task_id = str(action.task_id)
        tenant_id = str(action.tenant_id)
        user_id = str(action.user_id)
        
        try:
            # Parsear request
            request_data = action.data
            document_name = request_data.get("document_name", "documento")
            document_type = request_data.get("document_type", "pdf")
            file_content = request_data.get("file_content")
            file_path = request_data.get("file_path")
            auth_token = request_data.get("auth_token")
            
            # RAG config
            rag_config_data = request_data.get("rag_config", {})
            rag_config = RAGIngestionConfig(**rag_config_data)
            
            # IDs
            document_id = str(uuid.uuid4())
            collection_id = request_data.get("collection_id") or f"col_{uuid.uuid4().hex[:12]}"
            agent_ids = request_data.get("agent_ids", [])
            
            self._logger.info(
                f"Starting ingestion",
                extra={
                    "task_id": task_id,
                    "document_id": document_id,
                    "document_name": document_name,
                    "collection_id": collection_id
                }
            )
            
            # Validar consistencia de la collection
            await self._validate_collection_consistency(
                tenant_id=tenant_id,
                collection_id=collection_id,
                rag_config=rag_config,
                auth_token=auth_token
            )
            
            # Guardar archivo temporal si viene content
            if file_content and not file_path:
                file_path = await self._save_temp_file(
                    content=file_content,
                    document_name=document_name,
                    document_type=document_type
                )
            
            if not file_path:
                raise ValueError("No file_path or file_content provided")
            
            # Crear estado inicial en Redis
            initial_state = {
                "task_id": task_id,
                "document_id": document_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "document_name": document_name,
                "document_type": document_type,
                "rag_config": rag_config.model_dump(mode='json'),
                "file_path": str(file_path),
                "status": IngestionStatus.EXTRACTING.value,
                "percentage": 10,
                "message": "Starting extraction",
                "created_at": datetime.utcnow().isoformat(),
                "auth_token": auth_token,
                "total_chunks": 0,
                "processed_chunks": 0
            }
            
            await self.update_task_state(task_id, initial_state)
            
            # Determinar modelo spaCy según tier
            spacy_model_size = self._get_spacy_model_size(rag_config.processing_mode)
            
            # Enviar a extraction-service
            if self.use_extraction_service and self.extraction_client:
                await self.extraction_client.request_extraction(
                    task_id=uuid.UUID(str(task_id)),
                    document_id=uuid.UUID(str(document_id)),
                    tenant_id=uuid.UUID(str(tenant_id)),
                    file_path=file_path,
                    document_type=document_type,
                    document_name=document_name,
                    processing_mode=rag_config.processing_mode,
                    spacy_model_size=spacy_model_size,
                    max_pages=request_data.get("max_pages"),
                    metadata=request_data.get("metadata", {})
                )
            else:
                self._logger.warning("Extraction service not available")
                # TODO: Implement local extraction fallback
            
            return {
                "task_id": task_id,
                "document_id": document_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "status": IngestionStatus.EXTRACTING.value,
                "message": "Extraction started",
                "processing_mode": rag_config.processing_mode
            }
            
        except Exception as e:
            self._logger.error(f"Error starting ingestion: {e}", exc_info=True)
            if task_id:
                await self.update_task_state(task_id, {
                    "status": IngestionStatus.FAILED.value,
                    "error": str(e),
                    "message": "Failed to start ingestion"
                })
            return {
                "task_id": task_id,
                "status": IngestionStatus.FAILED.value,
                "error": str(e)
            }
            
        except Exception as e:
            self._logger.error(f"Error starting ingestion: {e}", exc_info=True)
            return {
                "task_id": task_id,
                "status": IngestionStatus.FAILED.value,
                "error": str(e)
            }
    
    async def handle_extraction_callback(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Maneja callback de extraction-service.
        """
        callback_data = action.data
        task_id = callback_data.get("task_id")
        status = callback_data.get("status")
        
        self._logger.info(
            f"Received extraction callback",
            extra={
                "task_id": task_id,
                "status": status
            }
        )
        
        # Recuperar estado de Redis
        task_state = await self.get_task_state(task_id)
        if not task_state:
            self._logger.error(f"Task state not found for {task_id}")
            return None
        
        # Verificar si falló
        if status == "failed":
            error = callback_data.get("error", "Unknown extraction error")
            self._logger.error(f"Extraction failed: {error}")
            
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "error": str(error),
                "message": "Extraction failed"
            })
            return None
        
        try:
            # Actualizar estado
            await self.update_task_state(task_id, {
                "status": IngestionStatus.CHUNKING.value,
                "percentage": 30,
                "message": "Applying hierarchical chunking"
            })
            
            # Extraer datos del callback
            extracted_text = callback_data.get("extracted_text", "")
            structure = callback_data.get("structure", {})
            spacy_enrichment = callback_data.get("spacy_enrichment", {})
            
            # Reconstruir RAG config
            rag_config = RAGIngestionConfig(**task_state["rag_config"])
            
            # Aplicar chunking jerárquico
            chunks = await self.document_handler.process_extracted_document(
                extracted_text=extracted_text,
                structure=structure,
                spacy_enrichment=spacy_enrichment,
                document_id=task_state["document_id"],
                tenant_id=task_state["tenant_id"],
                collection_id=task_state["collection_id"],
                agent_ids=task_state["agent_ids"],
                document_name=task_state["document_name"],
                document_type=task_state["document_type"],
                rag_config=rag_config,
                processing_mode=rag_config.processing_mode
            )
            
            self._logger.info(f"Document chunked: {len(chunks)} chunks")
            
            # Guardar chunks en Redis temporalmente (para el siguiente callback)
            chunks_key = f"ingestion:chunks:{task_id}"
            chunks_data = [chunk.model_dump(mode='json') for chunk in chunks]
            await self.direct_redis_conn.setex(
                chunks_key, 
                self.task_ttl, 
                json.dumps(chunks_data, default=str)
            )
            
            await self.update_task_state(task_id, {
                "status": IngestionStatus.EMBEDDING.value,
                "percentage": 50,
                "message": f"Created {len(chunks)} chunks, generating embeddings",
                "total_chunks": len(chunks),
                "processed_chunks": 0
            })
            
            # Enviar a embedding-service
            await self._send_to_embedding_service(task_id, chunks, task_state)
            
            return None
            
        except Exception as e:
            self._logger.error(f"Error processing extraction callback: {e}", exc_info=True)
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "error": str(e),
                "message": "Chunking failed"
            })
            return None
    
    async def _handle_embedding_callback(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Maneja callback de embedding-service.
        """
        callback_data = action.data
        task_id = callback_data.get("task_id")
        status = callback_data.get("status", "completed")
        
        self._logger.info(f"Received embedding callback for {task_id}")
        
        # Recuperar estado
        task_state = await self.get_task_state(task_id)
        if not task_state:
            self._logger.error(f"Task state not found for {task_id}")
            return None
            
        if status == "failed":
            error = callback_data.get("error", "Embedding failed")
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "error": str(error),
                "message": "Embedding generation failed"
            })
            return None
        
        try:
            # Recuperar chunks de Redis
            chunks_key = f"ingestion:chunks:{task_id}"
            chunks_data = await self.direct_redis_conn.get(chunks_key)
            if not chunks_data:
                raise ValueError("Chunks not found in Redis (expired or never stored)")
                
            chunks = [ChunkModel(**c) for c in json.loads(chunks_data)]
            embeddings = callback_data.get("embeddings", [])
            
            # Asociar embeddings
            for i, chunk in enumerate(chunks):
                if i < len(embeddings):
                    chunk.embedding = embeddings[i]
            
            await self.update_task_state(task_id, {
                "status": IngestionStatus.STORING.value,
                "percentage": 80,
                "message": "Storing chunks in Qdrant and Supabase",
                "processed_chunks": min(len(embeddings), len(chunks))
            })
            
            # Almacenar en Qdrant
            embedding_metadata = {
                "embedding_model": callback_data.get("embedding_model", task_state["rag_config"].get("embedding_model")),
                "embedding_dimensions": callback_data.get("embedding_dimensions", task_state["rag_config"].get("embedding_dimensions")),
                "encoding_format": callback_data.get("encoding_format", "float")
            }
            
            await self._store_in_qdrant(task_id, chunks, task_state, embedding_metadata)
            
            # Persistir metadata en Supabase
            await self._persist_metadata(task_id, task_state, embedding_metadata)
            
            # Completar
            await self.update_task_state(task_id, {
                "status": IngestionStatus.COMPLETED.value,
                "percentage": 100,
                "message": "Ingestion completed successfully",
                "processed_chunks": len(chunks)
            })
            
            # Limpiar chunks de Redis
            await self.direct_redis_conn.delete(chunks_key)
            
            return {
                "task_id": task_id,
                "document_id": task_state["document_id"],
                "status": "completed"
            }
            
        except Exception as e:
            self._logger.error(f"Error processing embedding callback: {e}", exc_info=True)
            await self.update_task_state(task_id, {
                "status": IngestionStatus.FAILED.value,
                "error": str(e),
                "message": "Persistence failed"
            })
            return None
    
    async def _send_to_embedding_service(
        self,
        task_id: str,
        chunks: List[ChunkModel],
        task_state: Dict[str, Any]
    ):
        """Envía chunks a embedding-service."""
        if not self.service_redis_client:
            self._logger.warning("No Redis client for embedding service")
            return
        
        # Preparar payload
        embedding_payload = self.document_handler.prepare_embedding_payload(chunks)
        
        # Crear DomainAction para embedding
        embedding_action = DomainAction(
            action_type="embedding.batch_process",
            tenant_id=uuid.UUID(task_state["tenant_id"]),
            task_id=uuid.UUID(task_id),
            session_id=uuid.uuid4(),
            origin_service="ingestion-service",
            callback_action_type="ingestion.embedding_callback",
            data={
                "task_id": task_id,
                "document_id": task_state["document_id"],
                "texts": embedding_payload,
                "model": task_state["rag_config"].embedding_model.value,
                "dimensions": task_state["rag_config"].embedding_dimensions
            }
        )
        
        await self.service_redis_client.send_action_async_with_callback(
            action=embedding_action,
            callback_event_name="ingestion.embedding_callback"
        )
        
        self._logger.info(
            f"Embedding request sent",
            extra={
                "task_id": task_id,
                "chunks_count": len(chunks)
            }
        )
    
    async def _store_in_qdrant(
        self,
        task_id: str,
        chunks: List[ChunkModel],
        task_state: Dict[str, Any],
        embedding_metadata: Dict[str, Any]
    ):
        """Almacena chunks en Qdrant usando el handler."""
        if not self.qdrant_handler:
            self._logger.warning("Qdrant handler not available")
            return
            
        await self.qdrant_handler.store_chunks(
            chunks=chunks,
            tenant_id=task_state["tenant_id"],
            collection_id=task_state["collection_id"],
            agent_ids=task_state["agent_ids"],
            embedding_metadata=embedding_metadata
        )
    
    async def _persist_metadata(
        self,
        task_id: str,
        task_state: Dict[str, Any],
        embedding_metadata: Dict[str, Any]
    ):
        """Persiste metadata en tabla documents_rag de Supabase."""
        if not self.supabase_client:
            self._logger.warning("Supabase client not available")
            return
            
        try:
            auth_token = task_state.get("auth_token")
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(auth_token)
                except Exception:
                    self._logger.debug("Could not set postgrest auth token for insert", exc_info=True)
            
            # agent_ids como array JSON
            agent_ids = task_state["agent_ids"]
            if isinstance(agent_ids, str):
                agent_ids = [agent_ids]
            
            # Configuración RAG usada
            rag_cfg = task_state.get("rag_config", {})
            
            document_data = {
                "user_id": task_state["user_id"],
                "collection_id": task_state["collection_id"],
                "document_id": task_state["document_id"],
                "document_name": task_state.get("document_name", "Unknown"),
                "document_type": task_state.get("document_type", "unknown"),
                
                # Metadata de embeddings
                "embedding_model": embedding_metadata["embedding_model"],
                "embedding_dimensions": embedding_metadata["embedding_dimensions"],
                "encoding_format": embedding_metadata.get("encoding_format", "float"),

                # Configuración de chunking
                "chunk_size": rag_cfg.get("chunk_size"),
                "chunk_overlap": rag_cfg.get("chunk_overlap"),
                
                # Estado
                "status": "completed",
                "total_chunks": task_state.get("total_chunks", 0),
                "processed_chunks": task_state.get("processed_chunks", 0),
                
                # Metadata adicional
                "metadata": {
                    "agent_ids": agent_ids
                },
                
                # Campo legacy agent_id
                "agent_id": agent_ids[0] if agent_ids else None
            }
            
            def _insert_document():
                return (
                    self.supabase_client.client
                    .table("documents_rag")
                    .insert(document_data)
                    .execute()
                )
            await asyncio.to_thread(_insert_document)
            
            self._logger.info(f"Metadata persisted for document {task_state['document_id']}")
            
        except Exception as e:
            self._logger.error(f"Error persisting metadata: {e}")
        finally:
            if auth_token:
                try:
                    self.supabase_client.client.postgrest.auth(None)
                except Exception:
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
            chunks_deleted = 0
            if self.qdrant_handler:
                chunks_deleted = await self.qdrant_handler.delete_document(
                    tenant_id=str(tenant_id),
                    document_id=str(document_id),
                    collection_id=collection_id
                )
            
            # 2. Eliminar de Supabase
            if self.supabase_client:
                if auth_token:
                    try:
                        self.supabase_client.client.postgrest.auth(auth_token)
                    except Exception:
                        self._logger.debug("Could not set postgrest auth token for delete", exc_info=True)
                
                def _delete_document():
                    return (
                        self.supabase_client.client
                        .table("documents_rag")
                        .delete()
                        .match({
                            "user_id": str(tenant_id),
                            "document_id": str(document_id),
                            "collection_id": collection_id
                        })
                        .execute()
                    )
                await asyncio.to_thread(_delete_document)
            
            return {
                "message": "Document deleted successfully",
                "document_id": str(document_id),
                "chunks_deleted": chunks_deleted
            }
            
        except Exception as e:
            self._logger.error(f"Error deleting document: {e}")
            raise
        finally:
            if auth_token and self.supabase_client:
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
        """Actualiza los agentes con acceso a un documento."""
        try:
            # 1. Actualizar en Qdrant
            if self.qdrant_handler:
                success = await self.qdrant_handler.update_chunk_agents(
                    tenant_id=str(tenant_id),
                    document_id=str(document_id),
                    agent_ids=agent_ids,
                    operation=operation
                )
                if not success:
                    raise ValueError("Failed to update agents in Qdrant")
            
            # 2. Actualizar en Supabase
            if self.supabase_client:
                if auth_token:
                    try:
                        self.supabase_client.client.postgrest.auth(auth_token)
                    except Exception:
                        self._logger.debug("Could not set postgrest auth token for update", exc_info=True)
                
                def _select_doc():
                    return (
                        self.supabase_client.client
                        .table("documents_rag")
                        .select("metadata")
                        .match({
                            "user_id": str(tenant_id),
                            "document_id": str(document_id)
                        })
                        .execute()
                    )
                current_doc = await asyncio.to_thread(_select_doc)
                
                if current_doc.data:
                    metadata = current_doc.data["metadata"] or {}
                    current_agents = metadata.get("agent_ids", [])
                    
                    if operation == "set":
                        metadata["agent_ids"] = agent_ids
                    elif operation == "add":
                        metadata["agent_ids"] = list(set(current_agents + agent_ids))
                    elif operation == "remove":
                        metadata["agent_ids"] = [a for a in current_agents if a not in agent_ids]
                    
                    def _update_doc():
                        return (
                            self.supabase_client.client
                            .table("documents_rag")
                            .update({
                                "metadata": metadata,
                                "agent_id": agent_ids[0] if agent_ids else None
                            })
                            .match({
                                "user_id": str(tenant_id),
                                "document_id": str(document_id)
                            })
                            .execute()
                        )
                    await asyncio.to_thread(_update_doc)
            
            return {
                "success": True,
                "document_id": str(document_id),
                "agent_ids": agent_ids,
                "operation": operation
            }
            
        except Exception as e:
            self._logger.error(f"Error updating agents: {e}")
            raise
        finally:
            if auth_token and self.supabase_client:
                try:
                    self.supabase_client.client.postgrest.auth(None)
                except Exception:
                    pass
    
    async def _save_temp_file(
        self,
        content: Any,
        document_name: str,
        document_type: str
    ) -> str:
        """Guarda archivo temporal y retorna path."""
        import base64
        
        # Generar nombre único
        file_id = uuid.uuid4().hex[:12]
        extension = document_type.lower()
        filename = f"{file_id}_{document_name}.{extension}"
        file_path = self.temp_dir / filename
        
        # Decodificar si es base64
        if isinstance(content, str):
            try:
                content = base64.b64decode(content)
            except Exception:
                content = content.encode('utf-8')
        
        # Escribir archivo
        file_path.write_bytes(content)
        
        self._logger.debug(f"Saved temp file: {file_path}")
        
        return str(file_path)
    
    def _get_spacy_model_size(self, processing_mode: ProcessingMode) -> SpacyModelSize:
        """Determina tamaño de modelo spaCy según tier."""
        if processing_mode == ProcessingMode.FAST:
            return SpacyModelSize.MEDIUM
        else:
            return SpacyModelSize.LARGE
    
    async def get_task_status(
        self, 
        task_id: Union[uuid.UUID, str],
        user_id: Optional[uuid.UUID] = None
    ) -> Optional[Dict[str, Any]]:
        """Obtiene estado de tarea desde Redis."""
        task = await self.get_task_state(task_id)
        if not task:
            return None
            
        # Verificar usuario si se proporciona
        if user_id and task.get("user_id") != str(user_id):
            self._logger.warning(f"Unauthorized access to task {task_id} by user {user_id}")
            return None
            
        return {
            "task_id": str(task_id),
            "document_id": task.get("document_id"),
            "status": task.get("status"),
            "percentage": task.get("percentage", 0),
            "message": task.get("message", ""),
            "total_chunks": task.get("total_chunks", 0),
            "processed_chunks": task.get("processed_chunks", 0),
            "error": task.get("error")
        }
