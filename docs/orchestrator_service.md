# Orchestrator Service

## Overview
The **Orchestrator Service** is the central hub that coordinates all other micro‑services in the Nooble8 architecture. It exposes a REST API for chat sessions, manages WebSocket connections for real‑time communication, and runs background workers to process callbacks from the Execution Service.

> **Key responsibilities**:
> 1. Session lifecycle management (create, status, delete).
> 2. Dispatching chat tasks to the Execution Service via Redis.
> 3. Streaming results back to clients through WebSockets.
> 4. Persisting session state and configuration in Supabase.
> 5. Monitoring health and metrics.

---

## Project Structure
```
orchestrator_service/
├── Dockerfile                 # Container image definition
├── __init__.py                # Package init
├── api/                       # FastAPI route definitions
│   ├── chat_routes.py         # REST endpoints for chat management
│   ├── websocket_routes.py    # WebSocket endpoint registration
│   └── health_routes.py       # Health‑check endpoints
├── clients/                   # External service wrappers
│   ├── execution_client.py     # Publishes tasks to Execution Service via Redis
│   └── base_redis_client.py   # Generic Redis client used by handlers
├── config/
│   └── settings.py            # Pydantic model loading env vars
├── handlers/                  # High‑level business logic
│   ├── chat_handler.py        # Session creation / task routing
│   ├── callback_handler.py    # Handles incoming callbacks from workers
│   ├── config_handler.py      # Reads/writes configuration in Supabase
│   └── session_handler.py     # Stores/retrieves session data in Redis
├── models/                    # Pydantic schemas for request/response bodies
├── services/
│   └── orchestration_service.py  # Core orchestration logic (state machine)
├── websocket/
│   └── orchestrator_websocket_manager.py  # WebSocket connection pool
├── workers/
│   ├── callback_worker.py    # Background worker consuming Redis callbacks
│   └── callback_worker.py
└── main.py                    # FastAPI app bootstrap & lifecycle hooks
```

## Initialization Flow (see `main.py`)
1. **Read Settings** – `OrchestratorSettings` loads env vars.
2. **Logging** – `init_logging()` configures the logger.
3. **Redis** – `RedisManager` establishes a connection pool.
4. **Supabase** – A client is created for configuration persistence.
5. **Clients & Handlers** – Instances of `ExecutionClient`, `ConfigHandler`, and `SessionHandler` are instantiated.
6. **Orchestration Service** – The core orchestrator object holds references to all handlers and the Redis client.
7. **WebSocket Manager** – Keeps a mapping from session IDs to active WebSocket connections.
8. **API Handlers** – Each route receives dependencies via `set_dependencies`.
9. **Callback Workers** – If enabled, spawn N workers that listen for callback messages on a Redis channel and forward them to the orchestrator.
10. **Graceful Shutdown** – The lifespan context ensures all workers, WebSocket connections, and Redis are closed cleanly.

## Key Components
### `OrchestrationService`
- Acts as a *state machine* that tracks chat sessions.
- Exposes methods: `create_session`, `get_status`, `add_task`, `handle_callback`.
- Interacts with `ExecutionClient` to push tasks and listens for results via callbacks.

### `ChatHandler`
- REST endpoints:
  - `/api/v1/chat/init` → creates a new chat session (returns session_id).
  - `/api/v1/chat/{session_id}/task` → submits a user message; orchestrator forwards to Execution Service and streams back via WebSocket.

### `CallbackHandler`
- Listens on the `/ws/chat/{session_id}` endpoint for incoming WebSocket messages from clients.
- Also receives *callback* events pushed by the worker, then pushes results into Redis or directly to the client.

### `WebSocketManager`
- Maintains a dictionary `{session_id: WebSocketConnection}`.
- Provides helper methods: `connect`, `disconnect`, `broadcast`.
- Handles reconnection logic and heartbeats.

## Worker Flow (`CallbackWorker`)
1. Subscribes to a Redis channel (e.g., `callback:{consumer_id}`).
2. On message, deserializes JSON containing `{session_id, task_id, result}`.
3. Calls `OrchestrationService.handle_callback(session_id, task_id, result)`.
4. The orchestrator then pushes the result to the WebSocket connection or stores it for later retrieval.

## Health & Metrics
- `/health/` – Basic liveness probe.
- `/health/detailed` – Returns Redis connectivity, worker counts, and uptime.
- `/health/metrics` – Exposes Prometheus‑style metrics (request count, latency, etc.).

## Deployment Notes
- Docker image built from `Dockerfile`; expose port 8001 by default.
- Requires a running Redis instance and Supabase project.
- Callback workers can be scaled horizontally; each worker uses a unique consumer ID suffix to avoid duplicate processing.

---

### Quick Start (dev)
```bash
# Copy env example
cp .env.example .env
# Edit .env with your config
docker compose up --build orchestrator_service
```

The service will log all available endpoints, e.g.:
```
GET /health/          - Health check básico
POST /api/v1/chat/init   - Iniciar sesión de chat
WS  ws://0.0.0.0:8001/ws/chat/{session_id}  - WebSocket para chat
```
