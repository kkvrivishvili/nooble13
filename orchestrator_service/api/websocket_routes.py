"""
Rutas WebSocket para chat.
"""
import uuid
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from ..websocket.orchestrator_websocket_manager import OrchestratorWebSocketManager
from ..services.orchestration_service import OrchestrationService
from .dependencies import get_websocket_manager, get_orchestration_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/chat/{session_id}")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    session_id: uuid.UUID,
    websocket_manager: OrchestratorWebSocketManager = Depends(get_websocket_manager),
    orchestration_service: OrchestrationService = Depends(get_orchestration_service)
):
    """
    WebSocket endpoint para chat público.
    
    Args:
        websocket: WebSocket de FastAPI
        session_id: ID de la sesión de chat
    """
    try:
        await websocket_manager.handle_websocket(websocket, session_id)
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket desconectado para sesión: {session_id}")
    except Exception as e:
        logger.error(f"Error en WebSocket endpoint: {e}")
        try:
            await websocket.close(code=4000, reason="Internal error")
        except:
            pass