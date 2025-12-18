"""
WebSocket Manager para notificaciones de progreso de ingestion.
"""
import json
import logging
import uuid
from typing import Optional, Dict, Any, List

from fastapi import WebSocket, WebSocketDisconnect, Query
from common.websocket.base_websocket_manager import BaseWebSocketManager
from common.websocket.models import WebSocketMessage, ConnectionInfo

from ..config.settings import IngestionSettings


class IngestionWebSocketManager(BaseWebSocketManager):
    """
    WebSocket Manager para ingestion progress.
    Requiere autenticación JWT.
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        supabase_client
    ):
        super().__init__(
            namespace="ingestion",
            logger=logging.getLogger("ingestion.websocket")
        )
        
        self.settings = app_settings
        self.supabase_client = supabase_client
        
        # Mapeo task_id -> connection_ids
        self._task_connections: Dict[uuid.UUID, List[str]] = {}
    
    async def handle_websocket(
        self,
        websocket: WebSocket,
        task_id: uuid.UUID,
        token: str = Query(...)
    ):
        """
        Handler para WebSocket de progreso de ingestion.
        Requiere token JWT válido.
        """
        connection_id = None
        
        try:
            # Verificar JWT
            user_info = await self.supabase_client.verify_jwt_token(token)
            if not user_info:
                await websocket.close(code=4001, reason="Invalid token")
                return
            
            # Aceptar conexión
            await websocket.accept()
            connection_id = str(uuid.uuid4())
            
            # Registrar conexión
            await self.add_connection(
                connection_id=connection_id,
                websocket=websocket,
                connection_info=ConnectionInfo(
                    connection_id=connection_id,
                    connection_type="ingestion",
                    user_id=user_info.id,
                    is_authenticated=True,
                    session_id=None,
                    agent_id=None
                )
            )
            
            # Mapear task_id a connection
            if task_id not in self._task_connections:
                self._task_connections[task_id] = []
            self._task_connections[task_id].append(connection_id)
            
            self.logger.info(f"WebSocket conectado para task {task_id}")
            
            # Mantener conexión viva
            while True:
                try:
                    data = await websocket.receive_text()
                    # Manejar ping/pong
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": message.get("timestamp")
                        }))
                except WebSocketDisconnect:
                    break
                    
        except Exception as e:
            self.logger.error(f"Error en WebSocket: {e}")
        finally:
            if connection_id:
                # Limpiar mapeos
                if task_id in self._task_connections:
                    self._task_connections[task_id].remove(connection_id)
                    if not self._task_connections[task_id]:
                        del self._task_connections[task_id]
                
                await self.remove_connection(connection_id)
    
    async def send_progress_update(
        self,
        task_id: uuid.UUID,
        status: str,
        message: str,
        percentage: float,
        total_chunks: Optional[int] = None,
        processed_chunks: Optional[int] = None,
        error: Optional[str] = None
    ):
        """Envía actualización de progreso a conexiones suscritas."""
        connections = self._task_connections.get(task_id, [])
        
        if not connections:
            return
        
        progress_message = WebSocketMessage(
            message_type="ingestion_progress",
            data={
                "task_id": str(task_id),
                "status": status,
                "message": message,
                "percentage": percentage,
                "total_chunks": total_chunks,
                "processed_chunks": processed_chunks,
                "error": error
            }
        )
        
        for connection_id in connections[:]:  # Copia para evitar modificación durante iteración
            success = await self.send_message(connection_id, progress_message)
            if not success:
                # Conexión cerrada, limpiar
                connections.remove(connection_id)