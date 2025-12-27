"""
Servicio principal de Ingestion.

Actualizado para:
1. Delegar extracción a extraction-service
2. Procesar callbacks de extracción
3. Aplicar chunking jerárquico
4. Enviar a embedding-service
"""

import logging
import uuid
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path

from common.services.base_service import BaseService
from common.models.actions import DomainAction
from common.models.config_models import ProcessingMode, SpacyModelSize
from common.clients.base_redis_client import BaseRedisClient

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
from ..clients.extraction_client import ExtractionClient


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
        direct_redis_conn=None
    ):
        """Inicializa el servicio de ingestion."""
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        # Handlers
        self.hierarchical_chunker: Optional[HierarchicalChunker] = None
        self.document_handler: Optional[DocumentHandler] = None
        
        # Clients
        self.extraction_client: Optional[ExtractionClient] = None
        
        # Estado de tareas en progreso
        self._tasks_state: Dict[str, Dict[str, Any]] = {}
        
        # Config
        self.use_extraction_service = app_settings.use_extraction_service
        self.temp_dir = Path(app_settings.temp_dir)
    
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
        
        # Inicializar client de extracción
        if self.use_extraction_service and self.service_redis_client:
            self.extraction_client = ExtractionClient(self.service_redis_client)
        
        self._logger.info(
            "IngestionService initialized",
            extra={
                "use_extraction_service": self.use_extraction_service,
                "temp_dir": str(self.temp_dir)
            }
        )
    
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
        
        Flujo:
        1. Parsear request
        2. Obtener límites de suscripción
        3. Guardar archivo temporal
        4. Enviar a extraction-service
        5. Retornar estado inicial
        """
        task_id = str(action.task_id)
        tenant_id = str(action.tenant_id)
        
        try:
            # Parsear request
            request_data = action.data
            document_name = request_data.get("document_name", "documento")
            document_type = request_data.get("document_type", "pdf")
            file_content = request_data.get("file_content")  # Base64 o bytes
            file_path = request_data.get("file_path")
            
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
                    "document_type": document_type,
                    "processing_mode": rag_config.processing_mode.value
                }
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
            
            # Guardar estado de la tarea
            self._tasks_state[task_id] = {
                "document_id": document_id,
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "document_name": document_name,
                "document_type": document_type,
                "rag_config": rag_config,
                "file_path": file_path,
                "status": IngestionStatus.EXTRACTING,
                "started_at": datetime.utcnow()
            }
            
            # Determinar modelo spaCy según tier
            spacy_model_size = self._get_spacy_model_size(rag_config.processing_mode)
            
            # Enviar a extraction-service
            if self.use_extraction_service and self.extraction_client:
                await self.extraction_client.request_extraction(
                    task_id=task_id,
                    document_id=document_id,
                    tenant_id=tenant_id,
                    file_path=file_path,
                    document_type=document_type,
                    document_name=document_name,
                    processing_mode=rag_config.processing_mode,
                    spacy_model_size=spacy_model_size,
                    max_pages=request_data.get("max_pages"),
                    metadata=request_data.get("metadata", {})
                )
                
                self._logger.info(
                    f"Extraction request sent",
                    extra={
                        "task_id": task_id,
                        "document_id": document_id
                    }
                )
            else:
                # Fallback: procesamiento local (legacy)
                self._logger.warning("Extraction service not available, using legacy processing")
                # TODO: Implementar fallback local
            
            # Retornar estado inicial
            return {
                "task_id": task_id,
                "document_id": document_id,
                "collection_id": collection_id,
                "agent_ids": agent_ids,
                "status": IngestionStatus.EXTRACTING.value,
                "message": "Extraction started",
                "processing_mode": rag_config.processing_mode.value
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
        
        Flujo:
        1. Recuperar estado de la tarea
        2. Validar resultado de extracción
        3. Aplicar chunking jerárquico
        4. Enviar a embedding-service
        """
        callback_data = action.data
        task_id = callback_data.get("task_id")
        document_id = callback_data.get("document_id")
        status = callback_data.get("status")
        
        self._logger.info(
            f"Received extraction callback",
            extra={
                "task_id": task_id,
                "document_id": document_id,
                "status": status
            }
        )
        
        # Recuperar estado
        task_state = self._tasks_state.get(task_id)
        if not task_state:
            self._logger.error(f"Task state not found for {task_id}")
            return None
        
        # Verificar si falló
        if status == "failed":
            error = callback_data.get("error", {})
            self._logger.error(
                f"Extraction failed: {error.get('error_message')}",
                extra={"task_id": task_id}
            )
            task_state["status"] = IngestionStatus.FAILED
            task_state["error"] = error
            return None
        
        try:
            # Actualizar estado
            task_state["status"] = IngestionStatus.CHUNKING
            
            # Extraer datos del callback
            extracted_text = callback_data.get("extracted_text", "")
            structure = callback_data.get("structure", {})
            spacy_enrichment = callback_data.get("spacy_enrichment", {})
            extraction_method = callback_data.get("extraction_method", "unknown")
            
            self._logger.info(
                f"Processing extracted document",
                extra={
                    "task_id": task_id,
                    "text_length": len(extracted_text),
                    "sections_count": len(structure.get("sections", [])),
                    "entities_count": spacy_enrichment.get("entity_count", 0),
                    "extraction_method": extraction_method
                }
            )
            
            # Aplicar chunking jerárquico
            chunks = await self.document_handler.process_extracted_document(
                extracted_text=extracted_text,
                structure=structure,
                spacy_enrichment=spacy_enrichment,
                document_id=document_id,
                tenant_id=task_state["tenant_id"],
                collection_id=task_state["collection_id"],
                agent_ids=task_state["agent_ids"],
                document_name=task_state["document_name"],
                document_type=task_state["document_type"],
                rag_config=task_state["rag_config"],
                processing_mode=task_state["rag_config"].processing_mode
            )
            
            self._logger.info(
                f"Document chunked",
                extra={
                    "task_id": task_id,
                    "total_chunks": len(chunks)
                }
            )
            
            # Guardar chunks en estado
            task_state["chunks"] = chunks
            task_state["total_chunks"] = len(chunks)
            task_state["status"] = IngestionStatus.EMBEDDING
            
            # Enviar a embedding-service
            await self._send_to_embedding_service(task_id, chunks, task_state)
            
            return None
            
        except Exception as e:
            self._logger.error(f"Error processing extraction callback: {e}", exc_info=True)
            task_state["status"] = IngestionStatus.FAILED
            task_state["error"] = str(e)
            return None
    
    async def _handle_embedding_callback(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Maneja callback de embedding-service.
        
        Flujo:
        1. Recibir embeddings
        2. Almacenar en Qdrant
        3. Persistir metadata en Supabase
        4. Notificar completado
        """
        callback_data = action.data
        task_id = callback_data.get("task_id")
        
        task_state = self._tasks_state.get(task_id)
        if not task_state:
            self._logger.error(f"Task state not found for {task_id}")
            return None
        
        try:
            embeddings = callback_data.get("embeddings", [])
            
            self._logger.info(
                f"Received embeddings",
                extra={
                    "task_id": task_id,
                    "embeddings_count": len(embeddings)
                }
            )
            
            # Actualizar estado
            task_state["status"] = IngestionStatus.STORING
            
            # Asociar embeddings a chunks
            chunks = task_state.get("chunks", [])
            for i, chunk in enumerate(chunks):
                if i < len(embeddings):
                    chunk.embedding = embeddings[i]
            
            # TODO: Almacenar en Qdrant
            await self._store_in_qdrant(task_id, chunks, task_state)
            
            # TODO: Persistir metadata en Supabase
            await self._persist_metadata(task_id, task_state)
            
            # Completado
            task_state["status"] = IngestionStatus.COMPLETED
            task_state["completed_at"] = datetime.utcnow()
            
            self._logger.info(
                f"Ingestion completed",
                extra={
                    "task_id": task_id,
                    "document_id": task_state["document_id"],
                    "total_chunks": len(chunks)
                }
            )
            
            # Limpiar estado después de un tiempo
            # (o mantener para consultas de status)
            
            return {
                "task_id": task_id,
                "document_id": task_state["document_id"],
                "status": "completed",
                "total_chunks": len(chunks)
            }
            
        except Exception as e:
            self._logger.error(f"Error processing embedding callback: {e}", exc_info=True)
            task_state["status"] = IngestionStatus.FAILED
            task_state["error"] = str(e)
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
            action_type="embedding.batch.process",
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
        task_state: Dict[str, Any]
    ):
        """Almacena chunks en Qdrant."""
        # TODO: Implementar almacenamiento en Qdrant
        self._logger.info(
            f"Storing {len(chunks)} chunks in Qdrant",
            extra={"task_id": task_id}
        )
        pass
    
    async def _persist_metadata(
        self,
        task_id: str,
        task_state: Dict[str, Any]
    ):
        """Persiste metadata en Supabase."""
        # TODO: Implementar persistencia en Supabase
        self._logger.info(
            f"Persisting metadata",
            extra={"task_id": task_id}
        )
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
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene estado de una tarea."""
        task_state = self._tasks_state.get(task_id)
        if not task_state:
            return None
        
        return {
            "task_id": task_id,
            "document_id": task_state.get("document_id"),
            "status": task_state.get("status", IngestionStatus.PENDING).value,
            "total_chunks": task_state.get("total_chunks"),
            "error": task_state.get("error")
        }
