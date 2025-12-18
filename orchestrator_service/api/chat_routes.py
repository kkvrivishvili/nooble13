"""
Rutas API para chat público.
"""
import uuid
import logging
from typing import Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Request

from ..models import ChatInitRequest, ChatInitResponse, SessionType
from ..services.orchestration_service import OrchestrationService
from ..config.settings import OrchestratorSettings
from .dependencies import get_orchestration_service, get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/init", 
    response_model=ChatInitResponse,
    summary="🚀 Iniciar Sesión de Chat",
    description="""Crea una nueva sesión de chat público y retorna la información necesaria para conectarse.
    
    ### 📋 Proceso:
    1. **Validación**: Verifica agent_id público y obtiene el tenant del owner del agente
    2. **Creación**: Genera nueva sesión con metadata
    3. **Task ID**: Crea primer identificador de tarea
    4. **WebSocket URL**: Construye URL para conexión en tiempo real
    
    ### 🔗 Siguiente Paso:
    Usar la `websocket_url` retornada para conectarse vía WebSocket y comenzar el chat.
    """,
    responses={
        200: {
            "description": "Sesión creada exitosamente",
            "content": {
                "application/json": {
                    "example": {
                        "session_id": "123e4567-e89b-12d3-a456-426614174000",
                        "task_id": "task_abc123",
                        "websocket_url": "ws://localhost:8001/ws/chat/123e4567-e89b-12d3-a456-426614174000",
                        "agent_name": "Assistant"
                    }
                }
            }
        },
        500: {"description": "Error interno del servidor"}
    }
)
async def init_chat_session(
    request: ChatInitRequest,
    http_request: Request,
    orchestration_service: OrchestrationService = Depends(get_orchestration_service),
    settings: OrchestratorSettings = Depends(get_settings)
) -> ChatInitResponse:
    """Inicia una nueva sesión de chat público."""
    try:
        logger.info(
            f"Iniciando sesión de chat público para agente {request.agent_id}",
            extra={"agent_id": str(request.agent_id)}
        )

        # Obtener configuración del agente (valida que sea público)
        agent_config = await orchestration_service.config_handler.get_agent_info(request.agent_id)

        if not agent_config:
            raise HTTPException(
                status_code=404,
                detail="Agent not found or not public"
            )

        # Usar el owner del agente como tenant_id interno
        owner_tenant_id = agent_config.tenant_id

        # Generar un ID temporal para el visitante
        visitor_id = uuid.uuid4()

        # Crear sesión
        session = await orchestration_service.create_session(
            session_type=SessionType.CHAT,
            tenant_id=owner_tenant_id,  # Owner del agente
            agent_id=request.agent_id,
            user_id=None,  # Chat público sin usuario autenticado
            metadata={
                **request.metadata,
                "visitor_id": str(visitor_id),  # ID temporal del visitante
                "user_agent": http_request.headers.get("user-agent"),
                "origin": http_request.headers.get("origin"),
                "created_via": "public_api"
            }
        )
        
        # Crear primer task_id
        task_id = await orchestration_service.session_handler.create_task_id(
            session.session_id
        )
        
        # Construir URL de WebSocket
        ws_protocol = "wss" if http_request.url.scheme == "https" else "ws"
        websocket_url = f"{ws_protocol}://{http_request.url.hostname}"
        if http_request.url.port:
            websocket_url += f":{http_request.url.port}"
        websocket_url += f"/ws/chat/{session.session_id}"
        
        # Override si hay URL específica configurada
        if settings.websocket_base_url:
            websocket_url = f"{settings.websocket_base_url}/ws/chat/{session.session_id}"
        
        return ChatInitResponse(
            session_id=session.session_id,
            task_id=task_id,
            websocket_url=websocket_url,
            agent_name=agent_config.agent_name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error iniciando sesión de chat: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )


@router.get("/session/{session_id}/status")
async def get_session_status(
    session_id: uuid.UUID,
    orchestration_service: OrchestrationService = Depends(get_orchestration_service)
) -> Dict[str, Any]:
    """Obtiene el estado de una sesión de chat."""
    try:
        session = await orchestration_service.get_session(session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        if session.session_type != SessionType.CHAT:
            raise HTTPException(
                status_code=400,
                detail="La sesión no es de tipo chat"
            )
        
        return {
            "session_id": str(session.session_id),
            "session_type": session.session_type.value,
            "tenant_id": str(session.tenant_id),
            "agent_id": str(session.agent_id),
            "websocket_connected": session.websocket_connected,
            "total_tasks": session.total_tasks,
            "active_task_id": str(session.active_task_id) if session.active_task_id else None,
            "total_messages": session.total_messages,
            "created_at": session.created_at.isoformat(),
            "last_activity": session.last_activity.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo estado de sesión: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )


@router.post("/session/{session_id}/task")
async def create_new_task(
    session_id: uuid.UUID,
    orchestration_service: OrchestrationService = Depends(get_orchestration_service)
) -> Dict[str, Any]:
    """Crea una nueva tarea para una sesión existente."""
    try:
        session = await orchestration_service.get_session(session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        if session.session_type != SessionType.CHAT:
            raise HTTPException(
                status_code=400,
                detail="La sesión no es de tipo chat"
            )
        
        # Crear nueva tarea
        task_id = await orchestration_service.session_handler.create_task_id(session_id)
        
        return {
            "task_id": str(task_id),
            "session_id": str(session_id),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creando nueva tarea: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )


@router.delete("/session/{session_id}")
async def delete_chat_session(
    session_id: uuid.UUID,
    orchestration_service: OrchestrationService = Depends(get_orchestration_service)
) -> Dict[str, Any]:
    """Elimina una sesión de chat."""
    try:
        session = await orchestration_service.get_session(session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Sesión no encontrada"
            )
        
        if session.session_type != SessionType.CHAT:
            raise HTTPException(
                status_code=400,
                detail="La sesión no es de tipo chat"
            )
        
        # Eliminar sesión
        success = await orchestration_service.delete_session(session_id)
        
        if success:
            return {
                "message": "Sesión eliminada exitosamente",
                "session_id": str(session_id),
                "deleted_at": datetime.now(timezone.utc).isoformat()
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Error eliminando sesión"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error eliminando sesión: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor"
        )