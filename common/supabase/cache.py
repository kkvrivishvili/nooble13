"""
Cache wrapper especializado para Supabase.
Combina TTL y invalidación por eventos.
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List, Callable, Awaitable
from datetime import datetime, timedelta
import uuid

from ..clients.redis.cache_manager import CacheManager
from ..clients.redis.cache_key_manager import CacheKeyManager
from .types import CacheStrategy, CacheInfo


class SupabaseCache:
    """
    Cache especializado para datos de Supabase.
    Soporta tanto TTL como invalidación por eventos.
    """
    
    def __init__(
        self,
        cache_manager: CacheManager,
        key_manager: Optional[CacheKeyManager] = None,
        logger: Optional[logging.Logger] = None
    ):
        """
        Inicializa el cache de Supabase.
        
        Args:
            cache_manager: Manager de cache Redis
            key_manager: Manager de keys opcional
            logger: Logger opcional
        """
        self.cache_manager = cache_manager
        self.key_manager = key_manager or CacheKeyManager()
        self.logger = logger or logging.getLogger("supabase.cache")
        
        # Event listeners for cache invalidation
        self._invalidation_listeners: Dict[str, List[Callable[[str], Awaitable[None]]]] = {}
    
    # Agent Config Cache
    async def get_agent_config(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene configuración de agente desde cache."""
        cache_key = self.key_manager.get_key("agent_config", agent_id)
        return await self.cache_manager.get(cache_key)
    
    async def set_agent_config(self, agent_id: str, config: Dict[str, Any], ttl: int = 600) -> None:
        """Guarda configuración de agente en cache."""
        cache_key = self.key_manager.get_key("agent_config", agent_id)
        await self.cache_manager.set(cache_key, config, ttl=ttl)
        self.logger.debug(f"Agent config cached: {agent_id}")
    
    async def invalidate_agent_config(self, agent_id: str) -> None:
        """Invalida cache de configuración de agente."""
        cache_key = self.key_manager.get_key("agent_config", agent_id)
        await self.cache_manager.delete(cache_key)
        
        # Trigger event listeners
        await self._trigger_invalidation_listeners("agent_config", agent_id)
        self.logger.info(f"Agent config cache invalidated: {agent_id}")
    
    # Tenant Info Cache
    async def get_tenant_info(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene información de tenant desde cache."""
        cache_key = self.key_manager.get_key("tenant_info", tenant_id)
        return await self.cache_manager.get(cache_key)
    
    async def set_tenant_info(self, tenant_id: str, info: Dict[str, Any], ttl: int = 300) -> None:
        """Guarda información de tenant en cache."""
        cache_key = self.key_manager.get_key("tenant_info", tenant_id)
        await self.cache_manager.set(cache_key, info, ttl=ttl)
        self.logger.debug(f"Tenant info cached: {tenant_id}")
    
    async def invalidate_tenant_info(self, tenant_id: str) -> None:
        """Invalida cache de información de tenant."""
        cache_key = self.key_manager.get_key("tenant_info", tenant_id)
        await self.cache_manager.delete(cache_key)
        
        # Trigger event listeners
        await self._trigger_invalidation_listeners("tenant_info", tenant_id)
        self.logger.info(f"Tenant info cache invalidated: {tenant_id}")
    
    # Session Cache (for WebSocket sessions)
    async def get_session_config(self, session_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
        """Obtiene configuración de sesión específica."""
        cache_key = self.key_manager.get_key("session_config", f"{session_id}:{agent_id}")
        return await self.cache_manager.get(cache_key)
    
    async def set_session_config(
        self, 
        session_id: str, 
        agent_id: str, 
        config: Dict[str, Any], 
        ttl: int = 1800  # 30 minutes
    ) -> None:
        """Guarda configuración de sesión específica."""
        cache_key = self.key_manager.get_key("session_config", f"{session_id}:{agent_id}")
        await self.cache_manager.set(cache_key, config, ttl=ttl)
        self.logger.debug(f"Session config cached: {session_id}:{agent_id}")
    
    async def invalidate_session_config(self, session_id: str, agent_id: Optional[str] = None) -> None:
        """Invalida cache de configuración de sesión."""
        if agent_id:
            # Invalidate specific session-agent combination
            cache_key = self.key_manager.get_key("session_config", f"{session_id}:{agent_id}")
            await self.cache_manager.delete(cache_key)
        else:
            # Invalidate all configs for this session
            pattern = self.key_manager.get_key("session_config", f"{session_id}:*")
            await self.cache_manager.delete_pattern(pattern)
        
        self.logger.info(f"Session config cache invalidated: {session_id}")
    
    # Batch Operations
    async def invalidate_all_agent_configs(self) -> None:
        """Invalida todas las configuraciones de agentes."""
        pattern = self.key_manager.get_key("agent_config", "*")
        await self.cache_manager.delete_pattern(pattern)
        self.logger.info("All agent configs cache invalidated")
    
    async def invalidate_all_tenant_info(self) -> None:
        """Invalida toda la información de tenants."""
        pattern = self.key_manager.get_key("tenant_info", "*")
        await self.cache_manager.delete_pattern(pattern)
        self.logger.info("All tenant info cache invalidated")
    
    async def clear_all_cache(self) -> None:
        """Limpia todo el cache de Supabase."""
        patterns = [
            self.key_manager.get_key("agent_config", "*"),
            self.key_manager.get_key("tenant_info", "*"),
            self.key_manager.get_key("session_config", "*")
        ]
        
        for pattern in patterns:
            await self.cache_manager.delete_pattern(pattern)
        
        self.logger.info("All Supabase cache cleared")
    
    # Event-based Invalidation
    def register_invalidation_listener(
        self, 
        cache_type: str, 
        listener: Callable[[str], Awaitable[None]]
    ) -> None:
        """
        Registra un listener para invalidación de cache.
        
        Args:
            cache_type: Tipo de cache ("agent_config", "tenant_info", etc.)
            listener: Función async que se llama cuando se invalida
        """
        if cache_type not in self._invalidation_listeners:
            self._invalidation_listeners[cache_type] = []
        
        self._invalidation_listeners[cache_type].append(listener)
        self.logger.debug(f"Invalidation listener registered for {cache_type}")
    
    async def _trigger_invalidation_listeners(self, cache_type: str, resource_id: str) -> None:
        """Dispara los listeners de invalidación."""
        listeners = self._invalidation_listeners.get(cache_type, [])
        
        for listener in listeners:
            try:
                await listener(resource_id)
            except Exception as e:
                self.logger.error(f"Error in invalidation listener: {str(e)}")
    
    # Cache Statistics
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas del cache."""
        try:
            # Count keys by pattern
            agent_config_count = await self._count_keys_by_pattern("agent_config:*")
            tenant_info_count = await self._count_keys_by_pattern("tenant_info:*")
            session_config_count = await self._count_keys_by_pattern("session_config:*")
            
            return {
                "agent_configs": agent_config_count,
                "tenant_info": tenant_info_count,
                "session_configs": session_config_count,
                "total_keys": agent_config_count + tenant_info_count + session_config_count,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            self.logger.error(f"Error getting cache stats: {str(e)}")
            return {"error": str(e)}
    
    async def _count_keys_by_pattern(self, pattern: str) -> int:
        """Cuenta keys que coinciden con un patrón."""
        try:
            # This would need to be implemented in CacheManager
            # For now, return 0 as placeholder
            return 0
        except Exception:
            return 0
    
    # Cache Info
    async def get_cache_info(self, cache_type: str, resource_id: str) -> Optional[CacheInfo]:
        """Obtiene información detallada sobre un item en cache."""
        cache_key = self.key_manager.get_key(cache_type, resource_id)
        
        try:
            # Check if key exists
            exists = await self.cache_manager.exists(cache_key)
            if not exists:
                return None
            
            # Get TTL if available
            ttl = await self.cache_manager.get_ttl(cache_key) if hasattr(self.cache_manager, 'get_ttl') else None
            
            return CacheInfo(
                key=cache_key,
                hit=True,
                ttl_remaining=ttl,
                created_at=datetime.utcnow().isoformat()
            )
            
        except Exception as e:
            self.logger.error(f"Error getting cache info: {str(e)}")
            return None


class SessionConfigCache:
    """
    Cache especializado para configuraciones de sesión.
    Optimizado para el patrón de uso de orchestrator_service.
    """
    
    def __init__(self, supabase_cache: SupabaseCache):
        """
        Inicializa el cache de configuraciones de sesión.
        
        Args:
            supabase_cache: Cache de Supabase base
        """
        self.cache = supabase_cache
        self.logger = logging.getLogger("supabase.session_cache")
    
    async def get_or_create_session_config(
        self,
        session_id: str,
        agent_id: str,
        config_factory: Callable[[], Awaitable[Dict[str, Any]]]
    ) -> Dict[str, Any]:
        """
        Obtiene configuración de sesión o la crea si no existe.
        
        Args:
            session_id: ID de la sesión
            agent_id: ID del agente
            config_factory: Función para crear la configuración si no existe
            
        Returns:
            Dict con la configuración
        """
        # Try to get from session cache first
        config = await self.cache.get_session_config(session_id, agent_id)
        if config:
            self.logger.debug(f"Session config cache hit: {session_id}:{agent_id}")
            return config
        
        # Try to get from agent config cache
        agent_config = await self.cache.get_agent_config(agent_id)
        if agent_config:
            # Copy to session cache
            await self.cache.set_session_config(session_id, agent_id, agent_config)
            self.logger.debug(f"Agent config copied to session cache: {session_id}:{agent_id}")
            return agent_config
        
        # Create new config
        config = await config_factory()
        
        # Cache both in agent and session caches
        await self.cache.set_agent_config(agent_id, config)
        await self.cache.set_session_config(session_id, agent_id, config)
        
        self.logger.info(f"New config created and cached: {session_id}:{agent_id}")
        return config
    
    async def invalidate_session(self, session_id: str) -> None:
        """Invalida toda la configuración de una sesión."""
        await self.cache.invalidate_session_config(session_id)
        self.logger.info(f"Session invalidated: {session_id}")
