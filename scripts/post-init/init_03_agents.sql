-- ============================================
-- Nooble8 Database Schema
-- File: init_03_agents.sql
-- Description: Agents table (templates are in init_09)
-- Version: 6.0
-- ============================================

-- ============================================
-- AGENT TEMPLATES TABLE (Structure only, data in init_09)
-- ============================================

CREATE TABLE public.agent_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    category text NOT NULL,
    description text,
    icon text DEFAULT '🤖',
    system_prompt_template text NOT NULL,
    default_query_config jsonb DEFAULT '{
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 0.9,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": true
    }'::jsonb,
    default_rag_config jsonb DEFAULT '{
        "embedding_model": "text-embedding-3-small",
        "embedding_dimensions": 1536,
        "chunk_size": 512,
        "chunk_overlap": 50,
        "top_k": 10,
        "similarity_threshold": 0.4,
        "hybrid_search": false,
        "rerank": false
    }'::jsonb,
    default_execution_config jsonb DEFAULT '{
        "history_enabled": true,
        "history_window": 10,
        "history_ttl": 3600,
        "max_iterations": 5,
        "timeout_seconds": 30
    }'::jsonb,
    required_plan text DEFAULT 'free',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_templates_category ON public.agent_templates(category);
CREATE INDEX idx_agent_templates_active ON public.agent_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_agent_templates_plan ON public.agent_templates(required_plan);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_agent_templates_updated_at 
    BEFORE UPDATE ON public.agent_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AGENTS TABLE
-- ============================================

CREATE TABLE public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    template_id uuid REFERENCES public.agent_templates(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    icon text DEFAULT '🤖',
    
    -- System prompt: template + user override
    system_prompt_override text,
    
    -- Configuration (copied from template, can be customized)
    query_config jsonb NOT NULL DEFAULT '{
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 0.9,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": true
    }'::jsonb,
    rag_config jsonb NOT NULL DEFAULT '{
        "embedding_model": "text-embedding-3-small",
        "embedding_dimensions": 1536,
        "chunk_size": 512,
        "chunk_overlap": 50,
        "top_k": 10,
        "similarity_threshold": 0.4,
        "hybrid_search": false,
        "rerank": false
    }'::jsonb,
    execution_config jsonb NOT NULL DEFAULT '{
        "history_enabled": true,
        "history_window": 10,
        "history_ttl": 3600,
        "max_iterations": 5,
        "timeout_seconds": 30
    }'::jsonb,
    
    is_active boolean DEFAULT true,
    is_public boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Unique agent name per user
    CONSTRAINT agents_unique_name_per_user UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX idx_agents_user ON public.agents(user_id);
CREATE INDEX idx_agents_template ON public.agents(template_id);
CREATE INDEX idx_agents_public ON public.agents(is_public) WHERE is_public = true;
CREATE INDEX idx_agents_active ON public.agents(is_active) WHERE is_active = true;
CREATE INDEX idx_agents_user_active ON public.agents(user_id, is_active) WHERE is_active = true;

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_agents_updated_at 
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEW: Agents with computed system prompt
-- ============================================

CREATE OR REPLACE VIEW public.agents_with_prompt AS
SELECT 
    a.*,
    COALESCE(at.system_prompt_template, '') || 
    CASE 
        WHEN a.system_prompt_override IS NOT NULL AND a.system_prompt_override != '' 
        THEN E'\n\n' || a.system_prompt_override 
        ELSE '' 
    END AS system_prompt
FROM public.agents a
LEFT JOIN public.agent_templates at ON a.template_id = at.id;

-- ============================================
-- AGENT TEMPLATES RLS POLICIES
-- ============================================

ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view active templates
CREATE POLICY "Active templates are viewable by everyone"
    ON public.agent_templates
    FOR SELECT
    USING (is_active = true);

-- Service role has full access
CREATE POLICY "Service role has full access to templates"
    ON public.agent_templates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- AGENTS RLS POLICIES
-- ============================================

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can view their own agents
CREATE POLICY "Users can view their own agents"
    ON public.agents
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Anyone can view public active agents
CREATE POLICY "Public agents are viewable by everyone"
    ON public.agents
    FOR SELECT
    USING (is_public = true AND is_active = true);

-- Users can create their own agents
CREATE POLICY "Users can create their own agents"
    ON public.agents
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own agents
CREATE POLICY "Users can update their own agents"
    ON public.agents
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own agents
CREATE POLICY "Users can delete their own agents"
    ON public.agents
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to agents"
    ON public.agents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get full system prompt for an agent
CREATE OR REPLACE FUNCTION get_agent_system_prompt(p_agent_id uuid)
RETURNS text AS $$
DECLARE
    v_template_prompt text;
    v_override_prompt text;
BEGIN
    SELECT 
        at.system_prompt_template,
        a.system_prompt_override
    INTO 
        v_template_prompt,
        v_override_prompt
    FROM agents a
    LEFT JOIN agent_templates at ON a.template_id = at.id
    WHERE a.id = p_agent_id;
    
    RETURN COALESCE(v_template_prompt, '') || 
           CASE 
               WHEN v_override_prompt IS NOT NULL AND v_override_prompt != '' 
               THEN E'\n\n' || v_override_prompt 
               ELSE '' 
           END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Copy agent from template
CREATE OR REPLACE FUNCTION copy_agent_from_template(
    p_user_id uuid,
    p_template_id uuid,
    p_agent_name text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_template record;
    v_agent_id uuid;
    v_final_name text;
BEGIN
    -- Get template
    SELECT * INTO v_template
    FROM agent_templates
    WHERE id = p_template_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or inactive';
    END IF;
    
    -- Determine name
    v_final_name := COALESCE(p_agent_name, v_template.name);
    
    -- Create agent
    INSERT INTO agents (
        user_id,
        template_id,
        name,
        description,
        icon,
        system_prompt_override,
        query_config,
        rag_config,
        execution_config,
        is_active,
        is_public
    ) VALUES (
        p_user_id,
        p_template_id,
        v_final_name,
        v_template.description,
        v_template.icon,
        NULL,
        v_template.default_query_config,
        v_template.default_rag_config,
        v_template.default_execution_config,
        true,
        true
    ) RETURNING id INTO v_agent_id;
    
    RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Count user's agents
CREATE OR REPLACE FUNCTION count_user_agents(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer 
        FROM agents 
        WHERE user_id = p_user_id AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.agent_templates TO anon;
GRANT SELECT ON public.agent_templates TO authenticated;
GRANT ALL ON public.agent_templates TO service_role;

GRANT SELECT ON public.agents TO anon;
GRANT ALL ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;

GRANT SELECT ON public.agents_with_prompt TO anon;
GRANT SELECT ON public.agents_with_prompt TO authenticated;
GRANT SELECT ON public.agents_with_prompt TO service_role;

GRANT EXECUTE ON FUNCTION get_agent_system_prompt TO anon;
GRANT EXECUTE ON FUNCTION get_agent_system_prompt TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_system_prompt TO service_role;

GRANT EXECUTE ON FUNCTION copy_agent_from_template TO authenticated;
GRANT EXECUTE ON FUNCTION copy_agent_from_template TO service_role;

GRANT EXECUTE ON FUNCTION count_user_agents TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_agents TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.agent_templates IS 'Catalog of agent templates that users can copy from';
COMMENT ON TABLE public.agents IS 'User-owned agents, potentially derived from templates';
COMMENT ON VIEW public.agents_with_prompt IS 'Agents with computed system_prompt (template + override)';

COMMENT ON COLUMN public.agents.user_id IS 'Owner of the agent - references profiles(id)';
COMMENT ON COLUMN public.agents.template_id IS 'Source template (NULL if custom agent)';
COMMENT ON COLUMN public.agents.system_prompt_override IS 'Additional prompt text appended to template prompt';
COMMENT ON COLUMN public.agent_templates.required_plan IS 'Minimum plan required to use this template: free, pro, business, enterprise';
