"""
Conversation Service - Servicio de persistencia de conversaciones.

Este servicio se encarga únicamente de persistir las conversaciones
en Supabase para su posterior uso por un CRM.
"""

__version__ = "2.0.0"
__author__ = "Nooble4 Team"
__description__ = "Servicio de persistencia de conversaciones con Supabase"

# Importaciones principales
from .config import ConversationSettings
from .models import Conversation, Message
from .services import PersistenceService
from .workers import ConversationWorker

__all__ = [
    # Configuración
    "ConversationSettings",
    
    # Modelos
    "Conversation",
    "Message",
    
    # Servicios
    "PersistenceService",
    
    # Workers
    "ConversationWorker",
]