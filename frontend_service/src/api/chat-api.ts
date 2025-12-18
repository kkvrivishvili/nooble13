// src/api/chat-api.ts
// Orchestrator Chat API (REST + WebSocket client)
// This API is dedicated to public chat via the Orchestrator service.
// NOTE: Keep CRM-related conversations in conversation-api.ts (for later).

// Configuration
const ORCHESTRATOR_SERVICE_URL =
  import.meta.env.VITE_ORCHESTRATOR_SERVICE_URL || 'http://localhost:8001';

// ===== Types aligned with backend models =====

export type UUID = string;

// REST models
export interface ChatInitRequest {
  agent_id: UUID;
  metadata?: Record<string, unknown>;
}

export interface ChatInitResponse {
  session_id: UUID;
  task_id: UUID;
  websocket_url: string;
  agent_name: string;
}

export interface ChatSessionStatus {
  session_id: UUID;
  session_type: 'chat';
  tenant_id: UUID;
  agent_id: UUID;
  websocket_connected: boolean;
  total_tasks: number;
  active_task_id: UUID | null;
  total_messages: number;
  created_at: string; // ISO
  last_activity: string; // ISO
}

// Chat payload models
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content?: string;
  // tool-calls compatible (OpenAI/Groq-like)
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[]; // min 1
  tools?: Array<Record<string, unknown>>;
  tool_choice?: 'none' | 'auto' | Record<string, unknown>;
  conversation_id?: UUID;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatStreamingData {
  content: string;
  is_final: boolean;
  chunk_index: number;
  timestamp: string; // ISO
}

export interface ErrorData {
  error_code: string;
  error_message: string;
  error_type: string;
  retry_possible: boolean;
  details?: Record<string, unknown>;
}

export interface ChatResponsePayload {
  message: ChatMessage;
  usage: TokenUsage;
  conversation_id: UUID;
  execution_time_ms: number;
  sources: UUID[];
  iterations?: number;
  streaming_data?: ChatStreamingData;
  is_streaming: boolean;
  error_data?: ErrorData;
  status: string; // e.g. "completed"
  metadata?: Record<string, unknown>;
}

// Generic WebSocket message (common.websocket.models.WebSocketMessage)
export type OrchestratorWsType =
  | 'connection_ack'
  | 'ping'
  | 'pong'
  | 'error'
  | 'message'
  | 'response'
  | 'streaming'
  | 'progress'
  | 'complete'
  // Orchestrator chat-specific types
  | 'chat_init'
  | 'chat_message'
  | 'chat_response'
  | 'chat_streaming'
  | 'chat_completed'
  | 'chat_error'
  | 'chat_processing';

export interface WebSocketMessage {
  message_id?: UUID;
  message_type: OrchestratorWsType | string; // backend accepts string too
  timestamp?: string; // ISO
  data?: unknown;
  session_id?: UUID;
  task_id?: UUID;
}

// Normalize WS URL coming from backend (may be ws://0.0.0.0:PORT/...)
function resolveWebSocketUrl(input: string): string {
  try {
    const u = new URL(input);
    if (u.hostname === '0.0.0.0') {
      const base = new URL(ORCHESTRATOR_SERVICE_URL);
      u.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      u.hostname = base.hostname;
      u.port = base.port;
      return u.toString();
    }
    return u.toString();
  } catch {
    // input might be a path, build from base
    try {
      const base = new URL(ORCHESTRATOR_SERVICE_URL);
      const proto = base.protocol === 'https:' ? 'wss' : 'ws';
      const path = input.startsWith('/') ? input : `/${input}`;
      return `${proto}://${base.host}${path}`;
    } catch {
      return input; // best effort
    }
  }
}

// ===== REST client =====
class ChatAPI {
  /**
   * Start a new public chat session
   */
  async initChatSession(payload: ChatInitRequest): Promise<ChatInitResponse> {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    const isDev = !!(env && env.DEV);
    if (isDev) {
      // Debug: log outgoing payload (without sensitive data)
      // eslint-disable-next-line no-console
      console.log('[chatApi] initChatSession ->', { agent_id: payload.agent_id, hasMetadata: !!payload.metadata });
    }
    const res = await fetch(`${ORCHESTRATOR_SERVICE_URL}/api/v1/chat/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: payload.agent_id,
        metadata: payload.metadata || {},
      }),
    });
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log('[chatApi] initChatSession <- status', res.status);
    }

    if (!res.ok) {
      const err = await safeJson(res);
      // FastAPI validation errors often return array/object in `detail`
      let detailMsg = 'Failed to init chat session';
      if (err) {
        if (typeof err.detail === 'string') {
          detailMsg = err.detail;
        } else if (Array.isArray(err.detail)) {
          detailMsg = JSON.stringify(err.detail);
        } else if (err.detail && typeof err.detail === 'object') {
          detailMsg = JSON.stringify(err.detail);
        }
      }
      throw new Error(detailMsg);
    }

    return res.json();
  }

  /**
   * Get chat session status
   */
  async getSessionStatus(sessionId: UUID): Promise<ChatSessionStatus> {
    const res = await fetch(
      `${ORCHESTRATOR_SERVICE_URL}/api/v1/chat/session/${sessionId}/status`
    );
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.detail || 'Failed to get session status');
    }
    return res.json();
  }

  /**
   * Create a new task within a session
   */
  async createNewTask(sessionId: UUID): Promise<{ task_id: UUID; session_id: UUID; created_at: string }> {
    const res = await fetch(
      `${ORCHESTRATOR_SERVICE_URL}/api/v1/chat/session/${sessionId}/task`,
      { method: 'POST' }
    );
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.detail || 'Failed to create new task');
    }
    return res.json();
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: UUID): Promise<{ message: string; session_id: UUID; deleted_at: string }> {
    const res = await fetch(
      `${ORCHESTRATOR_SERVICE_URL}/api/v1/chat/session/${sessionId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.detail || 'Failed to delete chat session');
    }
    return res.json();
  }

  // ===== WebSocket client =====
  /**
   * Connect to orchestrator chat WebSocket
   * @param websocketUrl url from initChatSession.websocket_url
   * @param handlers callbacks for socket events
   */
  connectWebSocket(websocketUrl: string, handlers: ChatSocketHandlers = {}): ChatSocketConnection {
    const wsUrl = resolveWebSocketUrl(websocketUrl);
    const ws = new WebSocket(wsUrl);
    let seq = 0; // contador de mensajes entrantes por conexión

    ws.onopen = () => {
      // eslint-disable-next-line no-console
      console.log('[chatApi][ws] open', wsUrl);
      handlers.onOpen?.();
    };

    ws.onclose = (ev) => {
      // eslint-disable-next-line no-console
      console.log('[chatApi][ws] close', ev.code, ev.reason);
      handlers.onClose?.(ev);
    };

    ws.onerror = (_ev) => {
      // eslint-disable-next-line no-console
      console.log('[chatApi][ws] error', _ev);
      handlers.onError?.(new Error('WebSocket error'));
    };

    ws.onmessage = (ev) => {
      let msg: WebSocketMessage;
      try {
        msg = JSON.parse(ev.data) as WebSocketMessage;
      } catch (_e) {
        handlers.onError?.(new Error('Invalid WebSocket message format'));
        return;
      }
      // Log simple y consistente: secuencia, timestamp, tipo, task, chunk si existe
      const d = msg?.data as { chunk_index?: number; is_final?: boolean } | undefined;
      const chunkIndex = d?.chunk_index;
      // eslint-disable-next-line no-console
      console.log(`[chatApi][ws] #${++seq} ${new Date().toISOString()} type=${String(msg.message_type)} task=${msg.task_id ?? ''} chunk=${chunkIndex ?? ''}`,
        msg);

      handlers.onMessage?.(msg);

      switch (msg.message_type) {
        case 'connection_ack':
          handlers.onAck?.(msg);
          break;
        case 'chat_processing':
          handlers.onProcessing?.(msg.task_id || null, msg.data as ChatProcessingData);
          break;
        case 'chat_streaming':
          handlers.onStreaming?.(msg.task_id || null, msg.data as ChatStreamingData);
          break;
        case 'chat_response':
          handlers.onResponse?.(msg.task_id || null, msg.data as ChatResponsePayload);
          break;
        case 'chat_error':
          // backend wraps in { error: {...} }
          {
            const env = (msg.data || {}) as ChatErrorEnvelope;
            const errorMessage = env?.error?.message || 'Chat error';
            handlers.onError?.(new Error(String(errorMessage)));
          }
          break;
        case 'pong':
          handlers.onPong?.();
          break;
        default:
          // ignore or handle generically
          break;
      }
    };

    const connection: ChatSocketConnection = {
      ws,
      isOpen: () => ws.readyState === WebSocket.OPEN,
      close: () => ws.close(),
      ping: () => {
        const payload: WebSocketMessage = {
          message_type: 'ping',
          data: { timestamp: Date.now() },
        };
        ws.send(JSON.stringify(payload));
      },
      sendChatRequest: (chatRequest: ChatRequest, opts?: { taskId?: UUID; sessionId?: UUID }) => {
        const payload: WebSocketMessage = {
          message_type: 'chat_message',
          data: chatRequest,
          ...(opts?.sessionId ? { session_id: opts.sessionId } : {}),
          ...(opts?.taskId ? { task_id: opts.taskId } : {}),
        };
        // eslint-disable-next-line no-console
        console.log('[chatApi][ws] send chat_message', payload);
        ws.send(JSON.stringify(payload));
      },
      sendUserMessage: (content: string, options?: { metadata?: Record<string, unknown>; taskId?: UUID; sessionId?: UUID }) => {
        const chatRequest: ChatRequest = {
          messages: [
            {
              role: 'user',
              content,
              metadata: options?.metadata || {},
            },
          ],
          metadata: {},
        };
        const payload: WebSocketMessage = {
          message_type: 'chat_message',
          data: chatRequest,
          ...(options?.sessionId ? { session_id: options.sessionId } : {}),
          ...(options?.taskId ? { task_id: options.taskId } : {}),
        };
        // eslint-disable-next-line no-console
        console.log('[chatApi][ws] send user message', payload);
        ws.send(JSON.stringify(payload));
      },
    };

    return connection;
  }
}

// ===== Helpers =====
async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ===== Socket types =====
export interface ChatSocketHandlers {
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (err: Error) => void;
  onPong?: () => void;
  onAck?: (msg: WebSocketMessage) => void;
  onProcessing?: (taskId: UUID | null, data: ChatProcessingData) => void; // { task_id, status, mode }
  onStreaming?: (taskId: UUID | null, data: ChatStreamingData) => void;
  onResponse?: (taskId: UUID | null, data: ChatResponsePayload) => void;
  onMessage?: (raw: WebSocketMessage) => void; // catch-all
}

export interface ChatSocketConnection {
  ws: WebSocket;
  isOpen: () => boolean;
  close: () => void;
  ping: () => void;
  sendChatRequest: (chatRequest: ChatRequest, opts?: { taskId?: UUID; sessionId?: UUID }) => void;
  sendUserMessage: (
    content: string,
    options?: { metadata?: Record<string, unknown>; taskId?: UUID; sessionId?: UUID }
  ) => void;
}

export const chatApi = new ChatAPI();

// Internal helper types for WS messages
export interface ChatProcessingData {
  status?: string;
  mode?: string;
  [k: string]: unknown;
}

export interface ChatErrorEnvelope {
  error?: { message?: string; [k: string]: unknown };
  [k: string]: unknown;
}
