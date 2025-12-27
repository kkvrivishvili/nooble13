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

from common.clients.redis.redis_manager import RedisManager
from common.utils.logging import init_logging
from common.clients.base_redis_client import BaseRedisClient

from .config.settings import IngestionSettings
from .services.ingestion_service import IngestionService
from .workers.ingestion_worker import IngestionWorker
from .workers.extraction_callback_worker import ExtractionCallbackWorker
from .workers.embedding_callback_worker import EmbeddingCallbackWorker

# Configuración global
settings = IngestionSettings()
init_logging(service_name=settings.service_name, log_level=settings.log_level)
logger = logging.getLogger(__name__)

# Variables globales
redis_manager: Optional[RedisManager] = None
ingestion_service: Optional[IngestionService] = None
workers: List = []
worker_tasks: List[asyncio.Task] = []
shutdown_event = asyncio.Event()


async def startup():
    """Inicializa el servicio y sus componentes."""
    global redis_manager, ingestion_service, workers, worker_tasks
    
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
        
        # 3. Inicializar servicio de ingestion
        logger.info("[STARTUP] Initializing IngestionService...")
        ingestion_service = IngestionService(
            app_settings=settings,
            service_redis_client=base_redis_client,
            direct_redis_conn=redis_client
        )
        await ingestion_service.initialize()
        
        # 4. Inicializar workers principales
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
    
    # 3. Cerrar Redis
    if redis_manager:
        try:
            await redis_manager.close()
        except Exception as e:
            logger.error(f"Error closing Redis: {e}")
    
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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": settings.service_version,
        "workers_count": len(workers)
    }


@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    """Obtiene estado de una tarea de ingestion."""
    if not ingestion_service:
        return {"error": "Service not initialized"}
    
    status = await ingestion_service.get_task_status(task_id)
    if status is None:
        return {"error": "Task not found", "task_id": task_id}
    
    return status


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
    parser.add_argument("--port", type=int, default=8003, help="Puerto para API")
    
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
