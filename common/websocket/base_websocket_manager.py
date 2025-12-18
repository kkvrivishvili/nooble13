"""
Manager base para WebSocket reutilizable.
Implementa la lógica común de gestión de conexiones y mensajes.
"""
import asyncio
import json
import logging
import uuid
from typing import Dict, Optional, Callable, Awaitable, List, Any
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .models import (
    WebSocketMessage, ConnectionInfo, WebSocketError, 
    WebSocketMessageType, AnyWebSocketMessage
)
from .protocols import (
    WebSocketProtocol, AuthenticationProtocol, MessageRoutingProtocol,
    ConnectionManagerProtocol, RateLimitProtocol
)


class BaseWebSocketManager(ConnectionManagerProtocol):
    """
    Manager base para WebSocket que implementa funcionalidad común.
    Reutilizable entre diferentes servicios (chat, ingestion, etc.).
    """
    
    def __init__(
        self,
        namespace: str = "websocket",
        logger: Optional[logging.Logger] = None
    ):
        """
        Inicializa el manager base.
        
        Args:
            namespace: Namespace para logging y identificación
            logger: Logger opcional
            auth_protocol: Protocolo de autenticación opcional
            rate_limit_protocol: Protocolo de rate limiting opcional
        """
        self.namespace = namespace
        self.logger = logger or logging.getLogger(f"websocket.{namespace}")
        
        # Optional protocols (can be set by subclasses/composition)
        self.auth_protocol = None
        self.rate_limit_protocol = None
        
        # Storage for active connections
        self._connections: Dict[str, tuple[WebSocket, ConnectionInfo]] = {}
        self._connection_lock = asyncio.Lock()
        
        # Message handlers
        self._message_handlers: Dict[WebSocketMessageType, List[Callable]] = {}
        self._error_handlers: List[Callable] = []
        
        self.logger.info(f"WebSocket manager initialized for namespace: {namespace}")
    
    # ConnectionManagerProtocol implementation
    async def add_connection(self, connection_id: str, websocket: WebSocket, connection_info: ConnectionInfo) -> None:
        """Agrega una nueva conexión."""
        async with self._connection_lock:
            self._connections[connection_id] = (websocket, connection_info)
            self.logger.info(f"Connection added: {connection_id} (type: {connection_info.connection_type})")
    
    async def remove_connection(self, connection_id: str) -> None:
        """Remueve una conexión."""
        async with self._connection_lock:
            if connection_id in self._connections:
                del self._connections[connection_id]
                self.logger.info(f"Connection removed: {connection_id}")
    
    async def get_connection(self, connection_id: str) -> Optional[tuple[WebSocket, ConnectionInfo]]:
        """Obtiene información de una conexión."""
        return self._connections.get(connection_id)
    
    async def get_connections_by_filter(self, filter_fn: Callable[[ConnectionInfo], bool]) -> Dict[str, tuple[WebSocket, ConnectionInfo]]:
        """Obtiene conexiones que cumplen un filtro."""
        return {
            conn_id: (ws, info) 
            for conn_id, (ws, info) in self._connections.items() 
            if filter_fn(info)
        }
    
    async def update_connection_activity(self, connection_id: str) -> None:
        """Actualiza la última actividad de una conexión."""
        if connection_id in self._connections:
            websocket, info = self._connections[connection_id]
            info.last_activity = datetime.now(timezone.utc)
            self._connections[connection_id] = (websocket, info)
    
    # Connection management
    async def connect(self, websocket: WebSocket, connection_type: str, **kwargs) -> str:
        """
        Maneja nueva conexión WebSocket.
        
        Args:
            websocket: Instancia de WebSocket de FastAPI
            connection_type: Tipo de conexión ("chat" o "ingestion")
            **kwargs: Parámetros adicionales para la conexión
            
        Returns:
            str: ID de la conexión creada
            
        Raises:
            Exception: Si la conexión es rechazada
        """
        try:
            await websocket.accept()
            connection_id = str(uuid.uuid4())
            
            # Create connection info
            connection_info = ConnectionInfo(
                connection_id=connection_id,
                connection_type=connection_type,
                **kwargs
            )
            
            # Authenticate if protocol is available
            if self.auth_protocol and connection_type == "ingestion":
                headers = dict(websocket.headers)
                auth_info = await self.auth_protocol.authenticate_connection(websocket, headers)
                if not auth_info:
                    await websocket.close(code=4001, reason="Authentication failed")
                    raise Exception("Authentication failed")
                
                connection_info.is_authenticated = True
                connection_info.user_id = auth_info.get("user_id")
                connection_info.tenant_id = auth_info.get("tenant_id")
            
            # Add connection
            await self.add_connection(connection_id, websocket, connection_info)
            
            # Send connection acknowledgment
            ack_message = WebSocketMessage(
                message_type=WebSocketMessageType.CONNECTION_ACK,
                data={"connection_id": connection_id, "status": "connected"}
            )
            await self.send_message(connection_id, ack_message)
            
            self.logger.info(f"WebSocket connected: {connection_id} (type: {connection_type})")
            return connection_id
            
        except Exception as e:
            self.logger.error(f"Connection failed: {str(e)}")
            raise
    
    async def disconnect(self, connection_id: str, close_code: Optional[int] = None) -> None:
        """Maneja desconexión WebSocket."""
        try:
            connection = await self.get_connection(connection_id)
            if connection:
                websocket, info = connection
                if not websocket.client_state.DISCONNECTED:
                    await websocket.close(code=close_code or 1000)
            
            await self.remove_connection(connection_id)
            self.logger.info(f"WebSocket disconnected: {connection_id}")
            
        except Exception as e:
            self.logger.error(f"Disconnect error for {connection_id}: {str(e)}")
    
    async def handle_websocket(self, websocket: WebSocket, connection_type: str, **kwargs) -> None:
        """
        Handler principal para conexiones WebSocket.
        Maneja el ciclo de vida completo de la conexión.
        """
        connection_id = None
        try:
            # Establish connection
            connection_id = await self.connect(websocket, connection_type, **kwargs)
            
            # Message loop
            while True:
                try:
                    # Receive message
                    data = await websocket.receive_text()
                    
                    # Update activity
                    await self.update_connection_activity(connection_id)
                    
                    # Parse message
                    try:
                        message_data = json.loads(data)
                        message = WebSocketMessage(**message_data)
                    except (json.JSONDecodeError, ValidationError) as e:
                        await self.send_error(connection_id, "validation", f"Invalid message format: {str(e)}")
                        continue
                    
                    # Rate limiting
                    if self.rate_limit_protocol:
                        if not await self.rate_limit_protocol.check_rate_limit(connection_id, message.message_type.value):
                            await self.send_error(connection_id, "rate_limit", "Rate limit exceeded")
                            continue
                        await self.rate_limit_protocol.record_message(connection_id, message.message_type.value)
                    
                    # Process message
                    await self.process_message(connection_id, message)
                    
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    self.logger.error(f"Message processing error for {connection_id}: {str(e)}")
                    await self.send_error(connection_id, "internal", "Internal server error")
        
        except Exception as e:
            self.logger.error(f"WebSocket handler error: {str(e)}")
        
        finally:
            if connection_id:
                await self.disconnect(connection_id)
    
    async def process_message(self, connection_id: str, message: WebSocketMessage) -> None:
        """
        Procesa un mensaje recibido.
        Puede ser sobrescrito por clases derivadas.
        """
        try:
            # Call registered handlers
            handlers = self._message_handlers.get(message.message_type, [])
            for handler in handlers:
                await handler(connection_id, message)
                
        except Exception as e:
            self.logger.error(f"Message handler error: {str(e)}")
            await self.send_error(connection_id, "internal", "Message processing failed")
    
    async def send_message(self, connection_id: str, message: WebSocketMessage) -> bool:
        """
        Envía un mensaje a una conexión específica.
        
        Returns:
            bool: True si el mensaje fue enviado exitosamente
        """
        try:
            connection = await self.get_connection(connection_id)
            if not connection:
                self.logger.warning(f"Connection not found: {connection_id}")
                return False
            
            websocket, _ = connection
            message_dict = message.model_dump(mode='json')
            await websocket.send_text(json.dumps(message_dict))
            return True
            
        except Exception as e:
            self.logger.error(f"Send message error for {connection_id}: {str(e)}")
            return False
    
    async def send_error(self, connection_id: str, error_type: str, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        """Envía un mensaje de error a una conexión."""
        error_message = WebSocketMessage(
            message_type=WebSocketMessageType.ERROR,
            data={
                "error": {
                    "error_code": f"{self.namespace}_{error_type}",
                    "error_message": message,
                    "error_type": error_type,
                    "details": details or {}
                }
            }
        )
        await self.send_message(connection_id, error_message)
    
    async def broadcast_message(self, message: WebSocketMessage, filter_fn: Optional[Callable[[ConnectionInfo], bool]] = None) -> int:
        """
        Envía un mensaje a múltiples conexiones.
        
        Returns:
            int: Número de conexiones que recibieron el mensaje
        """
        if filter_fn:
            connections = await self.get_connections_by_filter(filter_fn)
        else:
            connections = self._connections
        
        sent_count = 0
        for connection_id in connections:
            if await self.send_message(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    # Handler registration
    def register_message_handler(self, message_type: WebSocketMessageType, handler: Callable) -> None:
        """Registra un handler para un tipo de mensaje específico."""
        if message_type not in self._message_handlers:
            self._message_handlers[message_type] = []
        self._message_handlers[message_type].append(handler)
    
    def register_error_handler(self, handler: Callable) -> None:
        """Registra un handler para errores."""
        self._error_handlers.append(handler)
    
    # Connection statistics
    async def get_connection_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas de conexiones."""
        total_connections = len(self._connections)
        chat_connections = len([1 for _, (_, info) in self._connections.items() if info.connection_type == "chat"])
        ingestion_connections = len([1 for _, (_, info) in self._connections.items() if info.connection_type == "ingestion"])
        authenticated_connections = len([1 for _, (_, info) in self._connections.items() if info.is_authenticated])
        
        return {
            "namespace": self.namespace,
            "total_connections": total_connections,
            "chat_connections": chat_connections,
            "ingestion_connections": ingestion_connections,
            "authenticated_connections": authenticated_connections,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
