"""
Handler para gestión de sesiones de chat.
Usa OrchestratorSession en lugar de ConversationHistory.
"""
import asyncio
import logging
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import time

from common.handlers.base_handler import BaseHandler
from common.models.chat_models import SessionType
from common.clients.redis.cache_manager import CacheManager

from ..models import OrchestratorSession
from ..config.settings import OrchestratorSettings

logger = logging.getLogger(__name__)


class SessionHandler(BaseHandler):
    """
    Handler para gestión de sesiones.
    Responsable del ciclo de vida completo de las sesiones de chat.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        direct_redis_conn=None
    ):
        super().__init__(app_settings, direct_redis_conn)
        
        # Cache manager para sesiones
        self.cache_manager = CacheManager[OrchestratorSession](
            redis_conn=direct_redis_conn,
            state_model=OrchestratorSession,
            app_settings=app_settings,
            default_ttl=app_settings.session_cache_ttl
        )
        
        # Tracking local de sesiones activas
        self._active_sessions: Dict[uuid.UUID, OrchestratorSession] = {}
        self._session_locks: Dict[uuid.UUID, asyncio.Lock] = {}
        
        # Task de limpieza
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = True
        self._start_cleanup_task()
    
    def _start_cleanup_task(self):
        """Inicia la tarea de limpieza periódica."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def shutdown(self):
        """Cierra el handler y cancela tareas."""
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
    
    async def create_session(
        self,
        session_type: SessionType,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> OrchestratorSession:
        """
        Crea una nueva sesión.
        
        Args:
            session_type: Tipo de sesión (chat/ingestion)
            tenant_id: ID del tenant
            agent_id: ID del agente
            user_id: ID del usuario (opcional para chat público)
            metadata: Metadata adicional
            
        Returns:
            OrchestratorSession creada
        """
        session_id = uuid.uuid4()
        conversation_id = self._generate_conversation_id(tenant_id, session_id, agent_id)
        
        session = OrchestratorSession(
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            session_id=session_id,
            session_type=session_type,
            agent_id=agent_id,
            user_id=user_id,
            messages=[],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            total_messages=0,
            metadata=metadata or {},
            # Campos adicionales del orchestrator
            total_tasks=0,
            active_task_id=None,
            connection_id=None,
            websocket_connected=False,
            last_activity=datetime.now(timezone.utc)
        )
        
        # Guardar en cache y tracking local
        await self._save_session(session)
        self._active_sessions[session_id] = session
        self._session_locks[session_id] = asyncio.Lock()
        
        self._logger.info(
            f"Sesión creada",
            extra={
                "session_id": str(session_id),
                "session_type": session_type.value,
                "tenant_id": str(tenant_id),
                "agent_id": str(agent_id)
            }
        )
        
        return session
    
    async def get_session(
        self,
        session_id: uuid.UUID
    ) -> Optional[OrchestratorSession]:
        """Obtiene una sesión por ID."""
        # Verificar tracking local primero
        if session_id in self._active_sessions:
            session = self._active_sessions[session_id]
            session.update_activity()
            return session
        
        # Buscar en cache Redis
        session = await self.cache_manager.get(
            cache_type="session",
            context=[str(session_id)]
        )
        
        if session:
            # Agregar a tracking local
            self._active_sessions[session_id] = session
            self._session_locks[session_id] = asyncio.Lock()
            session.update_activity()
            
        return session
    
    async def update_session(
        self,
        session: OrchestratorSession
    ) -> bool:
        """Actualiza una sesión."""
        session.updated_at = datetime.now(timezone.utc)
        session.update_activity()
        
        # Actualizar en ambos lugares
        self._active_sessions[session.session_id] = session
        await self._save_session(session)
        
        return True
    
    async def delete_session(
        self,
        session_id: uuid.UUID
    ) -> bool:
        """Elimina una sesión."""
        # Remover de tracking local
        self._active_sessions.pop(session_id, None)
        self._session_locks.pop(session_id, None)
        
        # Remover de cache
        deleted = await self.cache_manager.delete(
            cache_type="session",
            context=[str(session_id)]
        )
        
        self._logger.info(f"Sesión eliminada: {session_id}")
        return deleted
    
    async def list_active_sessions(
        self,
        tenant_id: Optional[uuid.UUID] = None,
        session_type: Optional[SessionType] = None
    ) -> List[OrchestratorSession]:
        """Lista sesiones activas con filtros opcionales."""
        sessions = []
        
        for session in self._active_sessions.values():
            if tenant_id and session.tenant_id != tenant_id:
                continue
            if session_type and session.session_type != session_type:
                continue
            sessions.append(session)
        
        return sessions
    
    async def create_task_id(
        self,
        session_id: uuid.UUID
    ) -> uuid.UUID:
        """Crea un nuevo task_id para una sesión."""
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Sesión no encontrada: {session_id}")
        
        task_id = uuid.uuid4()
        
        async with self._get_session_lock(session_id):
            session.total_tasks += 1
            session.active_task_id = task_id
            await self.update_session(session)
        
        return task_id
    
    async def complete_task(
        self,
        session_id: uuid.UUID,
        task_id: uuid.UUID
    ) -> None:
        """Marca una tarea como completada."""
        session = await self.get_session(session_id)
        if not session:
            return
        
        async with self._get_session_lock(session_id):
            if session.active_task_id == task_id:
                session.active_task_id = None
            await self.update_session(session)
    
    async def fail_task(
        self,
        session_id: uuid.UUID,
        task_id: uuid.UUID,
        error: str
    ) -> None:
        """Marca una tarea como fallida."""
        session = await self.get_session(session_id)
        if not session:
            return
        
        async with self._get_session_lock(session_id):
            if session.active_task_id == task_id:
                session.active_task_id = None
            
            # Guardar error en metadata
            if "failed_tasks" not in session.metadata:
                session.metadata["failed_tasks"] = []
            
            session.metadata["failed_tasks"].append({
                "task_id": str(task_id),
                "error": error,
                "failed_at": datetime.now(timezone.utc).isoformat()
            })
            
            await self.update_session(session)
    
    async def register_connection(
        self,
        session_id: uuid.UUID,
        connection_id: str
    ) -> None:
        """Registra una conexión WebSocket para una sesión."""
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Sesión no encontrada: {session_id}")
        
        async with self._get_session_lock(session_id):
            session.connection_id = connection_id
            session.websocket_connected = True
            await self.update_session(session)
    
    async def unregister_connection(
        self,
        session_id: uuid.UUID,
        connection_id: str
    ) -> None:
        """Desregistra una conexión WebSocket."""
        session = await self.get_session(session_id)
        if not session:
            return
        
        async with self._get_session_lock(session_id):
            if session.connection_id == connection_id:
                session.connection_id = None
                session.websocket_connected = False
                await self.update_session(session)
    
    # Métodos privados
    
    def _generate_conversation_id(
        self,
        tenant_id: uuid.UUID,
        session_id: uuid.UUID,
        agent_id: uuid.UUID
    ) -> uuid.UUID:
        """Genera ID determinístico para conversación."""
        combined = f"{tenant_id}:{session_id}:{agent_id}"
        return uuid.uuid5(uuid.NAMESPACE_DNS, combined)
    
    def _get_session_lock(
        self,
        session_id: uuid.UUID
    ) -> asyncio.Lock:
        """Obtiene o crea lock para una sesión."""
        if session_id not in self._session_locks:
            self._session_locks[session_id] = asyncio.Lock()
        return self._session_locks[session_id]
    
    async def _save_session(
        self,
        session: OrchestratorSession
    ) -> None:
        """Guarda sesión en cache Redis."""
        await self.cache_manager.save(
            cache_type="session",
            context=[str(session.session_id)],
            data=session
        )
    
    async def _cleanup_loop(self):
        """Loop de limpieza periódica de sesiones expiradas."""
        while self._running:
            try:
                await asyncio.sleep(self.app_settings.session_cleanup_interval)
                await self._cleanup_expired_sessions()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._logger.error(f"Error en limpieza de sesiones: {e}")
    
    async def _cleanup_expired_sessions(self):
        """Limpia sesiones expiradas."""
        current_time = datetime.now(timezone.utc)
        expired_sessions = []
        
        for session_id, session in list(self._active_sessions.items()):
            # Considerar expirada si no ha sido actualizada en el tiempo máximo de inactividad
            time_since_update = (current_time - session.last_activity).total_seconds()
            if time_since_update > self.app_settings.session_max_idle_time:
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            await self.delete_session(session_id)
        
        if expired_sessions:
            self._logger.info(f"Limpiadas {len(expired_sessions)} sesiones expiradas")