// src/types/conversation.ts
export interface Conversation {
    id: string;
    user_id: string;
    session_id: string;
    agent_id: string;
    visitor_info: {
      ip?: string | null;
      location?: string | null;
      device_type?: string | null;
      user_agent?: string | null;
    };
    started_at: string;
    ended_at?: string | null;
    status: 'active' | 'closed' | 'archived';
    message_count: number;
    last_message_at: string;
  }
  
  export interface Message {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens_input?: number;
    tokens_output?: number;
    model?: string;
    latency_ms?: number;
    metadata: Record<string, any>;
    created_at: string;
  }
  
  export interface ConversationSummary extends Conversation {
    agent_name: string;
    duration: string;
    user_messages: number;
    agent_messages: number;
  }