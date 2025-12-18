"""
Rutas de health check y métricas.
"""
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends

from ..services.orchestration_service import OrchestrationService
from ..config.settings import OrchestratorSettings
from .dependencies import get_orchestration_service, get_settings, get_websocket_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/",
    summary="🏥 Health Check Básico",
    description="""Endpoint simple para verificar que el servicio está funcionando.
    
    ### ✅ Uso:
    - **Monitoreo básico**: Para load balancers y sistemas de monitoreo
    - **Verificación rápida**: Respuesta inmediata sin verificaciones complejas
    - **Status simple**: Solo indica si el servicio responde
    """,
    responses={
        200: {
            "description": "Servicio funcionando correctamente",
            "content": {
                "application/json": {
                    "example": {"status": "healthy"}
                }
            }
        }
    }
)
async def health_check():
    """Health check básico."""
    return {"status": "healthy"}


@router.get("/detailed")
async def detailed_health_check(
    orchestration_service: OrchestrationService = Depends(get_orchestration_service),
    websocket_manager = Depends(get_websocket_manager),
    settings: OrchestratorSettings = Depends(get_settings)
) -> Dict[str, Any]:
    """Health check detallado con estado de componentes."""
    try:
        # Verificar servicio principal
        service_health = await orchestration_service.health_check()
        
        # Verificar WebSocket manager
        ws_stats = await websocket_manager.get_connection_stats()
        
        # Verificar sesiones activas
        active_sessions = await orchestration_service.list_active_sessions()
        
        # Estado general
        overall_status = "healthy"
        if service_health.get("status") != "healthy":
            overall_status = "degraded"
        
        return {
            "status": overall_status,
            "service": service_health,
            "websocket": {
                "status": "healthy",
                "stats": ws_stats
            },
            "sessions": {
                "active": len(active_sessions),
                "by_type": {
                    "chat": len([s for s in active_sessions if s.session_type.value == "chat"])
                }
            },
            "config": {
                "service_name": settings.service_name,
                "version": settings.service_version,
                "environment": settings.environment
            }
        }
        
    except Exception as e:
        logger.error(f"Error en health check: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/metrics")
async def get_metrics(
    orchestration_service: OrchestrationService = Depends(get_orchestration_service),
    websocket_manager = Depends(get_websocket_manager)
) -> Dict[str, Any]:
    """Obtiene métricas del servicio."""
    try:
        # Obtener sesiones activas
        active_sessions = await orchestration_service.list_active_sessions()
        
        # Estadísticas de WebSocket
        ws_stats = await websocket_manager.get_connection_stats()
        
        # Calcular métricas
        metrics = {
            "sessions": {
                "total_active": len(active_sessions),
                "chat": len([s for s in active_sessions if s.session_type.value == "chat"]),
                "with_websocket": len([s for s in active_sessions if s.websocket_connected])
            },
            "websocket": ws_stats,
            "tasks": {
                "active": len([s for s in active_sessions if s.active_task_id is not None])
            }
        }
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error obteniendo métricas: {e}")
        return {"error": str(e)}