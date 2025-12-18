# CLAUDE.md - AI Assistant Guide for Nooble AI Platform

> **Last Updated:** 2025-11-14
> **Architecture Version:** v4.0
> **Target Audience:** AI Assistants (Claude, GPT, etc.)

This document provides comprehensive guidance for AI assistants working with the Nooble AI Platform codebase. It covers architecture, conventions, patterns, and workflows to help you navigate and contribute effectively.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Service Landscape](#service-landscape)
3. [Core Concepts & Patterns](#core-concepts--patterns)
4. [Development Workflows](#development-workflows)
5. [Code Conventions](#code-conventions)
6. [Common Tasks & Solutions](#common-tasks--solutions)
7. [Testing Guidelines](#testing-guidelines)
8. [Debugging & Troubleshooting](#debugging--troubleshooting)
9. [API Reference](#api-reference)
10. [Glossary](#glossary)

---

## Architecture Overview

### System Type
**Event-Driven Microservices Architecture** with the following characteristics:

- **Communication:** Redis Streams for async inter-service messaging
- **Real-time:** WebSockets for client communication
- **Database:** PostgreSQL (via Supabase), Qdrant (vector database)
- **Authentication:** Supabase Auth (JWT-based)
- **Deployment:** Docker Compose for development, containerized services

### High-Level Data Flow

```
User → Frontend (React) → Orchestrator Service (WebSocket/REST)
                              ↓
                        Redis Streams
                              ↓
                 ┌────────────┼────────────┐
                 ↓            ↓            ↓
        Execution Service  Query Service  Other Services
                 ↓            ↓            ↓
            Groq API    Qdrant Vector DB  PostgreSQL
```

### Complete Data Flow: Chat Initialization

Understanding the complete flow from frontend to DomainAction is critical for maintaining consistency:

```
1. Frontend Request
   ↓
   POST /api/v1/chat/init
   {
     "agent_id": "uuid-of-agent",        // Public agent ID
     "user_id": "uuid-of-visitor"        // Optional: authenticated visitor
   }

2. Orchestrator (chat_routes.py)
   ↓
   config_handler.get_public_agent_config(agent_id)

3. Supabase Query
   ↓
   SELECT * FROM agents_with_prompt
   WHERE id = :agent_id
     AND is_public = true
     AND is_active = true
   ↓
   Returns: {
     "id": "agent-uuid",
     "user_id": "owner-uuid",          // ← Owner of the agent (creator)
     "name": "My Agent",
     "query_config": {...},
     "rag_config": {...},
     ...
   }

4. AgentConfig Mapping (config_handler.py)
   ↓
   class AgentConfig(BaseModel):
       id: UUID
       tenant_id: UUID = Field(..., alias="user_id")  // ← CRITICAL MAPPING
       name: str
       ...
   ↓
   Result: tenant_id = agents.user_id (owner of agent)

5. DomainAction Creation
   ↓
   DomainAction(
       tenant_id=agent_config.tenant_id,  // = user_id of agent owner
       session_id=new_session_id,         // = visitor's session
       user_id=request.user_id,           // = visitor (optional)
       agent_id=agent_id,
       ...
   )
```

**Critical Understanding: tenant_id Semantics**

- `tenant_id` in DomainAction = `user_id` of the **agent owner** (creator)
- This enables **multi-tenancy based on agent ownership**, not visitor identity
- All data (conversations, documents) is isolated by `tenant_id` (agent owner)
- Visitors are identified by `session_id` (ephemeral) or `user_id` (if authenticated)

**Why This Design?**

1. **Agent Ownership**: Agents belong to creators (tenants), not visitors
2. **Data Isolation**: Each agent owner's data is completely isolated
3. **Public Agents**: Visitors can use public agents, but data belongs to owner
4. **CRM Context**: Conversations are grouped by agent owner for CRM/analytics

**Example Flow**:
```
- Alice creates Agent A (Alice is owner, tenant_id = Alice's user_id)
- Bob (visitor) chats with Agent A
- Conversation is saved with:
  - tenant_id = Alice's user_id (owner)
  - session_id = Bob's session
  - user_id = Bob's user_id (if authenticated) or null (if anonymous)
  - agent_id = Agent A's id
- Alice can see all conversations with her agents in CRM
- Bob can only see his own session (via session_id)
```

### Key Architectural Principles

1. **Separation of Concerns:** Each service has a single, well-defined responsibility
2. **Async Communication:** Services communicate via Redis Streams (not REST between services)
3. **Shared Common Library:** All Python services import from `/common` for consistency
4. **Worker Pattern:** Most services are worker-based (consume from queues) rather than API-driven
5. **Stateless Services:** Services don't maintain state; Redis and PostgreSQL provide persistence

---

## Service Landscape

### 🎯 Orchestrator Service (Port 8001)
**Type:** API + Worker
**Role:** Central coordinator for all chat sessions and task routing

**Key Responsibilities:**
- Expose REST API for chat initialization and task creation
- Manage WebSocket connections for real-time chat
- Route tasks to appropriate services via Redis Streams
- Handle async callbacks from execution services

**Important Files:**
- `orchestrator_service/main.py` - FastAPI app with lifespan management
- `orchestrator_service/services/orchestration_service.py` - Core orchestration logic
- `orchestrator_service/websocket/orchestrator_websocket_manager.py` - WebSocket connection pool
- `orchestrator_service/workers/callback_worker.py` - Background worker for async callbacks

**API Endpoints:**
```
POST   /api/v1/chat/init                 - Initialize chat session
POST   /api/v1/chat/{session_id}/task    - Create new task
GET    /api/v1/chat/{session_id}/status  - Get session status
DELETE /api/v1/chat/{session_id}         - Delete session
WS     /ws/chat/{session_id}             - WebSocket connection
```

### 🤖 Agent Execution Service (Port 8005)
**Type:** Worker-only
**Role:** Executes AI agent logic in two modes: Simple (Chat+RAG) and Advanced (ReAct with tools)

**Key Responsibilities:**
- Consume execution tasks from Redis Streams
- Execute AI agents using Groq API (LLM)
- Coordinate with Query Service for RAG operations
- Execute tools in Advanced mode (ReAct pattern)

**Important Files:**
- `agent_execution_service/workers/execution_worker.py` - Main worker
- `agent_execution_service/handlers/simple_chat_handler.py` - Simple chat mode
- `agent_execution_service/handlers/advance_chat_handler.py` - ReAct with tools
- `agent_execution_service/tools/` - Tool registry and implementations

**No REST API** - Pure worker service consuming from:
```
Stream: nooble4:dev:agent_execution_service:streams:main
```

### 🔍 Query Service (Port 8000)
**Type:** Worker-only
**Role:** Vector search and RAG (Retrieval-Augmented Generation)

**Key Responsibilities:**
- Perform semantic search on Qdrant vector database
- Generate context-enhanced responses using RAG
- Support 3 operational modes: Simple, RAG, and Advanced
- Manage search configurations and filtering

**Operational Modes:**

1. **Simple Mode** (`simple_handler.py`)
   - Direct LLM query without vector search
   - Fast responses for simple questions
   - No context from knowledge base
   - Use case: General chat, non-domain questions

2. **RAG Mode** (`rag_handler.py`)
   - Vector search + LLM generation
   - Retrieves relevant chunks from Qdrant
   - Augments prompt with retrieved context
   - Use case: Knowledge-based Q&A with context

3. **Advanced Mode** (`advance_handler.py`)
   - Multi-step RAG with query expansion
   - Advanced filtering and ranking
   - Hybrid search (dense + sparse)
   - Use case: Complex queries requiring deep knowledge

**Important Files:**
- `query_service/workers/query_worker.py` - Main worker
- `query_service/services/query_service.py` - Business logic orchestration
- `query_service/handlers/simple_handler.py` - Simple mode handler
- `query_service/handlers/rag_handler.py` - RAG mode handler
- `query_service/handlers/advance_handler.py` - Advanced mode handler
- `query_service/clients/groq_client.py` - Groq API client (LLM)
- `query_service/clients/qdrant_client.py` - Qdrant vector DB client
- `query_service/clients/embedding_client.py` - Embedding generation

**Mode Selection:**
Configured via `query_config.mode` in DomainAction:
```python
action = DomainAction(
    action_type="query.search.execute",
    query_config=QueryConfig(
        mode="rag",  # "simple", "rag", or "advanced"
        top_k=10,
        similarity_threshold=0.7
    ),
    data={"query": "What is RAG?"}
)
```

**Consumes from:**
```
Stream: nooble4:dev:query_service:streams:main
```

### 🧠 Embedding Service (Port 8006)
**Type:** Worker-only
**Role:** Generate vector embeddings for text chunks

**Key Responsibilities:**
- Generate embeddings using OpenAI API
- Process batches of text for vectorization
- Send embeddings back to ingestion service

**Important Files:**
- `embedding_service/workers/embedding_worker.py` - Main worker
- `embedding_service/clients/openai_client.py` - OpenAI API wrapper

### 📥 Ingestion Service (Port 8002)
**Type:** API + Worker
**Role:** Document ingestion, chunking, and vectorization pipeline

**Key Responsibilities:**
- Accept document uploads via REST API (authenticated)
- Chunk documents into semantic pieces
- Coordinate with embedding service for vectorization
- Store vectors in Qdrant
- Provide real-time progress via WebSocket

**API Endpoints:**
```
POST /api/v1/ingest            - Upload document (multipart/form-data)
WS   /ws/ingest/{job_id}       - Progress updates
```

### 💾 Conversation Service (Port 8004)
**Type:** Worker-only
**Role:** Persist chat conversations to PostgreSQL for CRM and history

**Key Responsibilities:**
- Store conversation metadata and messages
- Maintain conversation state (active/ended)
- Provide data for analytics and CRM views

**Database Schema:**
```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN,
  message_count INTEGER
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations,
  role VARCHAR(20) CHECK (role IN ('user', 'assistant')),
  content TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
);
```

### 🎨 Frontend Service (Port 5173)
**Type:** React SPA
**Role:** User interface for Nooble AI platform

**Tech Stack:**
- React 19 + TypeScript
- Vite (build tool)
- TanStack Router (file-based routing)
- TanStack Query (server state)
- Supabase JS (auth + data)
- shadcn/ui + Radix UI (components)
- Tailwind CSS (styling)
- Zustand (client state)

**Key Features:**
- `/auth` - Authentication flows
- `/conversations` - Chat interface
- `/insights` - Analytics dashboards
- `/my-nooble` - User workspace
- `/public-profile` - Public profiles
- `/settings` - User settings

**Important Directories:**
- `src/api/` - API client modules
- `src/features/` - Feature-based organization
- `src/components/` - Shared UI components
- `src/hooks/` - Custom React hooks
- `src/routes/` - TanStack Router routes
- `src/stores/` - Zustand stores
- `src/types/` - TypeScript type definitions
- `src/context/` - React contexts
- `src/config/` - Configuration files
- `src/lib/` - Utility libraries

### 🏗️ Infrastructure Services

The platform uses a complete **Supabase stack** + additional infrastructure:

#### Supabase Services

**1. Kong (API Gateway)** - Port 8000, 8443
- Routes all Supabase API requests
- Handles authentication
- Rate limiting and analytics
- HTTPS termination (8443)

**2. GoTrue (Auth Service)**
- User authentication and management
- Email/phone authentication
- JWT token generation
- Magic links and OTP

**3. PostgREST (REST API)**
- Auto-generated REST API from PostgreSQL schema
- Row-level security (RLS)
- Query API with filtering

**4. PostgreSQL Database** - Port 5432 (internal)
- Primary data store
- User data, conversations, profiles
- RLS policies for multi-tenancy

**5. Supavisor (Database Pooler)** - Port 6543
- Connection pooling (transaction mode)
- Reduces database connection overhead
- Configurable pool sizes

**6. Storage API**
- Object storage for files
- Image transformations
- CDN integration

**7. Realtime Service**
- WebSocket-based real-time subscriptions
- Database change notifications
- Presence and broadcast features

**8. Meta Service**
- Schema management
- Migration running
- Database introspection

**9. Functions Service**
- Edge functions runtime
- TypeScript/JavaScript support
- Custom API endpoints

**10. Studio** - Port 8082
- Web-based admin dashboard
- Database editor
- Auth management
- Storage browser

**11. Analytics Service** - Port 4000
- Query analytics
- Performance monitoring
- Usage metrics

**12. ImgProxy**
- Image optimization
- On-the-fly transformations
- WebP support

#### Additional Infrastructure

**13. Redis** - Port 6379 (internal)
- Inter-service message broker (Redis Streams)
- Caching layer
- Session storage
- Callback queues

**14. Qdrant** - Ports 6333 (HTTP), 6334 (gRPC)
- Vector database
- Semantic search
- Document embeddings storage
- Multi-tenant collections

**15. Caddy** - Ports 80, 443
- Reverse proxy
- Automatic HTTPS
- Load balancing

**Infrastructure Architecture:**
```
Internet → Caddy (80/443) → Kong (8000/8443) → Backend Services
                                              ↓
                                         PostgreSQL
                                              ↓
                                      Application Services
                                       ↓     ↓     ↓
                                    Redis  Qdrant  Supabase
```

**Key Points:**
- All Supabase services are managed via docker-compose
- Redis and Qdrant are **not** exposed externally (internal network only)
- Frontend connects to Kong for all Supabase operations
- Backend services use SERVICE_ROLE_KEY for privileged access

---

## Core Concepts & Patterns

### 1. DomainAction - Universal Message Format

All inter-service communication uses `DomainAction` (defined in `common/models/actions.py`):

```python
class DomainAction(BaseModel):
    # Unique identifiers
    action_id: UUID              # Unique ID for this action instance
    action_type: str             # Format: "service.entity.verb" (e.g., "embedding.document.process")
    timestamp: datetime          # UTC timestamp

    # Business context (REQUIRED)
    tenant_id: UUID              # Multi-tenant ID
    session_id: UUID             # User session/conversation ID
    task_id: UUID                # High-level task ID
    user_id: Optional[UUID]      # User who initiated (optional for system actions)
    agent_id: Optional[UUID]     # Associated agent (optional)

    # Tracing
    origin_service: str          # Service that created this action
    correlation_id: Optional[UUID]  # For request/response linking
    trace_id: Optional[UUID]     # Distributed tracing ID

    # Callback mechanism
    callback_queue_name: Optional[str]       # Where to send response (Redis List)
    callback_action_type: Optional[str]      # For async callbacks (new DomainAction)

    # Service-specific configs
    execution_config: Optional[ExecutionConfig]
    query_config: Optional[QueryConfig]
    rag_config: Optional[RAGConfig]

    # Payload
    data: Dict[str, Any]         # Actual data for the action
    metadata: Optional[Dict[str, Any]]  # Optional metadata
```

**Action Type Convention:**
```
Format: "{target_service}.{entity}.{verb}"

Examples:
- "embedding.document.process"      → Routes to embedding_service
- "query.search.execute"            → Routes to query_service
- "orchestrator.execution_callback" → Routes to orchestrator_service callbacks
```

### 2. Worker Pattern

All backend services (except Orchestrator and Ingestion) use the **BaseWorker** pattern:

```python
from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

class MyWorker(BaseWorker):
    async def initialize(self):
        """Initialize service components (called once on startup)"""
        await super().initialize()
        # Initialize your service layer here
        self.service = MyService()

    async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Handle incoming DomainAction.

        Returns:
        - Dict: For actions requiring response or callback
        - None: For fire-and-forget actions

        Raises:
        - Exception: For errors (auto-handled by BaseWorker)
        """
        # Route based on action_type
        if action.action_type == "myservice.entity.process":
            return await self._handle_process(action)

        raise ValueError(f"Unknown action type: {action.action_type}")
```

**Key Features of BaseWorker:**
- Consumes from Redis Streams using consumer groups
- Automatic message deserialization to `DomainAction`
- Error handling with dead-letter semantics
- ACK/NACK management
- Structured logging with correlation IDs
- Support for both pseudo-synchronous and async callback patterns

### 2.1 Three-Layer Architecture

The codebase follows a **clean architecture pattern** with three distinct layers:

```
┌─────────────────────────────────────────────────┐
│           1. WORKER LAYER                       │
│  (Infrastructure - Redis Stream Consumer)       │
│  - BaseWorker: Consumes DomainActions          │
│  - Message deserialization & ACK/NACK          │
│  - Error handling & logging                     │
└─────────────────┬───────────────────────────────┘
                  │ calls
                  ↓
┌─────────────────────────────────────────────────┐
│           2. SERVICE LAYER                      │
│  (Business Logic Orchestration)                 │
│  - BaseService: Implements process_action()    │
│  - Orchestrates business logic                  │
│  - Coordinates multiple Handlers               │
└─────────────────┬───────────────────────────────┘
                  │ uses
                  ↓
┌─────────────────────────────────────────────────┐
│           3. HANDLER LAYER                      │
│  (Domain-Specific Components)                   │
│  - BaseHandler: Specialized components         │
│  - External API interactions                    │
│  - Database operations                          │
│  - Business logic components                    │
└─────────────────────────────────────────────────┘
```

#### Layer 1: BaseWorker (Infrastructure)

**Location:** `common/workers/base_worker.py`

**Responsibility:** Handle messaging infrastructure

```python
from common.workers.base_worker import BaseWorker

class MyServiceWorker(BaseWorker):
    async def initialize(self):
        await super().initialize()
        # Initialize Service layer
        self.service = MyServiceService(
            app_settings=self.app_settings,
            service_redis_client=self.redis_client
        )

    async def _handle_action(self, action: DomainAction):
        # Delegate to Service layer
        return await self.service.process_action(action)
```

**Key Methods:**
- `initialize()` - Setup service components
- `_handle_action(action)` - Route to service layer
- `run()` - Start consuming messages

#### Layer 2: BaseService (Business Logic)

**Location:** `common/services/base_service.py`

**Responsibility:** Orchestrate business logic using Handlers

```python
from common.services.base_service import BaseService

class MyServiceService(BaseService):
    def __init__(self, app_settings, service_redis_client):
        super().__init__(app_settings, service_redis_client)

        # Initialize Handlers
        self.data_handler = DataHandler(app_settings)
        self.api_handler = APIHandler(app_settings)

    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """Main entry point from Worker."""

        if action.action_type == "myservice.data.process":
            # Use handlers to perform business logic
            validated_data = await self.data_handler.validate(action.data)
            result = await self.api_handler.send(validated_data)
            return {"result": result}

        raise ValueError(f"Unknown action type: {action.action_type}")
```

**Key Features:**
- Abstract method `process_action()` must be implemented
- Receives `app_settings`, `service_redis_client`, `direct_redis_conn`
- Can send actions to other services via `service_redis_client`
- Coordinates multiple Handlers

#### Layer 3: BaseHandler (Domain Components)

**Location:** `common/handlers/base_handler.py`

**Responsibility:** Encapsulate specific domain logic

```python
from common.handlers.base_handler import BaseHandler

class APIHandler(BaseHandler):
    def __init__(self, app_settings):
        super().__init__(app_settings)
        self.api_client = SomeAPIClient()

    async def send(self, data: Dict[str, Any]) -> str:
        """Send data to external API."""
        self._logger.info("Sending data to API")
        response = await self.api_client.post("/endpoint", data)
        return response.json()
```

**Key Features:**
- Provides `self._logger` (configured logger)
- Provides `self.app_settings` (configuration)
- Optional `direct_redis_conn` for Redis operations
- No abstract methods - handlers define their own interface

#### Example: Complete Service Implementation

```python
# 1. Worker (ingestion_service/workers/embedding_callback_worker.py)
class EmbeddingCallbackWorker(BaseWorker):
    async def initialize(self):
        await super().initialize()
        self.service = IngestionService(
            app_settings=self.app_settings,
            service_redis_client=self.redis_client
        )

    async def _handle_action(self, action: DomainAction):
        return await self.service.process_action(action)

# 2. Service (ingestion_service/services/ingestion_service.py)
class IngestionService(BaseService):
    def __init__(self, app_settings, service_redis_client):
        super().__init__(app_settings, service_redis_client)

        # Initialize handlers
        self.document_handler = DocumentHandler(app_settings)
        self.qdrant_handler = QdrantHandler(app_settings)
        self.embedding_handler = EmbeddingHandler(app_settings)

    async def process_action(self, action: DomainAction):
        if action.action_type == "ingestion.document.upload":
            # Orchestrate using handlers
            chunks = await self.document_handler.chunk_document(action.data)
            embeddings = await self.embedding_handler.request_embeddings(chunks)
            await self.qdrant_handler.store_vectors(embeddings)
            return {"status": "completed", "chunks": len(chunks)}

# 3. Handlers (ingestion_service/handlers/document_handler.py)
class DocumentHandler(BaseHandler):
    async def chunk_document(self, data: Dict[str, Any]) -> List[str]:
        """Split document into semantic chunks."""
        self._logger.info("Chunking document")
        # Business logic for chunking
        return chunks
```

**Benefits of This Architecture:**

1. **Separation of Concerns:** Each layer has a single responsibility
2. **Testability:** Layers can be tested in isolation
3. **Reusability:** Handlers can be shared across services
4. **Maintainability:** Business logic is centralized in Service layer
5. **Flexibility:** Easy to swap implementations of Handlers

### 3. Communication Patterns

#### Pattern A: Fire-and-Forget
```python
# Sender
action = DomainAction(
    action_type="conversation.message.save",
    tenant_id=tenant_id,
    session_id=session_id,
    task_id=task_id,
    origin_service="orchestrator",
    data={"message": "Hello"},
    callback_queue_name=None  # No response expected
)
await redis_client.send_action(action)
```

#### Pattern B: Pseudo-Synchronous (Request-Response)
```python
# Sender
action = DomainAction(
    action_type="query.search.execute",
    tenant_id=tenant_id,
    session_id=session_id,
    task_id=task_id,
    origin_service="orchestrator",
    correlation_id=uuid.uuid4(),  # REQUIRED for linking
    callback_queue_name=f"nooble4:dev:orchestrator:responses:{session_id}",
    callback_action_type=None,  # Indicates pseudo-sync
    data={"query": "What is RAG?"}
)
await redis_client.send_action(action)

# Wait for response on callback queue
response_json = await redis.brpop(callback_queue_name, timeout=30)
response = DomainActionResponse.model_validate_json(response_json)
```

#### Pattern C: Async Callback (Continuation)
```python
# Sender
action = DomainAction(
    action_type="embedding.document.process",
    tenant_id=tenant_id,
    session_id=session_id,
    task_id=task_id,
    origin_service="ingestion",
    callback_queue_name=f"nooble4:dev:ingestion-callbacks:streams:main",
    callback_action_type="ingestion.embedding_callback",  # New DomainAction
    data={"chunks": [...]}
)
await redis_client.send_action(action)

# Worker sends new DomainAction as callback (not DomainActionResponse)
```

### 4. Stream and Queue Naming

**Redis Stream Naming Convention:**
```
Format: {prefix}:{environment}:{service_name}:{type}:{context}

Examples:
- nooble4:dev:agent_execution_service:streams:main
- nooble4:dev:query_service:streams:main
- nooble4:dev:ingestion-callbacks:streams:main
- nooble4:dev:orchestrator:responses:chat_task:uuid-123
```

**Generated by QueueManager:**
```python
from common.clients.queue_manager import QueueManager

queue_manager = QueueManager(environment="dev")
stream_name = queue_manager.get_service_action_stream("query_service")
# Returns: "nooble4:dev:query_service:streams:main"
```

### 5. Configuration Management

All services use **Pydantic Settings** with `.env` file support:

```python
from common.config.base_settings import CommonAppSettings

class MyServiceSettings(CommonAppSettings):
    service_name: str = "my_service"
    service_version: str = "1.0.0"

    # Service-specific settings
    my_custom_setting: str = "default_value"

    # Inherits from CommonAppSettings:
    # - Redis configuration
    # - Qdrant configuration
    # - OpenAI API key
    # - Groq API key
    # - Supabase settings
    # - CORS settings

settings = MyServiceSettings()  # Auto-loads from .env
```

**Environment Variables (`.env`):**

The system requires 80+ environment variables organized in the following sections:

#### Microservices Configuration
```bash
# Query Service
GROQ_API_KEY=your-groq-api-key

# Embedding Service
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=                        # Optional: custom OpenAI endpoint
```

#### CORS Configuration
```bash
CORS_ORIGINS='["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]'
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS='["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]'
CORS_ALLOW_HEADERS='["*"]'
```

#### Redis Configuration
```bash
REDIS_URL="redis://:nooble_redis_pass@redis_database:6379/0"
REDIS_PASSWORD=nooble_redis_pass
REDIS_DECODE_RESPONSES=True
REDIS_SOCKET_CONNECT_TIMEOUT=5
REDIS_SOCKET_KEEPALIVE=True
REDIS_MAX_CONNECTIONS=50
REDIS_HEALTH_CHECK_INTERVAL=30
REDIS_HOST=redis_database
REDIS_PORT=6379
```

#### Qdrant Configuration
```bash
QDRANT_HOST=qdrant_database
QDRANT_HTTP_PORT=6333
QDRANT_GRPC_PORT=6334
QDRANT_URL="http://${QDRANT_HOST}:${QDRANT_HTTP_PORT}"
QDRANT_API_KEY=                         # Optional: API key for Qdrant Cloud
```

#### Supabase Secrets
```bash
POSTGRES_PASSWORD=your-postgres-password
JWT_SECRET=your-jwt-secret
ANON_KEY=your-anon-key
SERVICE_ROLE_KEY=your-service-role-key
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=your-dashboard-password
SECRET_KEY_BASE=your-secret-key-base
VAULT_ENC_KEY=your-vault-encryption-key
```

#### Supabase Database
```bash
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
# Default user is postgres
```

#### Supabase Supavisor (Database Pooler)
```bash
POOLER_PROXY_PORT_TRANSACTION=6543     # Transaction pooling port
POOLER_DEFAULT_POOL_SIZE=20            # Max PostgreSQL connections per pool
POOLER_MAX_CLIENT_CONN=100             # Max client connections per pool
POOLER_TENANT_ID=your-tenant-id        # Unique tenant identifier
POOLER_DB_POOL_SIZE=5                  # Metadata storage pool size
```

#### Supabase API Proxy (Kong)
```bash
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
```

#### Supabase API (PostgREST)
```bash
PGRST_DB_SCHEMAS=public,storage,graphql_public
```

#### Supabase Auth (GoTrue)
```bash
# General
SITE_URL=http://localhost:3000
ADDITIONAL_REDIRECT_URLS=
JWT_EXPIRY=3600
DISABLE_SIGNUP=false
API_EXTERNAL_URL=http://nooble.ai/goapi

# Mailer Config
MAILER_URLPATHS_CONFIRMATION="/auth/v1/verify"
MAILER_URLPATHS_INVITE="/auth/v1/verify"
MAILER_URLPATHS_RECOVERY="/auth/v1/verify"
MAILER_URLPATHS_EMAIL_CHANGE="/auth/v1/verify"

# Email Auth
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=supabase-mail
SMTP_PORT=2500
SMTP_USER=fake_mail_user
SMTP_PASS=fake_mail_password
SMTP_SENDER_NAME=fake_sender
ENABLE_ANONYMOUS_USERS=false

# Phone Auth
ENABLE_PHONE_SIGNUP=true
ENABLE_PHONE_AUTOCONFIRM=true
```

#### Supabase Studio
```bash
STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=Default Project
STUDIO_PORT=3000
SUPABASE_PUBLIC_URL=http://nooble.ai
IMGPROXY_ENABLE_WEBP_DETECTION=true
OPENAI_API_KEY=                         # For SQL Editor Assistant
```

#### Supabase Functions
```bash
FUNCTIONS_VERIFY_JWT=false              # JWT verification for all functions
```

#### Supabase Logs & Analytics
```bash
LOGFLARE_PUBLIC_ACCESS_TOKEN=your-logflare-key-public
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-logflare-key-private
DOCKER_SOCKET_LOCATION=/var/run/docker.sock
GOOGLE_PROJECT_ID=GOOGLE_PROJECT_ID
GOOGLE_PROJECT_NUMBER=GOOGLE_PROJECT_NUMBER
```

#### Proxy Authentication
```bash
PROXY_AUTH_USERNAME=nooble
PROXY_AUTH_PASSWORD='$2y$12$...'       # BCrypt hashed password
```

**Critical Variables:**
- `GROQ_API_KEY` - Required for Query Service (LLM)
- `OPENAI_API_KEY` - Required for Embedding Service
- `REDIS_URL` - Required for all services (inter-service communication)
- `JWT_SECRET` - Required for authentication (must match across all services)
- `SERVICE_ROLE_KEY` - Required for backend services to access Supabase

**Optional Variables:**
- `QDRANT_API_KEY` - Only needed if using Qdrant Cloud
- `OPENAI_BASE_URL` - Only if using custom OpenAI-compatible endpoint
- Analytics variables - Only if using Supabase Analytics

### 6. Common Library Structure

The `/common` directory is mounted into all Python services:

```
common/
├── clients/                       # Redis, HTTP, queue management
│   ├── __init__.py
│   ├── base_http_client.py       # HTTP client base
│   ├── base_redis_client.py      # Redis client for inter-service communication
│   ├── queue_manager/
│   │   ├── __init__.py
│   │   └── queue_manager.py      # Stream/queue naming conventions
│   └── redis/
│       ├── __init__.py
│       ├── cache_key_manager.py  # Cache key generation
│       ├── cache_manager.py      # Caching operations
│       ├── redis_manager.py      # Redis connection management
│       └── redis_state_manager.py # State management
│
├── config/                        # Shared configuration
│   ├── __init__.py
│   ├── base_settings.py          # CommonAppSettings (Redis, Qdrant, APIs)
│   └── service_settings/         # Service-specific settings
│       ├── __init__.py
│       ├── agent_execution.py
│       ├── embedding.py
│       └── query.py
│
├── errors/                        # Custom exceptions
│   ├── __init__.py
│   └── exceptions.py             # ServiceError, ValidationError, etc.
│
├── handlers/                      # Base handler implementation (Layer 3)
│   ├── __init__.py
│   └── base_handler.py           # BaseHandler for domain components
│
├── models/                        # Data models
│   ├── __init__.py
│   ├── actions.py                # DomainAction, DomainActionResponse
│   ├── chat_models.py            # Chat-related models
│   └── config_models.py          # ExecutionConfig, QueryConfig, RAGConfig
│
├── services/                      # Base service implementation (Layer 2)
│   ├── __init__.py
│   └── base_service.py           # BaseService with process_action()
│
├── supabase/                      # Supabase client wrapper
│   ├── __init__.py
│   ├── auth.py                   # Authentication helpers
│   ├── cache.py                  # Supabase caching layer
│   ├── client.py                 # SupabaseClient wrapper
│   ├── models.py                 # Supabase-related models
│   └── types.py                  # Type definitions
│
├── tiers/                         # Multi-tier subscription system
│   ├── __init__.py
│   ├── exceptions.py             # TierLimitExceededError
│   ├── clients/
│   │   ├── __init__.py
│   │   └── tier_client.py        # TierClient for tier operations
│   ├── decorators/
│   │   ├── __init__.py
│   │   └── validate_tier.py      # @validate_tier decorator
│   ├── models/
│   │   ├── __init__.py
│   │   ├── tier_config.py        # TierConfig, TierLimits, AllTiersConfig
│   │   └── usage_models.py       # UsageRecord, TenantUsage
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── tier_repository.py    # TierRepository for data access
│   └── services/
│       ├── __init__.py
│       ├── usage_service.py      # TierUsageService
│       └── validation_service.py # TierValidationService
│
├── utils/                         # Utilities
│   ├── __init__.py
│   └── logging.py                # Structured logging setup
│
├── websocket/                     # WebSocket abstractions
│   ├── __init__.py
│   ├── base_websocket_manager.py # BaseWebSocketManager
│   ├── models.py                 # WebSocketMessage, ConnectionInfo, WebSocketError
│   └── protocols.py              # WebSocket protocols
│
└── workers/                       # Base worker implementation (Layer 1)
    ├── __init__.py
    └── base_worker.py            # BaseWorker for Redis Stream consumption
```

**Key Components:**

- **clients/**: Infrastructure clients for Redis, HTTP, and queue management
- **config/**: Shared and service-specific configuration using Pydantic Settings
- **errors/**: Custom exception hierarchy
- **handlers/**: BaseHandler for Layer 3 (domain-specific components)
- **models/**: Pydantic models for DomainAction, chat, and configurations
- **services/**: BaseService for Layer 2 (business logic orchestration)
- **supabase/**: Supabase integration (auth, client, caching)
- **tiers/**: Complete multi-tier subscription system with validation
- **utils/**: Utilities like structured logging
- **websocket/**: WebSocket manager, models, and protocols
- **workers/**: BaseWorker for Layer 1 (Redis Stream consumption)

### 7. Logging Standards

All services use **structured logging** with correlation IDs:

```python
import logging
from common.utils.logging import init_logging

# Initialize at service startup
init_logging(service_name="my_service", log_level="INFO")

logger = logging.getLogger(__name__)

# Log with context
log_extra = {
    "action_id": str(action.action_id),
    "action_type": action.action_type,
    "tenant_id": str(action.tenant_id),
    "session_id": str(action.session_id),
    "task_id": str(action.task_id)
}
logger.info("Processing action", extra=log_extra)
```

**Or use built-in method:**
```python
logger.info("Processing action", extra=action.get_log_extra())
```

### 8. WebSocket Models & Patterns

The platform provides standardized WebSocket models in `common/websocket/models.py`:

#### WebSocketMessageType (Enum)

Predefined message types for WebSocket communication:

```python
from common.websocket.models import WebSocketMessageType

class WebSocketMessageType(str, Enum):
    # Connection management
    CONNECTION_ACK = "connection_ack"    # Connection acknowledged
    PING = "ping"                        # Heartbeat request
    PONG = "pong"                        # Heartbeat response
    ERROR = "error"                      # Error occurred

    # Generic message types
    MESSAGE = "message"                  # Generic message
    RESPONSE = "response"                # Response to request
    STREAMING = "streaming"              # Streaming chunk
    PROGRESS = "progress"                # Progress update
    COMPLETE = "complete"                # Operation complete
```

#### WebSocketMessage (Base Model)

Standard message format for all WebSocket communications:

```python
from common.websocket.models import WebSocketMessage

# Send message
message = WebSocketMessage(
    message_type=WebSocketMessageType.STREAMING,
    session_id=session_id,
    task_id=task_id,
    data={
        "content": "AI response chunk",
        "chunk_index": 1
    }
)

await websocket.send_text(message.model_dump_json())
```

**Fields:**
- `message_id` (UUID): Auto-generated unique identifier
- `message_type` (WebSocketMessageType | str): Type of message
- `timestamp` (datetime): UTC timestamp (auto-generated)
- `data` (Optional[Dict]): Message payload
- `session_id` (Optional[UUID]): Session context
- `task_id` (Optional[UUID]): Task context

#### ConnectionInfo (Model)

Tracks WebSocket connection metadata:

```python
from common.websocket.models import ConnectionInfo

connection_info = ConnectionInfo(
    connection_id=str(uuid.uuid4()),
    connection_type="chat",  # "chat" or "ingestion"
    is_authenticated=True,
    user_id=user_id,
    tenant_id=tenant_id,
    session_id=session_id,
    agent_id=agent_id
)
```

**Fields:**
- `connection_id` (str): Unique connection identifier
- `connection_type` (Literal["chat", "ingestion"]): Connection purpose
- `connected_at` (datetime): Connection timestamp
- `last_activity` (datetime): Last message timestamp
- `is_authenticated` (bool): Authentication status
- `user_id`, `tenant_id`, `session_id`, `agent_id`: Context identifiers

#### WebSocketError (Model)

Structured error messages:

```python
from common.websocket.models import WebSocketError

error = WebSocketError(
    error_code="RATE_LIMIT_EXCEEDED",
    error_message="Too many requests. Please wait.",
    error_type="rate_limit",
    details={"retry_after": 60}
)

# Send error to client
await websocket.send_text(WebSocketMessage(
    message_type=WebSocketMessageType.ERROR,
    data=error.model_dump()
).model_dump_json())
```

**Error Types:**
- `auth`: Authentication/authorization errors
- `validation`: Invalid message format
- `rate_limit`: Rate limiting
- `internal`: Server errors
- `not_found`: Resource not found

#### Example: Service-Specific WebSocket Manager

```python
from common.websocket.base_websocket_manager import BaseWebSocketManager
from common.websocket.models import WebSocketMessage, WebSocketMessageType, ConnectionInfo

class MyChatWebSocketManager(BaseWebSocketManager):
    async def handle_message(self, websocket, message_data: dict):
        """Handle incoming WebSocket message."""
        try:
            # Parse incoming message
            user_message = message_data.get("content")

            # Send acknowledgment
            ack = WebSocketMessage(
                message_type=WebSocketMessageType.CONNECTION_ACK,
                session_id=self.session_id,
                data={"status": "received"}
            )
            await websocket.send_text(ack.model_dump_json())

            # Process and stream response
            for chunk in process_chat(user_message):
                stream_msg = WebSocketMessage(
                    message_type=WebSocketMessageType.STREAMING,
                    session_id=self.session_id,
                    data={"content": chunk}
                )
                await websocket.send_text(stream_msg.model_dump_json())

            # Send completion
            complete = WebSocketMessage(
                message_type=WebSocketMessageType.COMPLETE,
                session_id=self.session_id
            )
            await websocket.send_text(complete.model_dump_json())

        except Exception as e:
            # Send error
            error = WebSocketError(
                error_code="PROCESSING_ERROR",
                error_message=str(e),
                error_type="internal"
            )
            await websocket.send_text(WebSocketMessage(
                message_type=WebSocketMessageType.ERROR,
                data=error.model_dump()
            ).model_dump_json())
```

**Best Practices:**
1. Always use `WebSocketMessage` for consistent formatting
2. Include `session_id` and `task_id` for traceability
3. Send acknowledgments for received messages
4. Use appropriate `message_type` for different scenarios
5. Handle errors gracefully with `WebSocketError`
6. Implement heartbeat (PING/PONG) for connection health
7. Track connections with `ConnectionInfo`

---

## Development Workflows

### Setting Up the Development Environment

1. **Clone Repository:**
```bash
git clone <repository-url>
cd nooble11
```

2. **Create `.env` file:**
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Start All Services:**
```bash
docker compose up --build
```

4. **Start Individual Service:**
```bash
docker compose up orchestrator_service
docker compose up query_service
```

5. **Scale Workers:**
```bash
docker compose up --scale query_service=3
```

6. **View Logs:**
```bash
docker compose logs -f orchestrator_service
docker compose logs -f query_service
```

### Frontend Development

```bash
cd frontend_service
npm install
npm run dev                 # Development server
npm run build               # Production build
npm run lint                # Run ESLint
npm run format              # Run Prettier
```

### Adding a New Service

1. **Create Service Directory:**
```bash
mkdir {service_name}_service
cd {service_name}_service
```

2. **Create Required Files:**
```
{service_name}_service/
├── __init__.py
├── main.py                    # Entry point
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container definition
├── workers/
│   ├── __init__.py
│   └── {service_name}_worker.py
├── services/
│   ├── __init__.py
│   └── {service_name}_service.py
└── handlers/
    ├── __init__.py
    └── {service_name}_handler.py
```

3. **Implement Worker:**
```python
# workers/{service_name}_worker.py
from common.workers.base_worker import BaseWorker
from common.models.actions import DomainAction

class MyServiceWorker(BaseWorker):
    async def initialize(self):
        await super().initialize()
        # Initialize service layer
        from ..services.my_service_service import MyServiceService
        self.service = MyServiceService(self.app_settings)

    async def _handle_action(self, action: DomainAction):
        if action.action_type == "myservice.entity.process":
            result = await self.service.process(action.data)
            return result  # Return dict or None

        raise ValueError(f"Unknown action type: {action.action_type}")
```

4. **Create main.py:**
```python
# main.py
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from common.config.base_settings import CommonAppSettings
from common.clients.redis.redis_manager import RedisManager
from .workers.my_service_worker import MyServiceWorker

settings = CommonAppSettings(service_name="my_service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    redis_manager = RedisManager(settings)
    redis_client = await redis_manager.get_client()

    worker = MyServiceWorker(
        app_settings=settings,
        async_redis_conn=redis_client
    )
    await worker.initialize()

    worker_task = asyncio.create_task(worker.run())

    yield

    # Shutdown
    await worker.stop()
    await redis_manager.close()

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

5. **Create Dockerfile:**
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Copy requirements
COPY {service_name}_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY {service_name}_service /app/{service_name}_service
COPY common /app/common

# Set Python path
ENV PYTHONPATH=/app

EXPOSE 8XXX

CMD ["uvicorn", "{service_name}_service.main:app", "--host", "0.0.0.0", "--port", "8XXX"]
```

6. **Add to docker-compose.yml:**
```yaml
{service_name}_service:
  build:
    context: .
    dockerfile: {service_name}_service/Dockerfile
  container_name: {service_name}_service
  ports:
    - "8XXX:8XXX"
  env_file:
    - .env
  environment:
    - PYTHONUNBUFFERED=1
  depends_on:
    - redis_database
  networks:
    - nooble-network
  restart: unless-stopped
```

### Making Changes to Common Library

**IMPORTANT:** Changes to `/common` affect ALL services!

1. **Test Changes Locally:**
```bash
# Restart affected services
docker compose restart orchestrator_service query_service
```

2. **Verify No Breaking Changes:**
```bash
# Check all services start successfully
docker compose ps
docker compose logs
```

3. **Update All Services:**
Since `/common` is shared, changes are immediately reflected in all running containers.

### Working with Frontend

#### Adding a New Feature

1. **Create Feature Directory:**
```
src/features/my-feature/
├── components/           # Feature-specific components
├── hooks/                # Feature-specific hooks
├── api/                  # API calls for this feature
└── types.ts              # TypeScript types
```

2. **Create Route:**
```tsx
// src/routes/my-feature/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/my-feature')({
  component: MyFeatureComponent,
})

function MyFeatureComponent() {
  return <div>My Feature</div>
}
```

3. **Add API Client:**
```typescript
// src/api/my-feature-api.ts
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8001'

export const myFeatureApi = {
  async getData(id: string) {
    const response = await axios.get(`${BASE_URL}/api/v1/my-feature/${id}`)
    return response.data
  },
}
```

4. **Use TanStack Query:**
```typescript
// In component
import { useQuery } from '@tanstack/react-query'
import { myFeatureApi } from '@/api/my-feature-api'

function MyComponent({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-feature', id],
    queryFn: () => myFeatureApi.getData(id),
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{JSON.stringify(data)}</div>
}
```

---

## Code Conventions

### Python Conventions

#### Naming
```python
# Variables and functions: snake_case
user_id = "123"
def process_message():
    pass

# Classes: PascalCase
class MessageHandler:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_RETRIES = 3
REDIS_TIMEOUT = 30
```

#### Type Hints
```python
from typing import Optional, Dict, List, Any
import uuid

def process_data(
    user_id: uuid.UUID,
    data: Dict[str, Any],
    options: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Process data for a user.

    Args:
        user_id: UUID of the user
        data: Input data dictionary
        options: Optional list of processing options

    Returns:
        Processed data dictionary

    Raises:
        ValueError: If data is invalid
    """
    if not data:
        raise ValueError("Data cannot be empty")

    return {"result": "processed"}
```

#### Pydantic Models
```python
from pydantic import BaseModel, Field
import uuid

class MyModel(BaseModel):
    """Model description."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str = Field(..., description="Entity name")
    count: int = Field(default=0, ge=0, description="Count must be >= 0")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    class Config:
        # Pydantic v1 style
        extra = "allow"
        validate_assignment = True
```

#### Error Handling
```python
from common.errors.exceptions import ServiceError

try:
    result = await risky_operation()
except redis.RedisError as e:
    logger.error(f"Redis error: {e}", extra=action.get_log_extra())
    raise ServiceError(f"Failed to connect to Redis: {e}")
except Exception as e:
    logger.critical(f"Unexpected error: {e}", exc_info=True)
    raise
```

#### Async/Await
```python
# Always use async/await for I/O operations
async def fetch_data():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com")
        return response.json()

# Use asyncio.gather for parallel operations
results = await asyncio.gather(
    fetch_user(user_id),
    fetch_settings(user_id),
    fetch_permissions(user_id),
    return_exceptions=True  # Don't fail all if one fails
)
```

### TypeScript Conventions

#### Naming
```typescript
// Variables and functions: camelCase
const userId = "123"
function processMessage() {}

// Types and Interfaces: PascalCase
interface User {
  id: string
  name: string
}

type MessageType = "text" | "image" | "file"

// Constants: UPPER_SNAKE_CASE or camelCase
const MAX_RETRIES = 3
const apiBaseUrl = "http://localhost:8001"
```

#### Type Definitions
```typescript
// Prefer interfaces for objects
interface User {
  id: string
  name: string
  email: string
  metadata?: Record<string, unknown>
}

// Use types for unions, intersections, utility types
type Status = "idle" | "loading" | "success" | "error"
type UserWithStatus = User & { status: Status }

// Generic types
interface ApiResponse<T> {
  data: T
  error?: string
  timestamp: string
}
```

#### React Components
```typescript
// Functional components with TypeScript
import { FC } from 'react'

interface MyComponentProps {
  title: string
  count?: number
  onAction: (id: string) => void
}

export const MyComponent: FC<MyComponentProps> = ({
  title,
  count = 0,
  onAction
}) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={() => onAction('123')}>Action</button>
    </div>
  )
}
```

#### API Client Pattern
```typescript
// src/api/my-api.ts
import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL

interface GetUserResponse {
  id: string
  name: string
}

export const userApi = {
  async getUser(id: string): Promise<GetUserResponse> {
    try {
      const response = await axios.get<GetUserResponse>(
        `${BASE_URL}/users/${id}`
      )
      return response.data
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`Failed to fetch user: ${error.message}`)
      }
      throw error
    }
  },
}
```

### Docker Conventions

#### Dockerfile Structure
```dockerfile
# Base image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install dependencies first (for layer caching)
COPY {service}/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY {service} /app/{service}
COPY common /app/common

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["uvicorn", "{service}.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Common Tasks & Solutions

### Task 1: Send Action from Service A to Service B

```python
# In Service A
from common.clients.base_redis_client import BaseRedisClient
from common.models.actions import DomainAction
import uuid

# Create action
action = DomainAction(
    action_type="serviceb.entity.process",  # Routes to serviceb
    tenant_id=uuid.uuid4(),
    session_id=uuid.uuid4(),
    task_id=uuid.uuid4(),
    origin_service="servicea",
    data={"key": "value"}
)

# Send to Redis Stream
await redis_client.send_action(action)
```

### Task 2: Add New Action Type to Worker

```python
# In worker's _handle_action method
async def _handle_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
    # Add new action type
    if action.action_type == "myservice.newentity.newaction":
        return await self._handle_new_action(action)

    # Existing action types
    elif action.action_type == "myservice.entity.process":
        return await self._handle_process(action)

    else:
        raise ValueError(f"Unknown action type: {action.action_type}")

async def _handle_new_action(self, action: DomainAction) -> Dict[str, Any]:
    """Handle new action type."""
    # Extract data
    input_data = action.data

    # Process
    result = await self.service.process_new_action(input_data)

    # Return result
    return {"result": result}
```

### Task 3: Add REST Endpoint to Service

```python
# In main.py
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel

app = FastAPI()

# Request/Response models
class ProcessRequest(BaseModel):
    data: str

class ProcessResponse(BaseModel):
    result: str
    status: str

# Endpoint
@app.post("/api/v1/process", response_model=ProcessResponse)
async def process_data(request: ProcessRequest):
    try:
        # Business logic
        result = await service.process(request.data)
        return ProcessResponse(result=result, status="success")
    except Exception as e:
        logger.error(f"Error processing data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Task 4: Add WebSocket Support to Frontend

```typescript
// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react'

export function useWebSocket(url: string) {
  const ws = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)

  useEffect(() => {
    ws.current = new WebSocket(url)

    ws.current.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    }

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setLastMessage(data)
    }

    ws.current.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
    }

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    return () => {
      ws.current?.close()
    }
  }, [url])

  const sendMessage = (message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    }
  }

  return { isConnected, lastMessage, sendMessage }
}

// Usage in component
function ChatComponent({ sessionId }: { sessionId: string }) {
  const { isConnected, lastMessage, sendMessage } = useWebSocket(
    `ws://localhost:8001/ws/chat/${sessionId}`
  )

  const handleSendMessage = () => {
    sendMessage({ type: 'chat', content: 'Hello' })
  }

  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <button onClick={handleSendMessage}>Send</button>
      <div>{JSON.stringify(lastMessage)}</div>
    </div>
  )
}
```

### Task 5: Query Qdrant for Vector Search

```python
# In service layer
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

async def search_vectors(
    query_vector: List[float],
    tenant_id: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Search Qdrant for similar vectors."""

    # Create filter for multi-tenancy
    filter_conditions = Filter(
        must=[
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=tenant_id)
            )
        ]
    )

    # Perform search
    search_results = await qdrant_client.search(
        collection_name="documents",
        query_vector=query_vector,
        query_filter=filter_conditions,
        limit=limit,
        with_payload=True
    )

    # Extract results
    results = []
    for hit in search_results:
        results.append({
            "id": hit.id,
            "score": hit.score,
            "text": hit.payload.get("text"),
            "metadata": hit.payload.get("metadata")
        })

    return results
```

### Task 6: Add Authentication to Endpoint

```python
# In API router
from fastapi import Depends, HTTPException, Header
from common.supabase.auth import verify_jwt_token

async def get_current_user(
    authorization: str = Header(...)
) -> Dict[str, Any]:
    """Extract and verify JWT token."""
    try:
        # Extract token
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")

        token = authorization.replace("Bearer ", "")

        # Verify token
        user = await verify_jwt_token(token)
        return user

    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# Protected endpoint
@app.post("/api/v1/protected")
async def protected_endpoint(
    user: Dict[str, Any] = Depends(get_current_user)
):
    return {"message": f"Hello {user['email']}"}
```

---

## Testing Guidelines

### Python Testing (pytest)

**Structure:**
```
{service_name}_service/
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Fixtures
│   ├── test_workers.py
│   ├── test_services.py
│   └── test_handlers.py
```

**Example Test:**
```python
# tests/test_workers.py
import pytest
import uuid
from unittest.mock import AsyncMock, Mock
from common.models.actions import DomainAction
from ..workers.my_worker import MyWorker

@pytest.fixture
def mock_redis():
    return AsyncMock()

@pytest.fixture
def mock_settings():
    from ..config.settings import MyServiceSettings
    return MyServiceSettings(
        service_name="my_service_test",
        environment="test"
    )

@pytest.fixture
async def worker(mock_settings, mock_redis):
    worker = MyWorker(
        app_settings=mock_settings,
        async_redis_conn=mock_redis
    )
    await worker.initialize()
    return worker

@pytest.mark.asyncio
async def test_handle_action(worker):
    # Create test action
    action = DomainAction(
        action_type="myservice.entity.process",
        tenant_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        origin_service="test",
        data={"input": "test"}
    )

    # Call handler
    result = await worker._handle_action(action)

    # Assert
    assert result is not None
    assert "output" in result
```

**Run Tests:**
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=./{service_name}_service

# Run specific test file
pytest tests/test_workers.py

# Run specific test
pytest tests/test_workers.py::test_handle_action
```

### Frontend Testing (Vitest + React Testing Library)

**Structure:**
```
src/
├── components/
│   ├── MyComponent.tsx
│   └── MyComponent.test.tsx
├── hooks/
│   ├── useMyHook.ts
│   └── useMyHook.test.ts
```

**Example Test:**
```typescript
// MyComponent.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyComponent } from './MyComponent'

describe('MyComponent', () => {
  it('renders with title', () => {
    render(<MyComponent title="Test Title" onAction={vi.fn()} />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('calls onAction when button clicked', () => {
    const onAction = vi.fn()
    render(<MyComponent title="Test" onAction={onAction} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onAction).toHaveBeenCalledWith('123')
  })
})
```

**Run Tests:**
```bash
npm run test           # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage
```

---

## Debugging & Troubleshooting

### Common Issues

#### Issue 1: Service Not Receiving Messages

**Symptoms:** Worker starts but doesn't process any actions

**Debug Steps:**
1. Check Redis connection:
```bash
docker exec -it redis_database redis-cli
> PING
PONG
```

2. Check stream exists:
```bash
> XINFO STREAM nooble4:dev:myservice:streams:main
```

3. Check consumer group:
```bash
> XINFO GROUPS nooble4:dev:myservice:streams:main
```

4. Check pending messages:
```bash
> XPENDING nooble4:dev:myservice:streams:main myservice-group
```

5. Verify action_type routing:
```python
# In sender
action.action_type = "myservice.entity.process"  # Must match service name

# QueueManager extracts "myservice" from action_type
target_stream = queue_manager.get_service_action_stream("myservice")
```

#### Issue 2: WebSocket Connection Failing

**Symptoms:** Frontend can't connect to WebSocket

**Debug Steps:**
1. Check service is running:
```bash
docker compose ps orchestrator_service
```

2. Test WebSocket from command line:
```bash
websocat ws://localhost:8001/ws/chat/test-session-id
```

3. Check CORS settings in `.env`:
```bash
CORS_ORIGINS='["http://localhost:5173"]'
```

4. Check logs:
```bash
docker compose logs -f orchestrator_service
```

#### Issue 3: Callback Not Being Received

**Symptoms:** Action sent but no callback received

**Debug Steps:**
1. Verify correlation_id is set:
```python
action.correlation_id = uuid.uuid4()  # Required for pseudo-sync
```

2. Verify callback_queue_name is correct:
```python
# For pseudo-sync (response queue)
action.callback_queue_name = f"nooble4:dev:orchestrator:responses:{session_id}"
action.callback_action_type = None

# For async callback (stream)
action.callback_queue_name = f"nooble4:dev:myservice-callbacks:streams:main"
action.callback_action_type = "myservice.callback.process"
```

3. Check if response was sent:
```bash
# Check Redis list (pseudo-sync)
docker exec -it redis_database redis-cli
> LLEN nooble4:dev:orchestrator:responses:session-id

# Check Redis stream (async callback)
> XLEN nooble4:dev:myservice-callbacks:streams:main
```

4. Check worker logs for errors:
```bash
docker compose logs -f myservice
```

#### Issue 4: Import Errors with Common Library

**Symptoms:** `ModuleNotFoundError: No module named 'common'`

**Solutions:**
1. Verify PYTHONPATH is set in Dockerfile:
```dockerfile
ENV PYTHONPATH=/app
```

2. Verify common is copied:
```dockerfile
COPY common /app/common
```

3. Check import syntax:
```python
# Correct
from common.models.actions import DomainAction

# Incorrect
from models.actions import DomainAction  # Missing 'common.'
```

### Debugging Tools

#### Redis CLI
```bash
# Access Redis
docker exec -it redis_database redis-cli

# List all keys
KEYS *

# Check stream length
XLEN nooble4:dev:myservice:streams:main

# Read from stream
XREAD COUNT 10 STREAMS nooble4:dev:myservice:streams:main 0-0

# Check consumer groups
XINFO GROUPS nooble4:dev:myservice:streams:main

# Check pending messages
XPENDING nooble4:dev:myservice:streams:main myservice-group

# Check list (for responses)
LRANGE nooble4:dev:orchestrator:responses:session-id 0 -1
```

#### Docker Logs
```bash
# Follow logs
docker compose logs -f orchestrator_service

# Last 100 lines
docker compose logs --tail=100 orchestrator_service

# All services
docker compose logs -f

# Filter logs
docker compose logs -f | grep ERROR
```

#### Qdrant Admin UI
```
http://localhost:6333/dashboard
```

#### Supabase Studio
```
http://localhost:8082
```

#### FastAPI Auto Docs
```
http://localhost:8001/docs        # Orchestrator
http://localhost:8002/docs        # Ingestion
```

---

## API Reference

### Orchestrator Service API

**Base URL:** `http://localhost:8001`

#### Initialize Chat Session
```http
POST /api/v1/chat/init
Content-Type: application/json

{
  "tenant_id": "uuid",
  "user_id": "uuid",
  "agent_id": "uuid",
  "initial_message": "Hello"
}

Response:
{
  "session_id": "uuid",
  "status": "initialized",
  "websocket_url": "ws://localhost:8001/ws/chat/{session_id}"
}
```

#### Create Task
```http
POST /api/v1/chat/{session_id}/task
Content-Type: application/json

{
  "user_message": "What is RAG?",
  "execution_mode": "simple"  # or "advanced"
}

Response:
{
  "task_id": "uuid",
  "status": "processing"
}
```

#### Get Session Status
```http
GET /api/v1/chat/{session_id}/status

Response:
{
  "session_id": "uuid",
  "is_active": true,
  "message_count": 5,
  "last_activity": "2025-11-14T12:00:00Z"
}
```

#### Delete Session
```http
DELETE /api/v1/chat/{session_id}

Response:
{
  "status": "deleted"
}
```

#### WebSocket Connection
```javascript
const ws = new WebSocket(`ws://localhost:8001/ws/chat/${sessionId}`)

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  /*
  Message types:
  - "chat_response": AI response
  - "status_update": Status change
  - "error": Error occurred
  - "chunk": Streaming chunk
  */
}

// Send message
ws.send(JSON.stringify({
  type: "user_message",
  content: "Hello"
}))
```

### Ingestion Service API

**Base URL:** `http://localhost:8002`

#### Upload Document
```http
POST /api/v1/ingest
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data

{
  "file": <file>,
  "tenant_id": "uuid",
  "agent_id": "uuid",
  "metadata": "{\"key\": \"value\"}"
}

Response:
{
  "job_id": "uuid",
  "status": "processing",
  "websocket_url": "ws://localhost:8002/ws/ingest/{job_id}"
}
```

#### WebSocket Progress
```javascript
const ws = new WebSocket(`ws://localhost:8002/ws/ingest/${jobId}`)

ws.onmessage = (event) => {
  const update = JSON.parse(event.data)
  /*
  {
    "status": "processing" | "completed" | "error",
    "progress": 0.5,
    "message": "Processing chunks...",
    "chunks_processed": 10,
    "total_chunks": 20
  }
  */
}
```

---

## Glossary

### Key Terms

**Action Type:** String identifier in format `service.entity.verb` that routes messages to appropriate services (e.g., `embedding.document.process`)

**BaseWorker:** Abstract base class for all worker implementations, provides Redis Stream consumer group pattern and automatic message handling

**Callback Queue:** Redis List or Stream where responses are sent (pseudo-sync uses Lists, async callbacks use Streams)

**Common Library:** Shared Python package (`/common`) mounted into all backend services containing models, clients, and utilities

**Consumer Group:** Redis Streams feature that allows multiple workers to consume from the same stream without processing duplicate messages

**Correlation ID:** UUID linking a request to its response in pseudo-synchronous communication patterns

**DomainAction:** Pydantic model representing a standardized message/command sent between services

**DomainActionResponse:** Pydantic model representing a response to a DomainAction (used in pseudo-synchronous patterns)

**Fire-and-Forget:** Communication pattern where sender doesn't expect a response

**Pseudo-Synchronous:** Communication pattern simulating synchronous behavior over async Redis (request-response via callback queue)

**QueueManager:** Utility class that generates standardized Redis Stream and queue names based on service names and environment

**RAG (Retrieval-Augmented Generation):** Pattern combining vector search with LLM generation for context-aware responses

**Redis Streams:** Redis data structure for message streaming with consumer groups and persistence

**Session ID:** UUID identifying a visitor's conversation or interaction session (ephemeral, not persisted in database - used for Redis tracking only)

**Task ID:** UUID identifying a high-level user task (ephemeral, may spawn multiple actions - used for tracing across services)

**Tenant ID:** UUID representing the agent owner's user_id (NOT the visitor). Enables multi-tenancy based on agent ownership. All conversations, documents, and data are isolated by tenant_id (the creator/owner of the agent), even when visitors interact with public agents

**Trace ID:** UUID for distributed tracing across multiple services

**Worker:** Background process consuming messages from Redis Streams

---

## Best Practices

### DO ✅

1. **Always use DomainAction** for inter-service communication
2. **Set correlation_id** for request-response patterns
3. **Use structured logging** with action.get_log_extra()
4. **Handle errors gracefully** in workers (BaseWorker handles ACK/NACK)
5. **Use Pydantic models** for validation
6. **Type hint everything** in Python and TypeScript
7. **Test workers in isolation** with mocked Redis
8. **Use consumer groups** for parallel processing
9. **Filter by tenant_id** in all queries (multi-tenancy)
10. **Use async/await** for I/O operations
11. **Validate action_type** in worker handlers
12. **Document API endpoints** with OpenAPI/Swagger
13. **Use environment variables** for configuration
14. **Log with context** (session_id, task_id, correlation_id)
15. **Handle WebSocket disconnections** gracefully

### DON'T ❌

1. **Don't use REST** for inter-service communication (use Redis Streams)
2. **Don't forget correlation_id** in pseudo-sync patterns
3. **Don't hardcode configuration** (use .env)
4. **Don't skip error handling** in workers
5. **Don't share database connections** across services
6. **Don't forget to ACK messages** (BaseWorker handles this)
7. **Don't use synchronous I/O** in async functions
8. **Don't store secrets** in code or git
9. **Don't skip tenant_id filtering** (security risk)
10. **Don't create circular dependencies** between services
11. **Don't forget to close connections** on shutdown
12. **Don't use blocking operations** in workers
13. **Don't expose internal errors** to clients
14. **Don't forget to validate input data**
15. **Don't use global state** in services

---

## Quick Reference

### Service Ports
```
8000  - Query Service (internal)
8001  - Orchestrator Service (public API)
8002  - Ingestion Service (public API)
8004  - Conversation Service (internal)
8005  - Agent Execution Service (internal)
8006  - Embedding Service (internal)
5173  - Frontend Service
6379  - Redis
6333  - Qdrant HTTP
6334  - Qdrant gRPC
5432  - PostgreSQL
8082  - Supabase Studio
```

### Environment Variables
```bash
# API Keys
GROQ_API_KEY=...
OPENAI_API_KEY=...

# Infrastructure
REDIS_URL=redis://:password@redis_database:6379/0
QDRANT_URL=http://qdrant_database:6333
SUPABASE_URL=http://kong:8000

# Auth
JWT_SECRET=...
ANON_KEY=...
SERVICE_ROLE_KEY=...

# CORS
CORS_ORIGINS='["http://localhost:5173"]'
```

### Docker Commands
```bash
# Start all
docker compose up --build

# Start specific service
docker compose up orchestrator_service

# Scale workers
docker compose up --scale query_service=3

# Logs
docker compose logs -f orchestrator_service

# Stop all
docker compose down

# Rebuild
docker compose build --no-cache
```

### Git Workflow
```bash
# Current branch (from context)
git status

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push to branch
git push -u origin claude/claude-md-mhygcjyirm22u2ow-01VKPHVDpPTvmoqGyDG9ruL2
```

---

## Conclusion

This document serves as a comprehensive reference for AI assistants working with the Nooble AI Platform. Key takeaways:

- **Microservices Architecture:** Event-driven with Redis Streams
- **Worker Pattern:** Most services consume from queues
- **DomainAction:** Universal message format
- **Common Library:** Shared code for consistency
- **Async First:** Always use async/await for I/O
- **Type Safety:** Pydantic (Python) and TypeScript (Frontend)

For questions or clarifications, refer to:
- Service-specific docs in `/docs`
- FastAPI auto-generated docs at `/docs` endpoints
- Code comments and docstrings
- Git commit history for context

**Happy Coding! 🚀**
