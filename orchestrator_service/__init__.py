"""
Orchestrator Service - Punto único de entrada para chat e ingestion.

Este servicio unifica:
- Chat público (sin autenticación)
- Ingestion privada (con JWT Supabase)
- WebSocket unificado con separación de flujos
- Cache inteligente de configuraciones
- Coordinación con otros microservicios
"""

__version__ = "2.0.0"
__service_name__ = "orchestrator-service"
