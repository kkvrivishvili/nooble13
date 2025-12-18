"""
Protocolo de autenticación para WebSocket usando Supabase.
Implementa AuthenticationProtocol para uso en BaseWebSocketManager.
"""
import logging
from typing import Optional, Dict, Any
from fastapi import WebSocket

from ..websocket.protocols import AuthenticationProtocol
from ..websocket.models import ConnectionInfo, WebSocketMessage
from .client import SupabaseClient
from .types import SupabaseAuthError


class SupabaseWebSocketAuth(AuthenticationProtocol):
    """
    Implementación de autenticación WebSocket usando Supabase.
    Verifica tokens JWT y valida permisos.
    """
    
    def __init__(self, supabase_client: SupabaseClient, logger: Optional[logging.Logger] = None):
        """
        Inicializa el protocolo de autenticación.
        
        Args:
            supabase_client: Cliente de Supabase para verificación
            logger: Logger opcional
        """
        self.supabase = supabase_client
        self.logger = logger or logging.getLogger("websocket.auth")
    
    async def authenticate_connection(self, websocket: WebSocket, headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Autentica una conexión WebSocket usando JWT de Supabase.
        
        Args:
            websocket: Instancia de WebSocket
            headers: Headers de la conexión
            
        Returns:
            Dict con información del usuario autenticado o None si falla
        """
        try:
            # Extract JWT token from headers
            auth_header = headers.get("authorization") or headers.get("Authorization")
            if not auth_header:
                self.logger.warning("No authorization header found")
                return None
            
            # Parse Bearer token
            if not auth_header.startswith("Bearer "):
                self.logger.warning("Invalid authorization header format")
                return None
            
            token = auth_header[7:]  # Remove "Bearer " prefix
            
            # Verify JWT with Supabase
            user_info = await self.supabase.verify_jwt_token(token)
            if not user_info:
                self.logger.warning("JWT verification failed")
                return None
            
            # Return user information
            auth_info = {
                "user_id": user_info.id,
                "email": user_info.email,
                "username": user_info.username,
                "full_name": user_info.full_name,
                "user_metadata": user_info.user_metadata,
                "app_metadata": user_info.app_metadata
            }
            
            self.logger.info(f"WebSocket authentication successful for user {user_info.id}")
            return auth_info
            
        except Exception as e:
            self.logger.error(f"Authentication error: {str(e)}")
            return None
    
    async def validate_message_permissions(self, connection_info: ConnectionInfo, message: WebSocketMessage) -> bool:
        """
        Valida permisos para un mensaje específico.
        
        Args:
            connection_info: Información de la conexión
            message: Mensaje a validar
            
        Returns:
            bool: True si el mensaje está permitido
        """
        try:
            # For ingestion connections, user must be authenticated
            if connection_info.connection_type == "ingestion":
                if not connection_info.is_authenticated or not connection_info.user_id:
                    self.logger.warning(f"Unauthenticated ingestion attempt from {connection_info.connection_id}")
                    return False
                
                # Check tenant membership if tenant_id is specified
                if message.tenant_id and connection_info.tenant_id:
                    if message.tenant_id != connection_info.tenant_id:
                        self.logger.warning(f"Tenant mismatch: message={message.tenant_id}, connection={connection_info.tenant_id}")
                        return False
                
                # Additional validation for ingestion messages
                if hasattr(message, 'task_id') and message.task_id:
                    # Validate that user can perform ingestion for this tenant
                    if connection_info.tenant_id and connection_info.user_id:
                        is_member = await self.supabase.check_tenant_membership(
                            str(connection_info.user_id),
                            str(connection_info.tenant_id)
                        )
                        if not is_member:
                            self.logger.warning(f"User {connection_info.user_id} not member of tenant {connection_info.tenant_id}")
                            return False
            
            # For chat connections, no special permissions needed (public)
            elif connection_info.connection_type == "chat":
                # Chat is public, but we can add rate limiting or other validations here
                pass
            
            return True
            
        except Exception as e:
            self.logger.error(f"Permission validation error: {str(e)}")
            return False
    
    async def extract_tenant_from_token(self, token: str) -> Optional[str]:
        """
        Extrae el tenant_id del token JWT si está disponible.
        
        Args:
            token: Token JWT
            
        Returns:
            str: tenant_id o None si no está disponible
        """
        try:
            user_info = await self.supabase.verify_jwt_token(token)
            if not user_info:
                return None
            
            # Check if tenant_id is in app_metadata
            tenant_id = user_info.app_metadata.get("tenant_id")
            if tenant_id:
                return str(tenant_id)
            
            # If not in metadata, we might need to query the user_tenants table
            # For now, return None and let the application handle tenant selection
            return None
            
        except Exception as e:
            self.logger.error(f"Error extracting tenant from token: {str(e)}")
            return None


class PublicWebSocketAuth(AuthenticationProtocol):
    """
    Protocolo de autenticación para conexiones públicas (chat).
    No requiere autenticación pero puede implementar rate limiting.
    """
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        """
        Inicializa el protocolo de autenticación pública.
        
        Args:
            logger: Logger opcional
        """
        self.logger = logger or logging.getLogger("websocket.public_auth")
    
    async def authenticate_connection(self, websocket: WebSocket, headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Para conexiones públicas, no se requiere autenticación.
        
        Args:
            websocket: Instancia de WebSocket
            headers: Headers de la conexión
            
        Returns:
            Dict vacío indicando conexión pública exitosa
        """
        # Public connections don't require authentication
        # But we can extract any optional information from headers
        
        user_agent = headers.get("user-agent", "unknown")
        origin = headers.get("origin", "unknown")
        
        self.logger.debug(f"Public WebSocket connection from {origin} with {user_agent}")
        
        return {
            "is_public": True,
            "user_agent": user_agent,
            "origin": origin
        }
    
    async def validate_message_permissions(self, connection_info: ConnectionInfo, message: WebSocketMessage) -> bool:
        """
        Valida permisos para mensajes públicos.
        
        Args:
            connection_info: Información de la conexión
            message: Mensaje a validar
            
        Returns:
            bool: True si el mensaje está permitido
        """
        # For public chat, we allow most messages but can add restrictions
        
        # Ensure it's a chat connection
        if connection_info.connection_type != "chat":
            self.logger.warning(f"Non-chat message on public connection: {connection_info.connection_id}")
            return False
        
        # Validate that required fields are present for chat
        if hasattr(message, 'agent_id') and not message.agent_id:
            self.logger.warning("Chat message missing agent_id")
            return False
        
        if hasattr(message, 'tenant_id') and not message.tenant_id:
            self.logger.warning("Chat message missing tenant_id")
            return False
        
        return True