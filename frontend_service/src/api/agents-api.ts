// src/api/agents-api.ts - Fixed snake_case version
import { supabase } from '@/lib/supabase';
import { Agent, AgentTemplate } from '@/types/profile';
import { PostgrestError, AuthError } from '@supabase/supabase-js';

// Helper Functions
const handleApiError = (error: PostgrestError | AuthError | null, context: string) => {
  if (error) {
    console.error(`Error in ${context}:`, error.message);
    throw new Error(`A problem occurred in ${context}: ${error.message}`);
  }
};

const getUserId = async (): Promise<string> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  handleApiError(error, 'session check');
  if (!session?.user?.id) throw new Error('User not authenticated.');
  return session.user.id;
};

class AgentsAPI {
  /**
   * Get all agent templates (public, no auth required)
   */
  async getAgentTemplates(): Promise<AgentTemplate[]> {
    const { data, error } = await supabase
      .from('agent_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    handleApiError(error, 'getAgentTemplates');
    return data || [];
  }

  /**
   * Get user's agents
   */
  async getUserAgents(): Promise<Agent[]> {
    const userId = await getUserId();
    
    const { data, error } = await supabase
      .from('agents_with_prompt') // Using the view to get system_prompt
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    handleApiError(error, 'getUserAgents');
    return data || [];
  }

  /**
   * Get public agents by profile ID (for public profiles)
   */
  async getPublicAgentsByProfile(profileId: string): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agents_with_prompt')
      .select('*')
      .eq('user_id', profileId)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('name');

    handleApiError(error, 'getPublicAgentsByProfile');
    return data || [];
  }

  /**
   * Get agent by ID (checks ownership or public access)
   */
  async getAgentById(agentId: string): Promise<Agent | null> {
    const { data, error } = await supabase
      .from('agents_with_prompt')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      handleApiError(error, 'getAgentById');
    }

    return data;
  }

  /**
   * Create agent from template
   */
  async createAgentFromTemplate(
    templateId: string, 
    customName?: string
  ): Promise<Agent> {
    const userId = await getUserId();

    const { data: agentId, error } = await supabase
      .rpc('copy_agent_from_template', {
        p_user_id: userId,
        p_template_id: templateId,
        p_agent_name: customName
      });

    handleApiError(error, 'createAgentFromTemplate');

    // Fetch the created agent
    const agent = await this.getAgentById(agentId);
    if (!agent) {
      throw new Error('Failed to fetch created agent');
    }

    return agent;
  }

  /**
   * Create custom agent (not from template)
   */
  async createCustomAgent(agentData: {
    name: string;
    description?: string;
    icon?: string;
    systemPrompt: string;
    isPublic?: boolean;
  }): Promise<Agent> {
    const userId = await getUserId();

    // Default config objects
    const defaultQueryConfig = {
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      stream: true
    };

    const defaultRagConfig = {
      embedding_model: "text-embedding-3-small",
      embedding_dimensions: 1536,
      chunk_size: 512,
      chunk_overlap: 50,
      top_k: 10,
      similarity_threshold: 0.7,
      hybrid_search: false,
      rerank: false
    };

    const defaultExecutionConfig = {
      history_enabled: true,
      history_window: 10,
      history_ttl: 3600,
      max_iterations: 5,
      timeout_seconds: 30
    };

    const { data, error } = await supabase
      .from('agents')
      .insert({
        user_id: userId,
        template_id: null, // Custom agent
        name: agentData.name,
        description: agentData.description,
        icon: agentData.icon || '🤖',
        system_prompt_override: agentData.systemPrompt,
        query_config: defaultQueryConfig,
        rag_config: defaultRagConfig,
        execution_config: defaultExecutionConfig,
        is_public: agentData.isPublic ?? true,
        is_active: true
      })
      .select()
      .single();

    handleApiError(error, 'createCustomAgent');

    // Add agent to user's profile
    await this.addAgentToProfile(data.id);

    return data;
  }

  /**
   * Update agent
   */
  async updateAgent(
    agentId: string, 
    updates: Partial<Pick<Agent, 'name' | 'description' | 'icon' | 'system_prompt_override' | 'is_public' | 'is_active'>>
  ): Promise<Agent> {
    const userId = await getUserId();

    // Verify ownership
    const agent = await this.getAgentById(agentId);
    if (!agent || agent.user_id !== userId) {
      throw new Error('Agent not found or access denied');
    }

    const { data, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', agentId)
      .eq('user_id', userId) // Double check ownership
      .select()
      .single();

    handleApiError(error, 'updateAgent');
    return data;
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const userId = await getUserId();

    // Verify ownership
    const agent = await this.getAgentById(agentId);
    if (!agent || agent.user_id !== userId) {
      throw new Error('Agent not found or access denied');
    }

    // Remove from profile first
    await this.removeAgentFromProfile(agentId);

    // Delete the agent (cascade will handle related data)
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', agentId)
      .eq('user_id', userId); // Double check ownership

    handleApiError(error, 'deleteAgent');
  }

  /**
   * Toggle agent visibility (public/private)
   */
  async toggleAgentVisibility(agentId: string): Promise<Agent> {
    const agent = await this.getAgentById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    return this.updateAgent(agentId, { is_public: !agent.is_public });
  }

  /**
   * Duplicate agent
   */
  async duplicateAgent(agentId: string, newName?: string): Promise<Agent> {
    const userId = await getUserId();
    const originalAgent = await this.getAgentById(agentId);
    
    if (!originalAgent || originalAgent.user_id !== userId) {
      throw new Error('Agent not found or access denied');
    }

    const duplicatedName = newName || `${originalAgent.name} (Copy)`;

    const { data, error } = await supabase
      .from('agents')
      .insert({
        user_id: userId,
        template_id: originalAgent.template_id,
        name: duplicatedName,
        description: originalAgent.description,
        icon: originalAgent.icon,
        system_prompt_override: originalAgent.system_prompt_override,
        query_config: originalAgent.query_config,
        rag_config: originalAgent.rag_config,
        execution_config: originalAgent.execution_config,
        is_public: originalAgent.is_public,
        is_active: true
      })
      .select()
      .single();

    handleApiError(error, 'duplicateAgent');

    // Add to profile
    await this.addAgentToProfile(data.id);

    return data;
  }

  /**
   * Update agent configuration (query, RAG, execution)
   */
  async updateAgentConfig(agentId: string, config: {
    query_config?: Agent['query_config'];
    rag_config?: Agent['rag_config'];
    execution_config?: Agent['execution_config'];
  }): Promise<Agent> {
    const userId = await getUserId();

    // Verify ownership
    const agent = await this.getAgentById(agentId);
    if (!agent || agent.user_id !== userId) {
      throw new Error('Agent not found or access denied');
    }

    const updates: any = {};
    if (config.query_config) updates.query_config = config.query_config;
    if (config.rag_config) updates.rag_config = config.rag_config;
    if (config.execution_config) updates.execution_config = config.execution_config;

    const { data, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', agentId)
      .eq('user_id', userId)
      .select()
      .single();

    handleApiError(error, 'updateAgentConfig');
    return data;
  }

  /**
   * Private helper: Add agent to user's profile
   */
  private async addAgentToProfile(agentId: string): Promise<void> {
    const userId = await getUserId();

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('agents')
      .eq('id', userId)
      .single();

    handleApiError(fetchError, 'addAgentToProfile - fetch');

    const currentAgents = (profile.agents || []) as string[];
    if (!currentAgents.includes(agentId)) {
      const updatedAgents = [...currentAgents, agentId];

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          agents: updatedAgents,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      handleApiError(updateError, 'addAgentToProfile - update');
    }
  }

  /**
   * Private helper: Remove agent from user's profile
   */
  private async removeAgentFromProfile(agentId: string): Promise<void> {
    const userId = await getUserId();

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('agents')
      .eq('id', userId)
      .single();

    handleApiError(fetchError, 'removeAgentFromProfile - fetch');

    const currentAgents = (profile.agents || []) as string[];
    const updatedAgents = currentAgents.filter(id => id !== agentId);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        agents: updatedAgents,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    handleApiError(updateError, 'removeAgentFromProfile - update');
  }

  /**
   * Get agent statistics for dashboard
   */
  async getAgentStats(agentId: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    lastUsed?: string;
  }> {
    const userId = await getUserId();

    // Verify ownership
    const agent = await this.getAgentById(agentId);
    if (!agent || agent.user_id !== userId) {
      throw new Error('Agent not found or access denied');
    }

    // Get conversation count - FIXED: Use snake_case
    const { count: conversationCount, error: convError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    // Get message count and last used - FIXED: Use snake_case
    const { data: messageStats, error: msgError } = await supabase
      .from('messages')
      .select('created_at')
      .in('conversation_id', 
        supabase
          .from('conversations')
          .select('id')
          .eq('agent_id', agentId)
      )
      .order('created_at', { ascending: false })
      .limit(1);

    return {
      totalConversations: conversationCount || 0,
      totalMessages: messageStats?.length || 0,
      lastUsed: messageStats?.[0]?.created_at
    };
  }
}

export const agentsApi = new AgentsAPI();