"""
Handler para gestión de configuraciones de agentes.
Maneja cache y recuperación desde Supabase.
"""
import logging
import uuid
from typing import Tuple, Optional, Dict, Any

from common.handlers.base_handler import BaseHandler
from common.models.config_models import ExecutionConfig, QueryConfig, RAGConfig
from common.clients.redis.cache_manager import CacheManager
from common.supabase.client import SupabaseClient
from common.supabase.models import AgentConfig

from ..config.settings import OrchestratorSettings

logger = logging.getLogger(__name__)


class ConfigHandler(BaseHandler):
    """
    Handler para gestión de configuraciones de agentes.
    Implementa cache de dos niveles: local + Redis.
    """
    
    def __init__(
        self,
        app_settings: OrchestratorSettings,
        supabase_client: SupabaseClient,
        direct_redis_conn=None
    ):
        super().__init__(app_settings, direct_redis_conn)
        self.supabase_client = supabase_client
        
        # Cache manager para configuraciones
        self.cache_manager = CacheManager[AgentConfig](
            redis_conn=direct_redis_conn,
            state_model=AgentConfig,
            app_settings=app_settings,
            default_ttl=app_settings.config_cache_ttl
        )
        
        # Cache local en memoria (nivel 1)
        self._local_cache: Dict[str, Tuple[AgentConfig, float]] = {}
    
    async def get_agent_configs(
        self,
        tenant_id: uuid.UUID,  # En realidad será el user_id del agente
        agent_id: uuid.UUID,
        session_id: uuid.UUID,
        task_id: uuid.UUID
    ) -> Tuple[ExecutionConfig, QueryConfig, RAGConfig]:
        """
        Obtiene las configuraciones del agente con cache de dos niveles.
        IMPORTANTE: Para chat público, solo obtiene agentes públicos.
        
        Args:
            tenant_id: ID del tenant (user_id del dueño del agente)
            agent_id: ID del agente
            session_id: ID de la sesión
            task_id: ID de la tarea
            
        Returns:
            Tupla con las tres configuraciones
        """
        cache_key = f"{agent_id}"  # Simplificado, solo usar agent_id
        
        try:
            # 1. Verificar cache local
            if cache_key in self._local_cache:
                agent_config, _ = self._local_cache[cache_key]
                self._logger.debug(f"Config obtenida de cache local: {cache_key}")
                return await self._extract_configs(agent_config, agent_config.tenant_id)
            
            # 2. Verificar cache Redis
            cached_config = await self.cache_manager.get(
                cache_type="agent_config",
                context=[str(agent_id)]
            )
            
            if cached_config:
                self._local_cache[cache_key] = (cached_config, self._get_timestamp())
                self._logger.debug(f"Config obtenida de cache Redis: {cache_key}")
                return await self._extract_configs(cached_config, cached_config.tenant_id)
            
            # 3. Obtener de Supabase
            self._logger.info(f"Obteniendo config de Supabase: {cache_key}")
            
            # ✅ FIX: Usar get_public_agent_config para chat público
            # Este método ya verifica is_public=true y is_active=true
            agent_config = await self.supabase_client.get_public_agent_config(str(agent_id))
            
            if not agent_config:
                # Si no se encuentra como público, intentar con service key si está disponible
                if self.supabase_client.admin_client:
                    self._logger.info(f"Intentando con service key para agente privado: {agent_id}")
                    agent_config = await self.supabase_client.get_agent_config(str(agent_id))
                
                if not agent_config:
                    self._logger.warning(f"Agente no encontrado o no es público: {agent_id}")
                    raise ValueError(f"Agente no encontrado o no es público: {agent_id}")
            
            # 4. Guardar en caches
            await self._save_to_cache(agent_id, agent_config)
            
            return await self._extract_configs(agent_config, agent_config.tenant_id)
            
        except Exception as e:
            self._logger.error(f"Error obteniendo configuraciones: {e}")
            # Retornar configuraciones por defecto en caso de error
            # Usar UUID vacío como fallback ya que no tenemos tenant_id disponible
            fallback_tenant_id = uuid.UUID('00000000-0000-0000-0000-000000000000')
            return await self._get_default_configs(fallback_tenant_id)
    
    async def get_agent_info(
        self,
        agent_id: uuid.UUID
    ) -> Optional[AgentConfig]:
        """Obtiene la configuración completa del agente (incluye tenant_id y agent_name).
        Usa el mismo mecanismo de cache que get_agent_configs. Prioriza agentes públicos.
        """
        cache_key = f"{agent_id}"
        try:
            # 1) Cache local
            if cache_key in self._local_cache:
                agent_config, _ = self._local_cache[cache_key]
                self._logger.debug(f"AgentConfig obtenido de cache local: {cache_key}")
                return agent_config

            # 2) Cache Redis
            cached_config = await self.cache_manager.get(
                cache_type="agent_config",
                context=[str(agent_id)]
            )
            if cached_config:
                self._local_cache[cache_key] = (cached_config, self._get_timestamp())
                self._logger.debug(f"AgentConfig obtenido de cache Redis: {cache_key}")
                return cached_config

            # 3) Supabase: primero como público, luego fallback con service key
            self._logger.info(f"Obteniendo AgentConfig de Supabase: {cache_key}")
            agent_config = await self.supabase_client.get_public_agent_config(str(agent_id))
            if not agent_config and self.supabase_client.admin_client:
                self._logger.info(f"Intentando obtener agente privado con service key: {agent_id}")
                agent_config = await self.supabase_client.get_agent_config(str(agent_id))

            if not agent_config:
                self._logger.warning(f"Agente no encontrado o no es público: {agent_id}")
                return None

            # 4) Guardar en caches
            await self._save_to_cache(agent_id, agent_config)
            return agent_config
        except Exception as e:
            self._logger.error(f"Error obteniendo AgentConfig: {e}")
            return None
    
    async def invalidate_agent_config(
        self,
        agent_id: uuid.UUID
    ) -> None:
        """Invalida la configuración de un agente en todos los caches."""
        cache_key = f"{agent_id}"
        
        # Remover de cache local
        self._local_cache.pop(cache_key, None)
        
        # Remover de cache Redis
        await self.cache_manager.delete(
            cache_type="agent_config",
            context=[str(agent_id)]
        )
        
        self._logger.info(f"Config invalidada: {cache_key}")
    
    async def _save_to_cache(
        self,
        agent_id: uuid.UUID,
        agent_config: AgentConfig
    ) -> None:
        """Guarda configuración en ambos niveles de cache."""
        cache_key = f"{agent_id}"
        
        # Guardar en cache Redis
        await self.cache_manager.save(
            cache_type="agent_config",
            context=[str(agent_id)],
            data=agent_config
        )
        
        # Guardar en cache local
        self._local_cache[cache_key] = (agent_config, self._get_timestamp())
    
    async def _extract_configs(
        self,
        agent_config: AgentConfig,
        tenant_id: uuid.UUID
    ) -> Tuple[ExecutionConfig, QueryConfig, RAGConfig]:
        """Extrae las configuraciones desde AgentConfig y sobrescribe collection_ids con valores reales."""
        # Obtener collection_ids reales de la base de datos
        real_collection_ids = await self.supabase_client.get_collection_ids(tenant_id)
        
        # Crear una copia del rag_config con collection_ids reales
        rag_config = agent_config.rag_config
        if real_collection_ids:
            # Sobrescribir collection_ids con valores reales
            rag_config.collection_ids = real_collection_ids
            self._logger.info(
                f"ConfigHandler: Sobrescribiendo collection_ids para tenant {tenant_id}: {agent_config.rag_config.collection_ids} -> {real_collection_ids}"
            )
        else:
            # Si no hay collection_ids reales, usar un valor por defecto para evitar error de validación
            # RAG no funcionará, pero el agente podrá responder sin contexto
            rag_config.collection_ids = ["no_documents_available"]
            self._logger.warning(
                f"ConfigHandler: No hay documentos ingresados para tenant {tenant_id}. RAG no estará disponible. Usando collection_id temporal: {rag_config.collection_ids}"
            )
        
        return (
            agent_config.execution_config,
            agent_config.query_config,
            rag_config
        )
    
    async def _get_default_configs(self, tenant_id: uuid.UUID) -> Tuple[ExecutionConfig, QueryConfig, RAGConfig]:
        """Retorna configuraciones por defecto con collection_ids reales."""
        # Obtener collection_ids reales de la base de datos
        collection_ids = await self.supabase_client.get_collection_ids(tenant_id)
        
        # Si no hay collection_ids, usar valor por defecto para evitar error de validación
        if not collection_ids:
            collection_ids = ["no_documents_available"]
            self._logger.warning(
                f"ConfigHandler: No hay documentos para tenant {tenant_id}. Usando collection_id temporal para configuración por defecto."
            )
        else:
            self._logger.info(
                f"ConfigHandler: Usando collection_ids reales para tenant {tenant_id}: {collection_ids}"
            )
        
        return (
            ExecutionConfig(),
            QueryConfig(
                model="llama-3.3-70b-versatile",
                system_prompt_template="Eres un asistente útil."
            ),
            RAGConfig(collection_ids=collection_ids)
        )
    
    def _get_timestamp(self) -> float:
        """Obtiene timestamp actual."""
        import time
        return time.time()
    
    async def cleanup_local_cache(self) -> None:
        """Limpia entradas expiradas del cache local."""
        current_time = self._get_timestamp()
        ttl = self.app_settings.config_cache_ttl
        
        expired_keys = [
            key for key, (_, timestamp) in self._local_cache.items()
            if current_time - timestamp > ttl
        ]
        
        for key in expired_keys:
            self._local_cache.pop(key, None)
        
        if expired_keys:
            self._logger.debug(f"Limpiadas {len(expired_keys)} entradas del cache local")