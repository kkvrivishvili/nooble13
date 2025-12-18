"""
Punto de entrada para Conversation Service.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI

from common.utils.logging import init_logging
from common.clients.redis.redis_manager import RedisManager
from common.supabase import SupabaseClient

from conversation_service.config.settings import ConversationSettings
from conversation_service.workers.conversation_worker import ConversationWorker

# Configuración
settings = ConversationSettings()
logger = logging.getLogger(__name__)

# Globales
worker_tasks: List[asyncio.Task] = []
redis_manager: RedisManager = None
supabase_client: SupabaseClient = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker_tasks, redis_manager, supabase_client
    
    logger.info("Iniciando Conversation Service")
    
    try:
        # 1. Inicializar Redis
        redis_manager = RedisManager(settings)
        redis_client = await redis_manager.get_client()
        logger.info("Redis inicializado")
        
        # 2. Inicializar Supabase
        supabase_client = SupabaseClient(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key,
            service_key=settings.supabase_service_key,
            app_settings=settings
        )
        logger.info("Supabase inicializado")
        
        # 3. Crear workers
        for i in range(settings.worker_count):
            worker = ConversationWorker(
                app_settings=settings,
                async_redis_conn=redis_client,
                consumer_id_suffix=f"worker-{i+1}",
                supabase_client=supabase_client
            )
            await worker.initialize()
            task = asyncio.create_task(worker.run())
            worker_tasks.append(task)
        
        logger.info(f"{settings.worker_count} workers iniciados")
        
        yield
        
    finally:
        logger.info("Deteniendo Conversation Service")
        
        # Detener workers
        for task in worker_tasks:
            if not task.done():
                task.cancel()
        
        await asyncio.gather(*worker_tasks, return_exceptions=True)
        
        # Cerrar conexiones
        if redis_manager:
            await redis_manager.close()
        
        logger.info("Conversation Service detenido")


# Crear aplicación
app = FastAPI(
    title="Conversation Service",
    description="Servicio de persistencia de conversaciones",
    version=settings.service_version,
    lifespan=lifespan
)


@app.get("/")
async def root():
    return {
        "service": "conversation_service",
        "version": settings.service_version,
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check básico."""
    return {"status": "healthy"}


@app.get("/health/detailed")
async def detailed_health():
    """Health check detallado."""
    global redis_manager, supabase_client, worker_tasks
    
    health_status = {
        "service": "conversation_service",
        "status": "healthy",
        "components": {
            "redis": "unknown",
            "supabase": "unknown",
            "workers": {
                "configured": settings.worker_count,
                "running": 0
            }
        }
    }
    
    # Verificar Redis
    try:
        if redis_manager:
            redis_client = await redis_manager.get_client()
            await redis_client.ping()
            health_status["components"]["redis"] = "connected"
    except Exception as e:
        health_status["components"]["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Verificar Supabase
    try:
        if supabase_client:
            supabase_health = await supabase_client.health_check()
            health_status["components"]["supabase"] = supabase_health["status"]
            if supabase_health["status"] != "healthy":
                health_status["status"] = "degraded"
    except Exception as e:
        health_status["components"]["supabase"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
    
    # Verificar workers
    running_workers = sum(1 for task in worker_tasks if not task.done())
    health_status["components"]["workers"]["running"] = running_workers
    
    if running_workers < settings.worker_count:
        health_status["status"] = "degraded"
    
    return health_status


# Inicializar logging
init_logging(settings.log_level, service_name=settings.service_name)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=False)