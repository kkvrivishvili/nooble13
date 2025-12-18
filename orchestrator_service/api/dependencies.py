"""Dependencias para las rutas API."""
from typing import Optional
from fastapi import HTTPException

from ..services.orchestration_service import OrchestrationService
from ..handlers import ChatHandler, CallbackHandler
from ..websocket.orchestrator_websocket_manager import OrchestratorWebSocketManager
from ..config.settings import OrchestratorSettings

# Instancias globales
_orchestration_service: Optional[OrchestrationService] = None
_chat_handler: Optional[ChatHandler] = None
_callback_handler: Optional[CallbackHandler] = None
_websocket_manager: Optional[OrchestratorWebSocketManager] = None
_settings: Optional[OrchestratorSettings] = None


def set_dependencies(
    orchestration_service: OrchestrationService,
    chat_handler: ChatHandler,
    callback_handler: CallbackHandler,
    websocket_manager: OrchestratorWebSocketManager,
    settings: OrchestratorSettings
):
    """Configura las dependencias globales."""
    global _orchestration_service, _chat_handler, _callback_handler
    global _websocket_manager, _settings
    
    _orchestration_service = orchestration_service
    _chat_handler = chat_handler
    _callback_handler = callback_handler
    _websocket_manager = websocket_manager
    _settings = settings
    
    # Configurar handlers en orchestration service
    orchestration_service.set_handlers(chat_handler, callback_handler)


def get_orchestration_service() -> OrchestrationService:
    """Obtiene el servicio de orquestación."""
    if not _orchestration_service:
        raise HTTPException(
            status_code=500,
            detail="OrchestrationService not initialized"
        )
    return _orchestration_service


def get_chat_handler() -> ChatHandler:
    """Obtiene el chat handler."""
    if not _chat_handler:
        raise HTTPException(
            status_code=500,
            detail="ChatHandler not initialized"
        )
    return _chat_handler


def get_callback_handler() -> CallbackHandler:
    """Obtiene el callback handler."""
    if not _callback_handler:
        raise HTTPException(
            status_code=500,
            detail="CallbackHandler not initialized"
        )
    return _callback_handler


def get_websocket_manager() -> OrchestratorWebSocketManager:
    """Obtiene el WebSocket manager."""
    if not _websocket_manager:
        raise HTTPException(
            status_code=500,
            detail="WebSocketManager not initialized"
        )
    return _websocket_manager


def get_settings() -> OrchestratorSettings:
    """Obtiene la configuración."""
    if not _settings:
        raise HTTPException(
            status_code=500,
            detail="Settings not initialized"
        )
    return _settings