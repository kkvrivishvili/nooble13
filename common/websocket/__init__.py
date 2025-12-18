"""
Common WebSocket module for Nooble8.
Provides reusable WebSocket infrastructure for all services.
"""

from .models import (
    WebSocketMessage,
    ConnectionInfo,
    WebSocketError,
    WebSocketMessageType
)

from .protocols import (
    WebSocketProtocol,
    AuthenticationProtocol,
    MessageRoutingProtocol,
    ConnectionManagerProtocol,
    RateLimitProtocol,
    MessageHandler,
    ErrorHandler,
    ConnectionHandler,
    DisconnectionHandler
)

from .base_websocket_manager import BaseWebSocketManager

__all__ = [
    # Models
    "WebSocketMessage",
    "ConnectionInfo",
    "WebSocketError",
    "WebSocketMessageType",
    
    # Protocols
    "WebSocketProtocol",
    "AuthenticationProtocol",
    "MessageRoutingProtocol", 
    "ConnectionManagerProtocol",
    "RateLimitProtocol",
    "MessageHandler",
    "ErrorHandler",
    "ConnectionHandler",
    "DisconnectionHandler",
    
    # Manager
    "BaseWebSocketManager"
]
