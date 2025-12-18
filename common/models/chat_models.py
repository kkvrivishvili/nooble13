"""
Modelos unificados para chat y embeddings compatibles con OpenAI y Groq SDKs.
Simplificados para uso directo sin transformaciones.
"""
import uuid
from typing import Optional, List, Dict, Any, Union, Literal
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime, timezone

# Importar las configuraciones centralizadas
from .config_models import ExecutionConfig, QueryConfig, RAGConfig, EmbeddingModel, ChatModel


class SessionType(str, Enum):
    """Tipos de sesión soportados por el Orchestrator."""
    CHAT = "chat"
    INGESTION = "ingestion"


class MessageType(str, Enum):
    """Tipos de mensaje en una sesión de chat."""
    TEXT = "text"
    ACTION = "action"
    SYSTEM = "system"


# =============================================================================
# CORE MODELS (Compatible con SDKs)
# =============================================================================

class ChatMessageRequest(BaseModel):
    """
    Solicitud para enviar un mensaje en una sesión de chat.
    """
    message: "ChatMessage"
    message_type: MessageType = MessageType.TEXT
    metadata: Optional[Dict[str, Any]] = None


class ChatMessage(BaseModel):
    """
    Mensaje de chat compatible con Groq/OpenAI.
    Estructura directa para usar con SDKs sin transformación.
    """
    role: Literal["system", "user", "assistant", "tool"] = Field(..., description="Rol del mensaje")
    content: Optional[str] = Field(None, description="Contenido del mensaje")
    
    # Para tool calls (formato Groq/OpenAI)
    tool_calls: Optional[List[Dict[str, Any]]] = Field(None, description="Llamadas a herramientas")
    tool_call_id: Optional[str] = Field(None, description="ID de llamada a herramienta")
    
    # Nombre opcional para mensajes de tool
    name: Optional[str] = Field(None, description="Nombre para mensajes de tool")
    
    # Metadata expandido para orchestrator
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional del mensaje")
    
    model_config = {"extra": "forbid"}


class TokenUsage(BaseModel):
    """Uso de tokens (formato estándar OpenAI/Groq)."""
    prompt_tokens: int = Field(default=0)
    completion_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)
    
    model_config = {"extra": "forbid"}


# =============================================================================
# UNIFIED REQUEST/RESPONSE MODELS
# =============================================================================

class ChatRequest(BaseModel):
    """
    Request unificado para chat (simple y avanzado).
    Contiene únicamente datos de chat. Las configuraciones se obtienen 
    del DomainAction (action.execution_config, action.query_config, action.rag_config).
    """
    # Datos principales
    messages: List[ChatMessage] = Field(..., min_items=1, description="Mensajes de la conversación")
    
    # Herramientas (para chat avanzado)
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="Herramientas disponibles (formato Groq)")
    tool_choice: Optional[Union[Literal["none", "auto"], Dict[str, Any]]] = Field(None)
    
    # Conversación opcional (no existe en primera iteración)
    conversation_id: Optional[uuid.UUID] = Field(None, description="ID de conversación para tracking")
    
    # Metadata del chat (NO incluir tenant_id, session_id, etc. - van en DomainAction)
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata específico del chat")
    
    model_config = {"extra": "forbid"}


class ChatResponse(BaseModel):
    """
    Response unificado para chat.
    Estructura simple y directa.
    """
    message: ChatMessage = Field(..., description="Mensaje de respuesta del asistente")
    usage: TokenUsage = Field(..., description="Uso de tokens")
    
    # Metadata
    conversation_id: uuid.UUID = Field(..., description="ID de la conversación")
    execution_time_ms: int = Field(..., description="Tiempo de ejecución")
    
    # Para RAG
    sources: List[uuid.UUID] = Field(default_factory=list, description="IDs de documentos usados")
    iterations: Optional[int] = Field(None, description="Número de iteraciones ReAct (solo avanzado)")
    
    # Campos para orchestrator service
    streaming_data: Optional["ChatStreamingData"] = Field(None, description="Datos de streaming si aplica")
    is_streaming: bool = Field(default=False, description="Si la respuesta es streaming")
    error_data: Optional["ErrorData"] = Field(None, description="Datos de error si aplica")
    status: str = Field(default="completed", description="Estado de la respuesta")
    
    # Metadata expandido
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional de la respuesta")
    
    model_config = {"extra": "forbid"}


# =============================================================================
# RAG SPECIFIC
# =============================================================================

class RAGChunk(BaseModel):
    """Chunk encontrado en búsqueda RAG."""
    chunk_id: uuid.UUID
    content: str
    document_id: uuid.UUID
    collection_id: str  # Cambiado de UUID a str para aceptar collection_ids como 'col_XXXXXXX'
    similarity_score: float = Field(ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    model_config = {"extra": "forbid"}


class RAGSearchResult(BaseModel):
    """Resultado de búsqueda RAG."""
    chunks: List[RAGChunk]
    total_found: int
    search_time_ms: int
    
    model_config = {"extra": "forbid"}


# =============================================================================
# ORCHESTRATOR AUXILIARY MODELS
# =============================================================================

class ChatStreamingData(BaseModel):
    """Datos de streaming de chat para orchestrator service."""
    content: str = Field(..., description="Contenido del chunk")
    is_final: bool = Field(default=False, description="Si es el último chunk")
    chunk_index: int = Field(..., ge=0, description="Índice del chunk")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Timestamp del chunk")
    
    model_config = {"extra": "forbid"}


class ErrorData(BaseModel):
    """Datos de error específicos para chat."""
    error_code: str = Field(..., description="Código de error")
    error_message: str = Field(..., description="Mensaje de error")
    error_type: str = Field(..., description="Tipo de error")
    retry_possible: bool = Field(default=False, description="Si se puede reintentar")
    details: Optional[Dict[str, Any]] = Field(None, description="Detalles adicionales")
    
    model_config = {"extra": "forbid"}


# =============================================================================
# EMBEDDING MODELS (Compatible con OpenAI)
# =============================================================================

class EmbeddingRequest(BaseModel):
    """Request para embeddings (compatible con OpenAI)."""
    input: Union[str, List[str]] = Field(..., description="Texto o lista de textos")
    model: EmbeddingModel = Field(default=EmbeddingModel.TEXT_EMBEDDING_3_SMALL)
    dimensions: Optional[int] = Field(None, description="Dimensiones del vector (solo v3)")
    encoding_format: Literal["float", "base64"] = Field(default="float")
    
    model_config = {"extra": "forbid"}


class EmbeddingResponse(BaseModel):
    """Response de embeddings."""
    embeddings: List[List[float]] = Field(..., description="Vectores de embedding")
    model: str = Field(..., description="Modelo usado")
    dimensions: int = Field(..., description="Dimensiones de los vectores")
    usage: TokenUsage = Field(..., description="Uso de tokens")
    
    model_config = {"extra": "forbid"}

# =============================================================================
# CONVERSATION HISTORY
# =============================================================================

class ChatTask(BaseModel):
    """
    Modelo para representar una tarea específica dentro de una sesión de chat.
    Utilizado por el Orchestrator para rastrear el trabajo.
    """
    task_id: uuid.UUID = Field(..., description="ID único de la tarea")
    session_id: uuid.UUID = Field(..., description="ID de la sesión a la que pertenece")
    request_message: ChatMessage = Field(..., description="Mensaje original que inició la tarea")
    status: str = Field(default="pending", description="Estado de la tarea")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")

    def update_status(self, status: str):
        self.status = status
        self.updated_at = datetime.now(timezone.utc)

    model_config = {"extra": "forbid"}


class ConversationHistory(BaseModel):
    """
    Historial de conversación compatible con OpenAI/Groq.
    Mantiene máximo 5 mensajes para optimizar tokens.
    """
    conversation_id: uuid.UUID = Field(..., description="ID único de la conversación")
    tenant_id: uuid.UUID = Field(..., description="ID del tenant")
    session_id: uuid.UUID = Field(..., description="ID de la sesión")
    session_type: SessionType = Field(..., description="Tipo de sesión (chat, ingestion, etc.)")
    agent_id: uuid.UUID = Field(..., description="ID del agente")
    messages: List[ChatMessage] = Field(
        default_factory=list, 
        description="Mensajes de la conversación (máximo 5)"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_messages: int = Field(default=0, description="Contador total de mensajes")
    
    def add_message(self, message: ChatMessage) -> None:
        """Agrega mensaje manteniendo máximo 5."""
        self.messages.append(message)
        self.total_messages += 1
        if len(self.messages) > 5:
            self.messages.pop(0)  # Eliminar el más antiguo
        self.updated_at = datetime.now(timezone.utc)
    
    def to_chat_messages(self) -> List[ChatMessage]:
        """Retorna los mensajes en formato listo para ChatRequest."""
        return self.messages.copy()

    # --- Campos migrados de SessionState --- #
    user_id: Optional[uuid.UUID] = Field(None, description="ID del usuario (para ingestion)")
    connection_id: Optional[str] = Field(None, description="ID de conexión WebSocket actual")
    websocket_connected: bool = Field(default=False, description="Si hay WebSocket activo")
    active_task_id: Optional[uuid.UUID] = Field(None, description="Task actual en proceso")
    total_tasks: int = Field(default=0, description="Total de task_ids generados")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")
    
    model_config = {"extra": "forbid"}


# === WEBSOCKET MODELS === #

class OrchestratorMessageType(str, Enum):
    """Tipos de mensajes específicos del Orchestrator."""
    # Chat messages
    CHAT_INIT = "chat_init"
    CHAT_MESSAGE = "chat_message"
    CHAT_RESPONSE = "chat_response"
    CHAT_STREAMING = "chat_streaming"
    CHAT_COMPLETED = "chat_completed"
    CHAT_ERROR = "chat_error"
    
    # Task management
    TASK_CREATED = "task_created"
    TASK_STATUS = "task_status"
    TASK_CANCELLED = "task_cancelled"


# ChatWebSocketMessage removido - usar WebSocketMessage de common.websocket.models directamente
# con conversation_id en el campo data cuando sea necesario


# === API MODELS === #

class ChatInitRequest(BaseModel):
    """Request para inicializar una sesión de chat."""
    agent_id: uuid.UUID = Field(..., description="ID del agente")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata adicional")
    
    model_config = {"extra": "forbid"}


class ChatInitResponse(BaseModel):
    """Response de inicialización de sesión de chat."""
    session_id: uuid.UUID = Field(..., description="ID de la sesión creada")
    task_id: uuid.UUID = Field(..., description="ID de la primera tarea")
    websocket_url: str = Field(..., description="URL del WebSocket para conectarse")
    agent_name: str = Field(..., description="Nombre del agente")
    
    model_config = {"extra": "forbid"}