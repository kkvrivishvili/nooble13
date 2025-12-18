"""
Protocolos y interfaces para WebSocket.
Define contratos que deben implementar los handlers específicos.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Callable, Awaitable
from fastapi import WebSocket
import uuid

from .models import WebSocketMessage, ConnectionInfo, WebSocketError


class WebSocketProtocol(ABC):
    """Protocolo base para handlers de WebSocket."""
    
    @abstractmethod
    async def on_connect(self, websocket: WebSocket, connection_id: str) -> bool:
        """
        Maneja nueva conexión WebSocket.
        
        Args:
            websocket: Instancia de WebSocket de FastAPI
            connection_id: ID único de la conexión
            
        Returns:
            bool: True si la conexión es aceptada, False si debe rechazarse
        """
        pass
    
    @abstractmethod
    async def on_disconnect(self, connection_id: str, close_code: Optional[int] = None) -> None:
        """
        Maneja desconexión WebSocket.
        
        Args:
            connection_id: ID de la conexión que se desconecta
            close_code: Código de cierre opcional
        """
        pass
    
    @abstractmethod
    async def on_message(self, connection_id: str, message: WebSocketMessage) -> None:
        """
        Maneja mensaje recibido por WebSocket.
        
        Args:
            connection_id: ID de la conexión que envía el mensaje
            message: Mensaje deserializado
        """
        pass
    
    @abstractmethod
    async def on_error(self, connection_id: str, error: Exception) -> None:
        """
        Maneja errores en la conexión WebSocket.
        
        Args:
            connection_id: ID de la conexión con error
            error: Excepción ocurrida
        """
        pass


class AuthenticationProtocol(ABC):
    """Protocolo para autenticación en WebSocket."""
    
    @abstractmethod
    async def authenticate_connection(self, websocket: WebSocket, headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Autentica una conexión WebSocket.
        
        Args:
            websocket: Instancia de WebSocket
            headers: Headers de la conexión
            
        Returns:
            Dict con información del usuario autenticado o None si falla
        """
        pass
    
    @abstractmethod
    async def validate_message_permissions(self, connection_info: ConnectionInfo, message: WebSocketMessage) -> bool:
        """
        Valida permisos para un mensaje específico.
        
        Args:
            connection_info: Información de la conexión
            message: Mensaje a validar
            
        Returns:
            bool: True si el mensaje está permitido
        """
        pass


class MessageRoutingProtocol(ABC):
    """Protocolo para enrutamiento de mensajes."""
    
    @abstractmethod
    async def route_message(self, connection_id: str, message: WebSocketMessage) -> None:
        """
        Enruta un mensaje al handler apropiado.
        
        Args:
            connection_id: ID de la conexión origen
            message: Mensaje a enrutar
        """
        pass
    
    @abstractmethod
    async def broadcast_message(self, message: WebSocketMessage, filter_fn: Optional[Callable[[ConnectionInfo], bool]] = None) -> None:
        """
        Envía un mensaje a múltiples conexiones.
        
        Args:
            message: Mensaje a enviar
            filter_fn: Función opcional para filtrar destinatarios
        """
        pass


class ConnectionManagerProtocol(ABC):
    """Protocolo para gestión de conexiones."""
    
    @abstractmethod
    async def add_connection(self, connection_id: str, websocket: WebSocket, connection_info: ConnectionInfo) -> None:
        """Agrega una nueva conexión."""
        pass
    
    @abstractmethod
    async def remove_connection(self, connection_id: str) -> None:
        """Remueve una conexión."""
        pass
    
    @abstractmethod
    async def get_connection(self, connection_id: str) -> Optional[tuple[WebSocket, ConnectionInfo]]:
        """Obtiene información de una conexión."""
        pass
    
    @abstractmethod
    async def get_connections_by_filter(self, filter_fn: Callable[[ConnectionInfo], bool]) -> Dict[str, tuple[WebSocket, ConnectionInfo]]:
        """Obtiene conexiones que cumplen un filtro."""
        pass
    
    @abstractmethod
    async def update_connection_activity(self, connection_id: str) -> None:
        """Actualiza la última actividad de una conexión."""
        pass


class RateLimitProtocol(ABC):
    """Protocolo para rate limiting en WebSocket."""
    
    @abstractmethod
    async def check_rate_limit(self, connection_id: str, message_type: str) -> bool:
        """
        Verifica si una conexión puede enviar un mensaje.
        
        Args:
            connection_id: ID de la conexión
            message_type: Tipo de mensaje
            
        Returns:
            bool: True si está dentro del límite
        """
        pass
    
    @abstractmethod
    async def record_message(self, connection_id: str, message_type: str) -> None:
        """
        Registra un mensaje enviado para rate limiting.
        
        Args:
            connection_id: ID de la conexión
            message_type: Tipo de mensaje
        """
        pass


# Type aliases para callbacks
MessageHandler = Callable[[str, WebSocketMessage], Awaitable[None]]
ErrorHandler = Callable[[str, Exception], Awaitable[None]]
ConnectionHandler = Callable[[str, WebSocket], Awaitable[bool]]
DisconnectionHandler = Callable[[str, Optional[int]], Awaitable[None]]
