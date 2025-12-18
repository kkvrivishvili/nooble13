"""
Punto de entrada principal para Orchestrator Service (API-driven).
Arquitectura híbrida: API para entrada, Worker para callbacks.
"""
import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from typing import List

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from common.clients.redis.redis_manager import RedisManager
from common.utils.logging import init_logging
from common.clients.base_redis_client import BaseRedisClient
from common.supabase.client import SupabaseClient

from .config.settings import OrchestratorSettings
from .services.orchestration_service import OrchestrationService
from .clients.execution_client import ExecutionClient
from .handlers import ChatHandler, CallbackHandler, ConfigHandler, SessionHandler
from .websocket.orchestrator_websocket_manager import OrchestratorWebSocketManager
from .workers.callback_worker import CallbackWorker
from .api import chat_router, websocket_router, health_router
from .api.dependencies import set_dependencies

# Configuración global
settings = OrchestratorSettings()
init_logging(service_name=settings.service_name, log_level=settings.log_level)
logger = logging.getLogger(__name__)

# Variables globales para gestión de componentes
redis_manager: RedisManager = None
orchestration_service: OrchestrationService = None
websocket_manager: OrchestratorWebSocketManager = None
callback_workers: List[CallbackWorker] = []
worker_tasks: List[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestión del ciclo de vida de la aplicación."""
    global redis_manager, orchestration_service, websocket_manager, callback_workers, worker_tasks
    
    try:
        logger.info(f"=== Iniciando {settings.service_name} v{settings.service_version} ===")
        
        # 1. Inicializar Redis
        logger.info("Inicializando Redis...")
        redis_manager = RedisManager(settings)
        redis_client = await redis_manager.get_client()
        logger.info("Redis conectado")
        
        # 2. Crear BaseRedisClient para comunicación entre servicios
        base_redis_client = BaseRedisClient(
            service_name=settings.service_name,
            redis_client=redis_client,
            settings=settings
        )
        
        # 3. Inicializar Supabase
        logger.info("Inicializando Supabase...")
        supabase_client = SupabaseClient(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key,
            service_key=settings.supabase_service_key,
            app_settings=settings
        )
        
        # 4. Inicializar clientes
        execution_client = ExecutionClient(
            redis_client=base_redis_client,
            settings=settings
        )
        
        # 5. Inicializar handlers especializados
        config_handler = ConfigHandler(
            app_settings=settings,
            supabase_client=supabase_client,
            direct_redis_conn=redis_client
        )
        
        session_handler = SessionHandler(
            app_settings=settings,
            direct_redis_conn=redis_client
        )
        
        # 6. Inicializar servicio de orquestación
        orchestration_service = OrchestrationService(
            app_settings=settings,
            service_redis_client=base_redis_client,
            direct_redis_conn=redis_client,
            supabase_client=supabase_client,
            execution_client=execution_client,
            config_handler=config_handler,
            session_handler=session_handler
        )
        
        # 7. Inicializar WebSocket Manager
        websocket_manager = OrchestratorWebSocketManager(
            app_settings=settings,
            direct_redis_conn=redis_client,
            orchestration_service=orchestration_service
        )
        
        # 8. Inicializar handlers de API
        chat_handler = ChatHandler(
            app_settings=settings,
            execution_client=execution_client,
            config_handler=config_handler,
            session_handler=session_handler,
            websocket_manager=websocket_manager
        )
        
        callback_handler = CallbackHandler(
            app_settings=settings,
            websocket_manager=websocket_manager,
            session_handler=session_handler
        )
        
        # 9. Configurar dependencias para API
        set_dependencies(
            orchestration_service=orchestration_service,
            chat_handler=chat_handler,
            callback_handler=callback_handler,
            websocket_manager=websocket_manager,
            settings=settings
        )
        
        # 10. Inicializar workers de callback si están habilitados
        if settings.callback_worker_enabled:
            logger.info(f"Iniciando {settings.callback_worker_count} workers de callback...")
            
            for i in range(settings.callback_worker_count):
                worker = CallbackWorker(
                    app_settings=settings,
                    async_redis_conn=redis_client,
                    orchestration_service=orchestration_service,
                    consumer_id_suffix=f"callback-{i}"
                )
                callback_workers.append(worker)
                
                # Inicializar worker
                await worker.initialize()
                
                # Crear tarea
                task = asyncio.create_task(
                    worker.run(),
                    name=f"callback-worker-{i}"
                )
                worker_tasks.append(task)
            
            logger.info(f"{len(callback_workers)} workers de callback iniciados")
        
        logger.info(f"=== {settings.service_name} iniciado correctamente ===")
        
        # Mostrar endpoints disponibles
        log_available_endpoints(host=settings.api_host, port=settings.api_port)
        
        yield
        
    except Exception as e:
        logger.error(f"Error durante el inicio: {e}")
        raise
    finally:
        logger.info(f"=== Cerrando {settings.service_name} ===")
        
        try:
            # 1. Detener workers de callback
            for worker in callback_workers:
                await worker.stop()
            
            # 2. Cancelar tareas
            for task in worker_tasks:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
            
            # 3. Cerrar WebSocket Manager
            if websocket_manager:
                await websocket_manager.shutdown()
            
            # 4. Cerrar servicio de orquestación
            if orchestration_service:
                await orchestration_service.shutdown()
            
            # 5. Cerrar Redis
            if redis_manager:
                await redis_manager.close()
            
            logger.info(f"=== {settings.service_name} cerrado correctamente ===")
            
        except Exception as e:
            logger.error(f"Error durante el cierre: {e}")


def log_available_endpoints(host: str = "0.0.0.0", port: int = 8001):
    """Registra todos los endpoints disponibles del servicio."""
    base_url = f"http://{host}:{port}"
    ws_base_url = f"ws://{host}:{port}"
    
    logger.info("=" * 60)
    logger.info(" ORCHESTRATOR SERVICE - ENDPOINTS DISPONIBLES")
    logger.info("=" * 60)
    
    # Health Endpoints
    logger.info(" HEALTH & MONITORING:")
    logger.info(f"  GET  {base_url}/health/                    - Health check básico")
    logger.info(f"  GET  {base_url}/health/detailed            - Health check detallado")
    logger.info(f"  GET  {base_url}/health/metrics             - Métricas del servicio")
    
    # Chat API Endpoints
    logger.info(" CHAT API:")
    logger.info(f"  POST {base_url}/api/v1/chat/init           - Iniciar sesión de chat")
    logger.info(f"  GET  {base_url}/api/v1/chat/{{session_id}}/status - Estado de sesión")
    logger.info(f"  POST {base_url}/api/v1/chat/{{session_id}}/task   - Crear nueva tarea")
    logger.info(f"  DEL  {base_url}/api/v1/chat/{{session_id}}        - Eliminar sesión")
    
    # WebSocket Endpoints
    logger.info(" WEBSOCKET:")
    logger.info(f"  WS   {ws_base_url}/ws/chat/{{session_id}}         - WebSocket para chat")
    
    # FastAPI Auto-generated
    logger.info(" DOCUMENTACIÓN:")
    logger.info(f"  GET  {base_url}/docs                       - Swagger UI")
    logger.info(f"  GET  {base_url}/redoc                      - ReDoc")
    logger.info(f"  GET  {base_url}/openapi.json               - OpenAPI Schema")
    
    logger.info("=" * 60)
    logger.info(f" Servicio disponible en: {base_url}")
    logger.info("=" * 60)


# Crear aplicación FastAPI
app = FastAPI(
    title="Nooble8 Orchestrator Service",
    description="""## Servicio de Orquestación API-driven
    
    El **Orchestrator Service** es el punto central de coordinación para:
    
    ### 🎯 Funcionalidades Principales
    - **Gestión de Sesiones de Chat**: Crear, monitorear y gestionar sesiones de conversación
    - **Coordinación de Tareas**: Orquestar tareas entre diferentes servicios
    - **WebSocket Real-time**: Comunicación bidireccional en tiempo real
    - **Health Monitoring**: Monitoreo de salud y métricas del sistema
    
    ### 🏗️ Arquitectura
    - **API-driven**: Entrada principal vía REST API
    - **Worker-based**: Procesamiento asíncrono de callbacks
    - **Redis Integration**: Comunicación entre servicios
    - **Supabase Backend**: Persistencia y configuración
    
    ### 🔗 Servicios Relacionados
    - **Execution Service**: Procesamiento de tareas de chat
    - **Query Service**: Búsquedas y consultas
    - **Ingestion Service**: Procesamiento de documentos
    """,
    version=settings.service_version,
    lifespan=lifespan,
    contact={
        "name": "Nooble8 Team",
        "url": "https://nooble8.com",
    },
    license_info={
        "name": "MIT",
    },
    tags_metadata=[
        {
            "name": "health",
            "description": "🏥 **Health Checks & Monitoring** - Endpoints para verificar el estado del servicio y obtener métricas",
        },
        {
            "name": "chat",
            "description": "💬 **Chat Management** - Gestión completa de sesiones de chat, tareas y estados",
        },
        {
            "name": "websocket",
            "description": "🔌 **WebSocket Real-time** - Comunicación bidireccional en tiempo real para chat",
        },
    ]
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
app.include_router(chat_router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(websocket_router, tags=["websocket"])


def setup_signal_handlers():
    """Configura handlers para señales del sistema."""
    loop = asyncio.get_event_loop()
    
    def handle_signal(sig):
        logger.info(f"Recibida señal {sig.name}")
        asyncio.create_task(shutdown_handler())
    
    for sig in [signal.SIGTERM, signal.SIGINT]:
        signal.signal(sig, lambda s, f: handle_signal(signal.Signals(s)))


async def shutdown_handler():
    """Handler para shutdown graceful."""
    logger.info("Iniciando shutdown graceful...")
    # El lifespan de FastAPI se encarga del resto


if __name__ == "__main__":
    setup_signal_handlers()
    
    uvicorn.run(
        "orchestrator_service.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level=settings.log_level.lower()
    )