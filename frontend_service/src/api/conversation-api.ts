// src/api/conversation-api.ts
import { supabase } from '@/lib/supabase';
import { Conversation, Message } from '@/types/conversation';
import { PostgrestError } from '@supabase/supabase-js';

// Helper Functions
const handleApiError = (error: PostgrestError | null, context: string) => {
  if (error) {
    console.error(`Error in ${context}:`, error.message);
    throw new Error(`A problem occurred in ${context}: ${error.message}`);
  }
};

class ConversationAPI {
  /**
   * Get conversations by agent ID
   */
  async getConversationsByAgent(agentId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('agent_id', agentId)
      .order('started_at', { ascending: false });

    handleApiError(error, 'getConversationsByAgent');
    return data || [];
  }

  /**
   * Get conversations by tenant (user)
   */
  async getConversationsByTenant(tenantId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false });

    handleApiError(error, 'getConversationsByTenant');
    return data || [];
  }

  /**
   * Get a specific conversation
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      handleApiError(error, 'getConversation');
    }

    return data;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    handleApiError(error, 'getMessages');
    return data || [];
  }

  /**
   * Create a new message
   */
  async createMessage(
    conversationId: string, 
    content: string, 
    role: 'user' | 'assistant',
    metadata?: Record<string, any>
  ): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content,
        role,
        metadata: metadata || {}
      })
      .select()
      .single();

    handleApiError(error, 'createMessage');
    return data;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    tenantId: string,
    sessionId: string,
    agentId: string,
    visitorInfo?: Partial<Conversation['visitor_info']>
  ): Promise<Conversation> {
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        id: await this.generateConversationId(tenantId, sessionId, agentId),
        tenant_id: tenantId,
        session_id: sessionId,
        agent_id: agentId,
        visitor_info: visitorInfo || {}
      })
      .select()
      .single();

    handleApiError(error, 'createConversation');
    return data;
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({
        is_active: false,
        ended_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    handleApiError(error, 'endConversation');
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(conversationId: string): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    duration?: string;
  }> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messages = await this.getMessages(conversationId);
    
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;

    let duration: string | undefined;
    if (conversation.ended_at) {
      const start = new Date(conversation.started_at);
      const end = new Date(conversation.ended_at);
      const durationMs = end.getTime() - start.getTime();
      duration = this.formatDuration(durationMs);
    }

    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      duration
    };
  }

  /**
   * Private helper: Generate deterministic conversation ID
   */
  private async generateConversationId(
    tenantId: string,
    sessionId: string,
    agentId: string
  ): Promise<string> {
    const { data, error } = await supabase
      .rpc('generate_conversation_id', {
        p_tenant_id: tenantId,
        p_session_id: sessionId,
        p_agent_id: agentId
      });

    if (error) throw error;
    return data;
  }

  /**
   * Private helper: Format duration
   */
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

export const conversationApi = new ConversationAPI();