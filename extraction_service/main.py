"""
Punto de entrada principal para Extraction Service.

Este es un servicio worker-only (sin API HTTP).
Escucha en Redis streams y procesa extracciones de documentos.
"""

import asyncio
import logging
import signal
import sys
from typing import List, Optional

from common.clients.redis.redis_manager import RedisManager
from common.utils.logging import init_logging
from common.clients.base_redis_client import BaseRedisClient

from .config.settings import ExtractionSettings
from .services.extraction_service import ExtractionService
from .workers.extraction_worker import ExtractionWorker

# Configuración global
settings = ExtractionSettings()
init_logging(service_name=settings.service_name, log_level=settings.log_level)
logger = logging.getLogger(__name__)

# Variables globales
redis_manager: Optional[RedisManager] = None
extraction_service: Optional[ExtractionService] = None
workers: List[ExtractionWorker] = []
worker_tasks: List[asyncio.Task] = []
shutdown_event = asyncio.Event()


async def startup():
    """Inicializa el servicio y sus componentes."""
    global redis_manager, extraction_service, workers, worker_tasks
    
    logger.info(f"--- [STARTUP] Initializing {settings.service_name} v{settings.service_version} ---")
    
    try:
        # 1. Inicializar Redis
        logger.info("[STARTUP] Connecting to Redis...")
        redis_manager = RedisManager(settings)
        redis_client = await redis_manager.get_client()
        
        # 2. Crear BaseRedisClient para comunicación
        base_redis_client = BaseRedisClient(
            service_name=settings.service_name,
            redis_client=redis_client,
            settings=settings
        )
        
        # 3. Inicializar servicio de extracción
        logger.info("[STARTUP] Initializing ExtractionService...")
        extraction_service = ExtractionService(
            app_settings=settings,
            service_redis_client=base_redis_client,
            direct_redis_conn=redis_client
        )
        await extraction_service.initialize()
        
        # 4. Inicializar workers
        logger.info(f"[STARTUP] Starting {settings.worker_count} worker(s)...")
        for i in range(settings.worker_count):
            worker = ExtractionWorker(
                app_settings=settings,
                async_redis_conn=redis_client,
                extraction_service=extraction_service,
                consumer_id_suffix=f"extraction-{i}"
            )
            workers.append(worker)
            
            # Inicializar worker
            await worker.initialize()
            
            # Crear task para el worker
            task = asyncio.create_task(
                worker.run(),
                name=f"extraction-worker-{i}"
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


def handle_signal(signum, frame):
    """Maneja señales de sistema para shutdown graceful."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    shutdown_event.set()


async def main():
    """Función principal del servicio."""
    # Configurar handlers de señales
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    try:
        # Iniciar servicio
        await startup()
        
        # Esperar señal de shutdown
        logger.info("[MAIN] Service running, waiting for shutdown signal...")
        await shutdown_event.wait()
        
    except KeyboardInterrupt:
        logger.info("[MAIN] Keyboard interrupt received")
    except Exception as e:
        logger.error(f"[MAIN] Unexpected error: {e}", exc_info=True)
    finally:
        # Shutdown ordenado
        await shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
