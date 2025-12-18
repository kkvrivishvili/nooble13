"""
Punto de entrada principal para Ingestion Service (API-driven).
Arquitectura similar a orchestrator: API principal, Worker para callbacks.
"""
import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from typing import List

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
from .workers.embedding_callback_worker import EmbeddingCallbackWorker
from .api import ingestion_router, websocket_router, health_router
from .api.dependencies import set_dependencies

# Configuración global
settings = IngestionSettings()
init_logging(service_name=settings.service_name, log_level=settings.log_level)
logger = logging.getLogger(__name__)

# Variables globales
redis_manager: RedisManager = None
ingestion_service: IngestionService = None
websocket_manager: IngestionWebSocketManager = None
callback_workers: List[EmbeddingCallbackWorker] = []
worker_tasks: List[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    global redis_manager, ingestion_service, websocket_manager
    global callback_workers, worker_tasks
    
    try:
        logger.info(f"=== Iniciando {settings.service_name} v{settings.service_version} ===")
        
        # 1. Inicializar Redis
        redis_manager = RedisManager(settings)
        redis_client = await redis_manager.get_client()
        base_redis_client = BaseRedisClient(
            service_name=settings.service_name,
            redis_client=redis_client,
            settings=settings
        )
        
        # 2. Inicializar Supabase
        supabase_client = SupabaseClient(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key,
            service_key=settings.supabase_service_key,
            app_settings=settings
        )
        
        # 3. Inicializar Qdrant
        qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key
        )
        
        # 4. Inicializar clientes
        embedding_client = EmbeddingClient(base_redis_client)
        
        # 5. Inicializar servicio principal
        ingestion_service = IngestionService(
            app_settings=settings,
            service_redis_client=base_redis_client,
            direct_redis_conn=redis_client,
            supabase_client=supabase_client,
            qdrant_client=qdrant_client,
            embedding_client=embedding_client
        )
        
        await ingestion_service.initialize()
        
        # 6. Inicializar WebSocket Manager
        websocket_manager = IngestionWebSocketManager(
            app_settings=settings,
            supabase_client=supabase_client
        )
        
        ingestion_service.set_websocket_manager(websocket_manager)
        
        # 7. Configurar dependencias
        set_dependencies(
            ingestion_service=ingestion_service,
            websocket_manager=websocket_manager,
            settings=settings,
            supabase_client=supabase_client
        )
        
        # 8. Inicializar workers de callback
        if settings.embedding_callback_worker_enabled:
            for i in range(settings.embedding_callback_worker_count):
                worker = EmbeddingCallbackWorker(
                    app_settings=settings,
                    async_redis_conn=redis_client,
                    ingestion_service=ingestion_service,
                    consumer_id_suffix=f"embedding-{i}"
                )
                callback_workers.append(worker)
                
                await worker.initialize()
                
                task = asyncio.create_task(
                    worker.run(),
                    name=f"embedding-callback-worker-{i}"
                )
                worker_tasks.append(task)
        
        logger.info(f"=== {settings.service_name} iniciado correctamente ===")
        
        yield
        
    except Exception as e:
        logger.error(f"Error durante el inicio: {e}")
        raise
    finally:
        logger.info(f"=== Cerrando {settings.service_name} ===")
        
        # Cleanup
        for worker in callback_workers:
            await worker.stop()
        
        for task in worker_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        if qdrant_client:
            await qdrant_client.close()
        
        if redis_manager:
            await redis_manager.close()


# Crear aplicación FastAPI
app = FastAPI(
    title="Nooble8 Ingestion Service",
    description="Servicio de ingestion de documentos con autenticación JWT",
    version=settings.service_version,
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(ingestion_router, prefix="/api/v1", tags=["ingestion"])
app.include_router(websocket_router, tags=["websocket"])


if __name__ == "__main__":
    uvicorn.run(
        "ingestion_service.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level=settings.log_level.lower()
    )