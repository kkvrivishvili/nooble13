"""
Worker para procesar DomainActions de conversaciones.
"""
from typing import Dict, Any, Optional

import redis.asyncio as redis_async

from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction
from common.supabase import SupabaseClient

from conversation_service.config.settings import ConversationSettings
from conversation_service.services.persistence_service import PersistenceService


class ConversationWorker(BaseWorker):
    """Worker para procesar acciones de conversación."""
    
    def __init__(
        self,
        app_settings: ConversationSettings,
        async_redis_conn: redis_async.Redis,
        consumer_id_suffix: Optional[str] = None,
        supabase_client: Optional[SupabaseClient] = None
    ):
        super().__init__(app_settings, async_redis_conn, consumer_id_suffix)
        
        self.settings: ConversationSettings = app_settings
        self.supabase_client = supabase_client
        self.persistence_service: Optional[PersistenceService] = None
    
    async def initialize(self):
        """Inicializa el worker y sus dependencias."""
        await super().initialize()
        
        # Crear Supabase client si no se proporcionó
        if not self.supabase_client:
            self.supabase_client = SupabaseClient(
                url=self.settings.supabase_url,
                anon_key=self.settings.supabase_anon_key,
                service_key=self.settings.supabase_service_key,
                app_settings=self.settings
            )
        
        # Verificar conexión con Supabase
        health = await self.supabase_client.health_check()
        if health["status"] != "healthy":
            raise Exception(f"Supabase no está saludable: {health}")
        
        # Inicializar servicio de persistencia
        self.persistence_service = PersistenceService(self.supabase_client)
        
        self.logger.info(f"ConversationWorker inicializado")
    
    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Maneja las acciones del dominio conversation.
        
        Acciones soportadas:
        - {service_name}.message.create: Guardar mensajes (fire-and-forget)
        - {service_name}.session.closed: Marcar sesión como cerrada (fire-and-forget)
        """
        action_type_raw = action.action_type or ""
        action_type = action_type_raw.strip().lower()
        
        try:
            # Prefijo dinámico según configuración del servicio (p. ej., "conversation_service")
            service_prefix = (self.settings.service_name or "").strip()
            message_create_type_dynamic = f"{service_prefix}.message.create".strip().lower() if service_prefix else ""
            session_closed_type_dynamic = f"{service_prefix}.session.closed".strip().lower() if service_prefix else ""

            # Tipos estáticos esperados desde Execution Service
            message_create_type_static = "conversation_service.message.create"
            session_closed_type_static = "conversation_service.session.closed"

            supported_message_create = {t for t in [message_create_type_static, message_create_type_dynamic] if t}
            supported_session_closed = {t for t in [session_closed_type_static, session_closed_type_dynamic] if t}

            # Log de ruteo para diagnóstico
            self.logger.debug(
                "[ROUTING] Evaluando tipo de acción",
                extra={
                    "received_type": action_type_raw,
                    "normalized_type": action_type,
                    "expected_create": list(supported_message_create),
                    "expected_closed": list(supported_session_closed),
                    "service_name": service_prefix,
                },
            )

            if action_type in supported_message_create:
                # Validar datos requeridos
                data = action.data
                required_fields = ["conversation_id", "user_message", "agent_message"]
                
                missing_fields = [field for field in required_fields if not data.get(field)]
                if missing_fields:
                    self.logger.error(
                        f"Campos faltantes en action.data: {missing_fields}",
                        extra={"action_id": str(action.action_id)}
                    )
                    return None
                
                # Fire-and-forget: guardar mensajes
                result = await self.persistence_service.save_conversation_exchange(
                    conversation_id=data.get("conversation_id"),
                    tenant_id=str(action.tenant_id),
                    session_id=str(action.session_id),
                    agent_id=str(action.agent_id) if action.agent_id else "",
                    user_message=data.get("user_message"),
                    agent_message=data.get("agent_message"),
                    message_id=data.get("message_id"),
                    metadata=data.get("metadata")
                )
                
                if result.get("success"):
                    self.logger.info(
                        f"Mensajes guardados exitosamente",
                        extra={
                            "conversation_id": result.get("conversation_id"),
                            "action_id": str(action.action_id)
                        }
                    )
                else:
                    self.logger.error(
                        f"Error guardando mensajes: {result.get('error')}",
                        extra={"action_id": str(action.action_id)}
                    )
                
                return None  # Fire-and-forget
            
            elif action_type in supported_session_closed:
                # Fire-and-forget: marcar sesión cerrada
                success = await self.persistence_service.mark_conversation_ended(
                    tenant_id=str(action.tenant_id),
                    session_id=str(action.session_id),
                    agent_id=str(action.agent_id) if action.agent_id else ""
                )
                
                if success:
                    self.logger.info(
                        f"Sesión marcada como cerrada",
                        extra={
                            "session_id": str(action.session_id),
                            "action_id": str(action.action_id)
                        }
                    )
                else:
                    self.logger.warning(
                        f"No se pudo marcar sesión como cerrada",
                        extra={
                            "session_id": str(action.session_id),
                            "action_id": str(action.action_id)
                        }
                    )
                
                return None  # Fire-and-forget
            
            else:
                self.logger.warning(
                    f"Acción no soportada: {action_type}",
                    extra={
                        "action_id": str(action.action_id),
                        "expected_create": list(supported_message_create),
                        "expected_closed": list(supported_session_closed),
                    }
                )
                return None
                
        except Exception as e:
            self.logger.error(
                f"Error procesando {action_type}: {str(e)}",
                extra={
                    "action_id": str(action.action_id),
                    "tenant_id": str(action.tenant_id),
                    "session_id": str(action.session_id),
                    "error_type": type(e).__name__
                },
                exc_info=True
            )
            return None  # Fire-and-forget, no propagamos errores