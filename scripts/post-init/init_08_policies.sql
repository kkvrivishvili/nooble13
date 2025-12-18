-- Nooble8 RLS Policies
-- Version: 5.0 - Snake Case
-- Description: Row Level Security policies with snake_case convention

-- Enable RLS on all tables
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents_rag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_youtube ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_spotify ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_separator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_title ENABLE ROW LEVEL SECURITY;

-- AGENT TEMPLATES (public read)
CREATE POLICY "Agent templates are viewable by everyone" ON public.agent_templates
  FOR SELECT USING (is_active = true);

-- AGENTS
CREATE POLICY "Public agents are viewable by everyone" ON public.agents
  FOR SELECT USING (is_public = true AND is_active = true);

CREATE POLICY "Users can view their own agents" ON public.agents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own agents" ON public.agents
  FOR ALL USING (auth.uid() = user_id);

-- CONVERSATIONS
CREATE POLICY "Anyone can create conversations with public agents" ON public.conversations
  FOR INSERT WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE is_public = true AND is_active = true)
  );

-- MESSAGES
CREATE POLICY "Users can view messages in conversations they have access to" ON public.messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE 
      auth.uid() = tenant_id OR
      agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Anyone can create messages in their conversations" ON public.messages
  FOR INSERT WITH CHECK (true);

-- DOCUMENTS
CREATE POLICY "Users can manage their own documents" ON public.documents_rag
  FOR ALL USING (auth.uid() = profile_id);

-- PRODUCTS
CREATE POLICY "Products of public profiles are viewable" ON public.products
  FOR SELECT USING (
    tenant_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own products" ON public.products
  FOR ALL USING (auth.uid() = tenant_id);

-- WIDGET POLICIES (all widget tables)
-- Pattern: Anyone can view widgets, users can manage their own

-- Widget Links
CREATE POLICY "Anyone can view link widgets" ON public.widget_links
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own link widgets" ON public.widget_links
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Gallery
CREATE POLICY "Anyone can view gallery widgets" ON public.widget_gallery
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own gallery widgets" ON public.widget_gallery
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Agents
CREATE POLICY "Anyone can view agent widgets" ON public.widget_agents
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own agent widgets" ON public.widget_agents
  FOR ALL USING (auth.uid() = profile_id);

-- Widget YouTube
CREATE POLICY "Anyone can view youtube widgets" ON public.widget_youtube
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own youtube widgets" ON public.widget_youtube
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Maps
CREATE POLICY "Anyone can view map widgets" ON public.widget_maps
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own map widgets" ON public.widget_maps
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Spotify
CREATE POLICY "Anyone can view spotify widgets" ON public.widget_spotify
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own spotify widgets" ON public.widget_spotify
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Calendar
CREATE POLICY "Anyone can view calendar widgets" ON public.widget_calendar
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own calendar widgets" ON public.widget_calendar
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Separator
CREATE POLICY "Anyone can view separator widgets" ON public.widget_separator
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own separator widgets" ON public.widget_separator
  FOR ALL USING (auth.uid() = profile_id);

-- Widget Title
CREATE POLICY "Anyone can view title widgets" ON public.widget_title
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own title widgets" ON public.widget_title
  FOR ALL USING (auth.uid() = profile_id);