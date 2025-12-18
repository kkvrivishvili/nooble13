-- Nooble8 Conversations Schema
-- Version: 5.0 - Snake Case
-- Description: Conversations and messages for agent interactions with snake_case convention

-- Cleanup: drop dependent objects and tables (recreate from scratch)
create extension if not exists "pgcrypto";
drop view if exists public.conversation_summary cascade;
drop function if exists public.update_conversation_message_count() cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

-- Step 1: Create conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY, -- Deterministic: uuid5(namespace, tenant:session:agent)
  tenant_id uuid NOT NULL, -- Owner of the agent (user_id)
  session_id uuid NOT NULL, -- Visitor's session
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  visitor_info jsonb DEFAULT '{
    "ip": null,
    "location": null,
    "device_type": null,
    "user_agent": null
  }'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean DEFAULT true,
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  CONSTRAINT unique_conversation UNIQUE(tenant_id, session_id, agent_id)
);

-- Step 2: Create messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb, -- tokens used, model, etc.
  created_at timestamptz DEFAULT now()
);

-- Step 3: Create indexes
CREATE INDEX idx_conversations_tenant ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_session ON public.conversations(session_id);
CREATE INDEX idx_conversations_agent ON public.conversations(agent_id);
CREATE INDEX idx_conversations_active ON public.conversations(is_active) WHERE is_active = true;
CREATE INDEX idx_conversations_dates ON public.conversations(started_at, ended_at);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_created ON public.messages(created_at);

-- Step 4: Function to update message count
CREATE OR REPLACE FUNCTION public.update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations 
  SET message_count = message_count + 1,
      last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_message_count_on_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_message_count();

-- Step 5: View for conversation summary
CREATE OR REPLACE VIEW public.conversation_summary AS
SELECT 
  c.id,
  c.tenant_id,
  c.session_id,
  c.agent_id,
  a.name as agent_name,
  c.visitor_info,
  c.started_at,
  c.ended_at,
  c.is_active,
  c.message_count,
  c.last_message_at,
  CASE 
    WHEN c.ended_at IS NOT NULL THEN c.ended_at - c.started_at
    ELSE now() - c.started_at
  END as duration,
  COUNT(m.id) FILTER (WHERE m.role = 'user') as user_messages,
  COUNT(m.id) FILTER (WHERE m.role = 'assistant') as agent_messages
FROM public.conversations c
LEFT JOIN public.agents a ON c.agent_id = a.id
LEFT JOIN public.messages m ON c.id = m.conversation_id
GROUP BY c.id, a.name;

-- Step 6: Auto-close old conversations (3 months)
CREATE OR REPLACE FUNCTION public.auto_close_old_conversations()
RETURNS void AS $$
BEGIN
  UPDATE public.conversations
  SET is_active = false,
      ended_at = last_message_at
  WHERE is_active = true
    AND last_message_at < now() - interval '3 months';
END;
$$ LANGUAGE plpgsql;

-- Step 7: Privileges for service_role (backend only)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO service_role;

-- Refresh PostgREST schema cache
select pg_notify('pgrst', 'reload schema');