"""
WebSocket routes para progreso de ingestion.
"""
import uuid
from fastapi import APIRouter, WebSocket, Query, Depends

from .dependencies import get_websocket_manager

router = APIRouter()


@router.websocket("/ws/ingestion/{task_id}")
async def websocket_ingestion_progress(
    websocket: WebSocket,
    task_id: uuid.UUID,
    token: str = Query(..., description="JWT token"),
    websocket_manager = Depends(get_websocket_manager)
):
    """WebSocket para seguimiento de progreso de ingestion."""
    await websocket_manager.handle_websocket(
        websocket=websocket,
        task_id=task_id,
        token=token
    )