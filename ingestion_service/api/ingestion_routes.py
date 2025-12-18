"""
Rutas API corregidas para ingestion.
"""
import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request, Body, Form

from ..models import (
    DocumentIngestionRequest,
    IngestionResponse,
    IngestionStatus,
    RAGIngestionConfig,
    DocumentType
)
from ..services.ingestion_service import IngestionService
from ..config.settings import IngestionSettings
from .dependencies import (
    verify_jwt_token,
    get_ingestion_service,
    get_settings
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest")
async def ingest_document(
    request: DocumentIngestionRequest,
    http_request: Request,
    user_auth: Dict[str, Any] = Depends(verify_jwt_token),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
) -> IngestionResponse:
    """
    Ingesta un documento con configuración RAG flexible.
    
    - RAG config viene en el request (opcional, tiene defaults)
    - collection_id opcional (se genera si no viene)
    - agent_ids opcional (lista vacía por defecto)
    - document_id siempre generado por el servicio
    """
    try:
        logger.info(
            "POST /ingest - user_id=%s tenant_id=%s doc_name=%s type=%s",
            user_auth.get("user_id"),
            user_auth.get("app_metadata", {}).get("tenant_id"),
            request.document_name,
            request.document_type.value
        )
        
        # Extraer tenant_id del JWT
        tenant_id = user_auth.get("app_metadata", {}).get("tenant_id")
        if not tenant_id:
            # Fallback: usar user_id como tenant_id temporalmente
            tenant_id = user_auth["user_id"]
            logger.warning(f"No tenant_id in JWT, using user_id: {tenant_id}")
        
        logger.info(
            f"Iniciando ingestion: collection={request.collection_id}, "
            f"agents={request.agent_ids}, tenant={tenant_id}"
        )
        
        # Procesar ingestion
        result = await ingestion_service.ingest_document(
            tenant_id=uuid.UUID(str(tenant_id)),
            user_id=uuid.UUID(str(user_auth["user_id"])),
            request=request,
            auth_token=user_auth.get("raw_token")
        )
        
        # Construir URL de WebSocket
        ws_protocol = "wss" if http_request.url.scheme == "https" else "ws"
        websocket_url = f"{ws_protocol}://{http_request.url.hostname}"
        if http_request.url.port:
            websocket_url += f":{http_request.url.port}"
        websocket_url += f"/ws/ingestion/{result['task_id']}"
        
        return IngestionResponse(
            task_id=uuid.UUID(result["task_id"]),
            document_id=uuid.UUID(result["document_id"]),
            collection_id=result["collection_id"],
            agent_ids=result["agent_ids"],
            status=IngestionStatus.PROCESSING,
            message=result["message"],
            websocket_url=websocket_url
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error en ingestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_and_ingest(
    http_request: Request,
    file: UploadFile = File(...),
    user_auth: Dict[str, Any] = Depends(verify_jwt_token),
    ingestion_service: IngestionService = Depends(get_ingestion_service),
    settings: IngestionSettings = Depends(get_settings),
    # Form fields opcionales
    collection_id: Optional[str] = Form(None),
    embedding_model: str = Form("text-embedding-3-small"),
    chunk_size: int = Form(512),
    chunk_overlap: int = Form(50),
    # agent_ids como campos repetidos (FastAPI lo convierte en lista)
    agent_ids: List[str] = Form(default=[])
) -> IngestionResponse:
    """
    Upload y procesa un archivo.
    
    Nota: agent_ids debe enviarse como campos repetidos en multipart:
    - agent_ids=id1
    - agent_ids=id2
    FastAPI automáticamente los convierte en lista.
    """
    try:
        logger.info(
            "POST /upload - user_id=%s tenant_id=%s filename=%s size=%s content_type=%s agent_ids=%s",
            user_auth.get("user_id"),
            user_auth.get("app_metadata", {}).get("tenant_id"),
            file.filename,
            file.size,
            file.content_type,
            agent_ids
        )
        
        # Validar tamaño
        if file.size and file.size > settings.max_file_size_mb * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max size: {settings.max_file_size_mb}MB"
            )
        
        # Validar tipo
        file_extension = file.filename.split('.')[-1].lower()
        if file_extension not in ['pdf', 'docx', 'txt', 'md', 'html']:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file_extension}"
            )
        
        # Normalizar extensión
        if file_extension == 'md':
            doc_type = DocumentType.MARKDOWN
        else:
            doc_type = DocumentType(file_extension)
        
        # Guardar archivo temporalmente
        temp_path = await ingestion_service.save_uploaded_file(file)
        
        # Crear RAG config
        from common.models.config_models import EmbeddingModel
        try:
            embedding_model_enum = EmbeddingModel(embedding_model)
        except ValueError:
            embedding_model_enum = EmbeddingModel.TEXT_EMBEDDING_3_SMALL
        
        rag_config = RAGIngestionConfig(
            embedding_model=embedding_model_enum,
            embedding_dimensions=1536,  # Default para text-embedding-3-small
            encoding_format="float",
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        
        # Crear request de ingestion
        request = DocumentIngestionRequest(
            document_name=file.filename,
            document_type=doc_type,
            file_path=str(temp_path),
            collection_id=collection_id,
            agent_ids=agent_ids or [],  # Ya es lista
            rag_config=rag_config,
            metadata={
                "file_size": file.size,
                "content_type": file.content_type
            }
        )
        
        # Delegar a ingest_document
        return await ingest_document(
            request=request,
            http_request=http_request,
            user_auth=user_auth,
            ingestion_service=ingestion_service
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/document/{document_id}")
async def delete_document(
    document_id: uuid.UUID,
    collection_id: str = Body(..., embed=True, description="Collection ID del documento"),
    user_auth: Dict[str, Any] = Depends(verify_jwt_token),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
) -> Dict[str, Any]:
    """
    Elimina un documento y sus chunks.
    Requiere collection_id para validación.
    """
    try:
        tenant_id = user_auth.get("app_metadata", {}).get("tenant_id")
        if not tenant_id:
            tenant_id = user_auth["user_id"]
        
        result = await ingestion_service.delete_document(
            tenant_id=uuid.UUID(str(tenant_id)),
            document_id=document_id,
            collection_id=collection_id,
            auth_token=user_auth.get("raw_token")
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error eliminando documento: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/document/{document_id}/agents")
async def update_document_agents(
    document_id: uuid.UUID,
    agent_ids: List[str] = Body(..., embed=True, description="Lista de agent IDs"),
    operation: str = Body("set", embed=True, description="Operación: set, add, remove"),
    user_auth: Dict[str, Any] = Depends(verify_jwt_token),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
) -> Dict[str, Any]:
    """
    Actualiza los agentes con acceso a un documento.
    
    Operaciones:
    - set: Reemplaza la lista completa
    - add: Agrega agentes a la lista existente
    - remove: Elimina agentes de la lista
    """
    try:
        if operation not in ["set", "add", "remove"]:
            raise HTTPException(
                status_code=400,
                detail="Operation must be: set, add, or remove"
            )
        
        tenant_id = user_auth.get("app_metadata", {}).get("tenant_id")
        if not tenant_id:
            tenant_id = user_auth["user_id"]
        
        result = await ingestion_service.update_document_agents(
            tenant_id=uuid.UUID(str(tenant_id)),
            document_id=document_id,
            agent_ids=agent_ids,
            operation=operation,
            auth_token=user_auth.get("raw_token")
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizando agentes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}")
async def get_ingestion_status(
    task_id: uuid.UUID,
    user_auth: Dict[str, Any] = Depends(verify_jwt_token),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
) -> Dict[str, Any]:
    """Obtiene el estado de una tarea de ingestion."""
    try:
        status = await ingestion_service.get_task_status(
            task_id, 
            uuid.UUID(str(user_auth["user_id"]))
        )
        
        if not status:
            raise HTTPException(status_code=404, detail="Task not found")
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo estado: {e}")
        raise HTTPException(status_code=500, detail=str(e))