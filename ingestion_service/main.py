"""
Punto de entrada principal para Ingestion Service.

Este servicio ahora coordina:
1. Worker principal para requests de ingestion
2. Worker para callbacks de extraction-service
3. Worker para callbacks de embedding-service
4. API HTTP para uploads y status
"""

import asyncio
import logging
import signal
import sys
from typing import List, Optional
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from qdrant_client import AsyncQdrantClient

from common.clients.redis.redis_manager import RedisManager
from common.utils.logging import init_logging
from common.clients.base_redis_client import BaseRedisClient
from common.supabase.client import SupabaseClient

from .config.settings import IngestionSettings
from .services.ingestion_service import IngestionService
from .clients.embedding_client import EmbeddingClient
from .websocket.ingestion_websocket_manager import IngestionWebSocketManager
from .workers.ingestion_worker import IngestionWorker
from .workers.extraction_callback_worker import ExtractionCallbackWorker
from .workers.embedding_callback_worker import EmbeddingCallbackWorker
from .api import ingestion_router, websocket_router, health_router
from .api.dependencies import set_dependencies

# Configuración global
settings = IngestionSettings()
init_logging(service_name=settings.service_name, log_level=settings.log_level)
logger = logging.getLogger(__name__)

# Variables globales
redis_manager: Optional[RedisManager] = None
ingestion_service: Optional[IngestionService] = None
websocket_manager: Optional[IngestionWebSocketManager] = None
qdrant_client: Optional[AsyncQdrantClient] = None
workers: List = []
worker_tasks: List[asyncio.Task] = []
shutdown_event = asyncio.Event()


async def startup():
    global redis_manager, ingestion_service, websocket_manager, qdrant_client, workers, worker_tasks
    
    logger.info(f"--- [STARTUP] Initializing {settings.service_name} v{settings.service_version} ---")
    
    try:
        # 1. Inicializar Redis
        logger.info("[STARTUP] Connecting to Redis...")
        redis_manager = RedisManager(settings)
        redis_client = await redis_manager.get_client()
        
        # 2. Crear BaseRedisClient
        base_redis_client = BaseRedisClient(
            service_name=settings.service_name,
            redis_client=redis_client,
            settings=settings
        )
        
        # 3. Inicializar Supabase
        logger.info("[STARTUP] Initializing Supabase...")
        supabase_client = SupabaseClient(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key,
            service_key=settings.supabase_service_key,
            app_settings=settings
        )
        
        # 4. Inicializar Qdrant
        logger.info("[STARTUP] Initializing Qdrant...")
        qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key
        )
        
        # 5. Inicializar clientes
        embedding_client = EmbeddingClient(base_redis_client)
        
        # 6. Inicializar servicio de ingestion
        logger.info("[STARTUP] Initializing IngestionService...")
        ingestion_service = IngestionService(
            app_settings=settings,
            service_redis_client=base_redis_client,
            direct_redis_conn=redis_client,
            supabase_client=supabase_client,
            qdrant_client=qdrant_client,
            embedding_client=embedding_client
        )
        await ingestion_service.initialize()
        
        # 7. Inicializar WebSocket Manager
        logger.info("[STARTUP] Initializing WebSocket Manager...")
        websocket_manager = IngestionWebSocketManager(
            app_settings=settings,
            supabase_client=supabase_client
        )
        ingestion_service.set_websocket_manager(websocket_manager)
        
        # 8. Configurar dependencias para API
        set_dependencies(
            ingestion_service=ingestion_service,
            websocket_manager=websocket_manager,
            settings=settings,
            supabase_client=supabase_client
        )
        
        # 9. Inicializar workers principales
        logger.info(f"[STARTUP] Starting {settings.worker_count} ingestion worker(s)...")
        for i in range(settings.worker_count):
            worker = IngestionWorker(
                app_settings=settings,
                async_redis_conn=redis_client,
                ingestion_service=ingestion_service,
                consumer_id_suffix=f"ingestion-{i}"
            )
            workers.append(worker)
            await worker.initialize()
            task = asyncio.create_task(
                worker.run(),
                name=f"ingestion-worker-{i}"
            )
            worker_tasks.append(task)
        
        # 5. Inicializar workers de callbacks de extracción
        logger.info(f"[STARTUP] Starting {settings.callback_worker_count} extraction callback worker(s)...")
        for i in range(settings.callback_worker_count):
            # Crear copia de settings para este worker
            callback_settings = IngestionSettings()
            
            worker = ExtractionCallbackWorker(
                app_settings=callback_settings,
                async_redis_conn=redis_client,
                ingestion_service=ingestion_service,
                consumer_id_suffix=f"extraction-callback-{i}"
            )
            workers.append(worker)
            await worker.initialize()
            task = asyncio.create_task(
                worker.run(),
                name=f"extraction-callback-worker-{i}"
            )
            worker_tasks.append(task)
        
        # 6. Inicializar workers de callbacks de embedding
        logger.info(f"[STARTUP] Starting {settings.callback_worker_count} embedding callback worker(s)...")
        for i in range(settings.callback_worker_count):
            callback_settings = IngestionSettings()
            
            worker = EmbeddingCallbackWorker(
                app_settings=callback_settings,
                async_redis_conn=redis_client,
                ingestion_service=ingestion_service,
                consumer_id_suffix=f"embedding-callback-{i}"
            )
            workers.append(worker)
            await worker.initialize()
            task = asyncio.create_task(
                worker.run(),
                name=f"embedding-callback-worker-{i}"
            )
            worker_tasks.append(task)
        
        logger.info(f"--- [STARTUP] {settings.service_name} ready with {len(workers)} worker(s) ---")
        
    except Exception as e:
        logger.error(f"[STARTUP] Failed to initialize: {e}", exc_info=True)
        raise


async def shutdown():
    """Detiene el servicio de forma ordenada."""
    global workers, worker_tasks, redis_manager
    
    logger.info(f"--- [SHUTDOWN] Stopping {settings.service_name} ---")
    
    # 1. Detener workers
    for worker in workers:
        try:
            await worker.stop()
        except Exception as e:
            logger.error(f"Error stopping worker: {e}")
    
    # 2. Cancelar tasks
    for task in worker_tasks:
        if not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
    
    # 4. Cerrar Qdrant
    if qdrant_client:
        try:
            await qdrant_client.close()
        except Exception as e:
            logger.error(f"Error closing Qdrant: {e}")
            
    logger.info(f"--- [SHUTDOWN] {settings.service_name} stopped ---")


# =============================================================================
# FASTAPI APP (para API de uploads y status)
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager para FastAPI."""
    await startup()
    yield
    await shutdown()


# Crear app FastAPI
app = FastAPI(
    title="Ingestion Service",
    description="Servicio de ingestion de documentos para Nooble8",
    version=settings.service_version,
    lifespan=lifespan
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir rutas
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(ingestion_router, prefix="/api/v1", tags=["ingestion"])
app.include_router(websocket_router, tags=["websocket"])


# =============================================================================
# MAIN
# =============================================================================

def handle_signal(signum, frame):
    """Maneja señales de sistema para shutdown graceful."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    shutdown_event.set()


async def run_workers_only():
    """Ejecuta solo los workers (sin API HTTP)."""
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    try:
        await startup()
        logger.info("[MAIN] Service running (workers only), waiting for shutdown signal...")
        await shutdown_event.wait()
    except KeyboardInterrupt:
        logger.info("[MAIN] Keyboard interrupt received")
    except Exception as e:
        logger.error(f"[MAIN] Unexpected error: {e}", exc_info=True)
    finally:
        await shutdown()


def main():
    """Función principal."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingestion Service")
    parser.add_argument(
        "--mode",
        choices=["api", "workers", "full"],
        default="full",
        help="Modo de ejecución: api (solo HTTP), workers (solo workers), full (ambos)"
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host para API")
    parser.add_argument("--port", type=int, default=8002, help="Puerto para API")
    
    args = parser.parse_args()
    
    if args.mode == "workers":
        # Solo workers
        asyncio.run(run_workers_only())
    else:
        # API + Workers (full) o solo API
        uvicorn.run(
            "ingestion_service.main:app",
            host=args.host,
            port=args.port,
            reload=False,
            log_level="info"
        )


if __name__ == "__main__":
    main()
