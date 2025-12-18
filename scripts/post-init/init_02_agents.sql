-- Nooble8 Agents Schema
-- Version: 5.0 - Snake Case
-- Description: Agent templates and user agents with snake_case convention

-- Step 1: Create agent_templates table
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
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Step 2: Create agents table
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.agent_templates(id),
  name text NOT NULL,
  description text,
  icon text DEFAULT '🤖',
  system_prompt_override text, -- User's additional prompt
  query_config jsonb NOT NULL,
  rag_config jsonb NOT NULL,
  execution_config jsonb NOT NULL,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true, -- Can be accessed by visitors
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_agent_name_per_user UNIQUE(user_id, name)
);

-- Step 3: Create a function to get the full system prompt
CREATE OR REPLACE FUNCTION get_agent_system_prompt(agent_id uuid)
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
  WHERE a.id = agent_id;
  
  RETURN COALESCE(v_template_prompt, '') || 
         CASE 
           WHEN v_override_prompt IS NOT NULL AND v_override_prompt != '' 
           THEN E'\n\n' || v_override_prompt 
           ELSE '' 
         END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 4: Create a view that includes the computed system prompt
CREATE OR REPLACE VIEW agents_with_prompt AS
SELECT 
  a.*,
  get_agent_system_prompt(a.id) as system_prompt
FROM agents a;

-- Step 5: Create indexes
CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_agents_template_id ON public.agents(template_id);
CREATE INDEX idx_agents_is_public ON public.agents(is_public) WHERE is_public = true;
CREATE INDEX idx_agents_is_active ON public.agents(is_active) WHERE is_active = true;

-- Step 6: Add triggers for updated_at
CREATE TRIGGER update_agent_templates_updated_at 
  BEFORE UPDATE ON public.agent_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at 
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 7: Grant permissions
GRANT SELECT ON public.agent_templates TO anon;
GRANT SELECT ON public.agent_templates TO authenticated;

GRANT ALL ON public.agents TO authenticated;
GRANT SELECT ON public.agents TO anon;

GRANT SELECT ON agents_with_prompt TO authenticated;
GRANT SELECT ON agents_with_prompt TO anon;

-- Step 8: Enable RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Step 9: RLS Policies for agent_templates (read-only for everyone)
CREATE POLICY "Agent templates are viewable by everyone" ON public.agent_templates
  FOR SELECT TO anon, authenticated
  USING (true);

-- Step 10: RLS Policies for agents
CREATE POLICY "Users can view their own agents" ON public.agents
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public agents" ON public.agents
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Users can insert their own agents" ON public.agents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents" ON public.agents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agents" ON public.agents
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Step 11: Function to copy agent from template
CREATE OR REPLACE FUNCTION copy_agent_from_template(
  p_user_id uuid,
  p_template_id uuid,
  p_agent_name text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_new_agent_id uuid;
  v_template RECORD;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM agent_templates
  WHERE id = p_template_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or inactive';
  END IF;
  
  -- Insert new agent
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
    COALESCE(p_agent_name, v_template.name),
    v_template.description,
    v_template.icon,
    NULL, -- No override initially
    v_template.default_query_config,
    v_template.default_rag_config,
    v_template.default_execution_config,
    true,
    true
  ) RETURNING id INTO v_new_agent_id;
  
  RETURN v_new_agent_id;
END;
$$ LANGUAGE plpgsql;