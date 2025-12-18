"""
Tipos y excepciones para el cliente Supabase.
"""
from typing import Optional, Dict, Any, Union, TypeVar, Generic
from pydantic import BaseModel
from enum import Enum


class SupabaseError(Exception):
    """
    Excepción base para errores de Supabase.
    """
    def __init__(self, message: str, error_code: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}
    
    def __str__(self) -> str:
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message


class SupabaseAuthError(SupabaseError):
    """
    Error de autenticación con Supabase.
    """
    pass


class SupabaseNotFoundError(SupabaseError):
    """
    Error cuando un recurso no se encuentra en Supabase.
    """
    pass


class SupabaseValidationError(SupabaseError):
    """
    Error de validación de datos para Supabase.
    """
    pass


class SupabaseConnectionError(SupabaseError):
    """
    Error de conexión con Supabase.
    """
    pass


class CacheStrategy(str, Enum):
    """
    Estrategias de cache para operaciones de Supabase.
    """
    NO_CACHE = "no_cache"           # No usar cache
    CACHE_FIRST = "cache_first"     # Intentar cache primero, luego DB
    DB_FIRST = "db_first"           # Intentar DB primero, luego cache
    CACHE_ONLY = "cache_only"       # Solo usar cache
    DB_ONLY = "db_only"             # Solo usar DB


T = TypeVar('T')


class SupabaseResponse(BaseModel, Generic[T]):
    """
    Respuesta genérica de Supabase con metadata.
    """
    data: Optional[T] = None
    success: bool = True
    error: Optional[str] = None
    error_code: Optional[str] = None
    cached: bool = False
    response_time_ms: Optional[float] = None
    
    model_config = {"extra": "forbid"}


class CacheInfo(BaseModel):
    """
    Información sobre el estado del cache.
    """
    key: str
    hit: bool
    ttl_remaining: Optional[int] = None  # Segundos restantes
    created_at: Optional[str] = None
    
    model_config = {"extra": "forbid"}


class SupabaseConfig(BaseModel):
    """
    Configuración para el cliente Supabase.
    """
    url: str
    anon_key: str
    service_key: Optional[str] = None
    
    # Cache settings
    default_cache_ttl: int = 300
    config_cache_ttl: int = 600
    enable_cache: bool = True
    
    # Retry settings
    max_retries: int = 3
    retry_delay: float = 1.0
    
    # Timeout settings
    request_timeout: float = 30.0
    
    model_config = {"extra": "forbid"}


# Type aliases
SupabaseData = Union[Dict[str, Any], list, str, int, float, bool, None]
SupabaseFilter = Dict[str, Any]
SupabaseSort = Dict[str, str]  # {"column": "asc|desc"}