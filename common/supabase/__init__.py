"""
Common Supabase module for Nooble8.
Provides unified Supabase client with caching, authentication, and error handling.
"""

from .client import SupabaseClient
from .auth import SupabaseWebSocketAuth, PublicWebSocketAuth
from .cache import SupabaseCache, SessionConfigCache
from .models import (
    AgentConfig,
    TenantInfo,
    UserInfo,
    IngestionMetadata,
    UserTenantRelation
)
from .types import (
    SupabaseError,
    SupabaseAuthError,
    SupabaseNotFoundError,
    SupabaseValidationError,
    SupabaseConnectionError,
    SupabaseResponse,
    SupabaseConfig,
    CacheStrategy,
    CacheInfo,
    SupabaseData,
    SupabaseFilter,
    SupabaseSort
)

__all__ = [
    # Client
    "SupabaseClient",
    
    # Authentication
    "SupabaseWebSocketAuth",
    "PublicWebSocketAuth",
    
    # Cache
    "SupabaseCache",
    "SessionConfigCache",
    
    # Models
    "AgentConfig",
    "TenantInfo", 
    "UserInfo",
    "IngestionMetadata",
    "UserTenantRelation",
    
    # Types and Exceptions
    "SupabaseError",
    "SupabaseAuthError",
    "SupabaseNotFoundError",
    "SupabaseValidationError",
    "SupabaseConnectionError",
    "SupabaseResponse",
    "SupabaseConfig",
    "CacheStrategy",
    "CacheInfo",
    "SupabaseData",
    "SupabaseFilter",
    "SupabaseSort"
]