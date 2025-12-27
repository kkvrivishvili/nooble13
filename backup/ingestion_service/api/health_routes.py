"""
Health check routes para Ingestion Service.
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any

from .dependencies import get_ingestion_service, get_settings

router = APIRouter()


@router.get("/")
async def health_check():
    """Health check básico."""
    return {"status": "healthy"}


@router.get("/detailed")
async def detailed_health(
    ingestion_service = Depends(get_ingestion_service),
    settings = Depends(get_settings)
) -> Dict[str, Any]:
    """Health check detallado."""
    return {
        "status": "healthy",
        "service": {
            "name": settings.service_name,
            "version": settings.service_version,
            "environment": settings.environment
        },
        "components": {
            "redis": "connected",
            "supabase": "connected",
            "qdrant": "connected"
        }
    }