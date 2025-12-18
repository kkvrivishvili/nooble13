-- Nooble8 Functions and Triggers
-- Version: 5.0 - Snake Case with proper permissions
-- Description: Helper functions and automation with snake_case convention

-- Function: Generate deterministic conversation ID
CREATE OR REPLACE FUNCTION generate_conversation_id(
  p_tenant_id uuid,
  p_session_id uuid,
  p_agent_id uuid
) RETURNS uuid AS $$
BEGIN
  -- Use a fixed namespace for Nooble8 conversations
  RETURN uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid, -- Fixed namespace
    p_tenant_id::text || ':' || p_session_id::text || ':' || p_agent_id::text
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Create widget helper
CREATE OR REPLACE FUNCTION create_widget(
  p_profile_id uuid,
  p_widget_type text,
  p_widget_data jsonb
) RETURNS uuid AS $$
DECLARE
  v_widget_id uuid;
  v_position integer;
BEGIN
  -- Generate widget ID
  v_widget_id := gen_random_uuid();
  
  -- Get next position
  SELECT COALESCE(MAX((w->>'position')::integer), -1) + 1
  INTO v_position
  FROM profiles p, jsonb_array_elements(p.widgets) w
  WHERE p.id = p_profile_id;
  
  -- Add to profile widgets array
  UPDATE profiles
  SET widgets = widgets || jsonb_build_array(
    jsonb_build_object(
      'id', v_widget_id,
      'type', p_widget_type,
      'position', v_position,
      'is_active', true
    )
  ),
  updated_at = now()
  WHERE id = p_profile_id;
  
  -- Insert widget data into appropriate table
  CASE p_widget_type
    WHEN 'gallery' THEN
      INSERT INTO widget_gallery (id, profile_id, title, products, show_price, show_description, columns)
      VALUES (v_widget_id, p_profile_id, 
              p_widget_data->>'title', 
              COALESCE(p_widget_data->'products', '[]'::jsonb),
              COALESCE((p_widget_data->>'show_price')::boolean, true),
              COALESCE((p_widget_data->>'show_description')::boolean, true),
              COALESCE((p_widget_data->>'columns')::integer, 3));
    WHEN 'agents' THEN
      INSERT INTO widget_agents (id, profile_id, title, agent_ids, display_style)
      VALUES (v_widget_id, p_profile_id,
              COALESCE(p_widget_data->>'title', 'Chat con nuestros agentes'),
              COALESCE(p_widget_data->'agent_ids', '[]'::jsonb),
              COALESCE(p_widget_data->>'display_style', 'card'));
    WHEN 'youtube' THEN
      INSERT INTO widget_youtube (id, profile_id, video_url, title, autoplay, show_controls)
      VALUES (v_widget_id, p_profile_id,
              p_widget_data->>'video_url',
              p_widget_data->>'title',
              COALESCE((p_widget_data->>'autoplay')::boolean, false),
              COALESCE((p_widget_data->>'show_controls')::boolean, true));
    WHEN 'maps' THEN
      INSERT INTO widget_maps (id, profile_id, address, latitude, longitude, zoom_level, map_style)
      VALUES (v_widget_id, p_profile_id,
              p_widget_data->>'address',
              (p_widget_data->>'latitude')::decimal,
              (p_widget_data->>'longitude')::decimal,
              COALESCE((p_widget_data->>'zoom_level')::integer, 15),
              COALESCE(p_widget_data->>'map_style', 'roadmap'));
    WHEN 'spotify' THEN
      INSERT INTO widget_spotify (id, profile_id, spotify_url, embed_type, height, theme)
      VALUES (v_widget_id, p_profile_id, 
              p_widget_data->>'spotify_url',
              COALESCE(p_widget_data->>'embed_type', 'playlist'),
              COALESCE((p_widget_data->>'height')::integer, 380),
              COALESCE(p_widget_data->>'theme', 'dark'));
    WHEN 'calendar' THEN
      INSERT INTO widget_calendar (id, profile_id, calendly_url, title, hide_event_details, hide_cookie_banner)
      VALUES (v_widget_id, p_profile_id,
              p_widget_data->>'calendly_url',
              COALESCE(p_widget_data->>'title', 'Schedule a meeting'),
              COALESCE((p_widget_data->>'hide_event_details')::boolean, false),
              COALESCE((p_widget_data->>'hide_cookie_banner')::boolean, true));
    WHEN 'separator' THEN
      INSERT INTO widget_separator (id, profile_id, style, thickness, color, margin_top, margin_bottom)
      VALUES (v_widget_id, p_profile_id,
              COALESCE(p_widget_data->>'style', 'solid'),
              COALESCE((p_widget_data->>'thickness')::integer, 1),
              COALESCE(p_widget_data->>'color', '#cccccc'),
              COALESCE((p_widget_data->>'margin_top')::integer, 20),
              COALESCE((p_widget_data->>'margin_bottom')::integer, 20));
    WHEN 'title' THEN
      INSERT INTO widget_title (id, profile_id, text, font_size, text_align, font_weight)
      VALUES (v_widget_id, p_profile_id,
              p_widget_data->>'text',
              COALESCE(p_widget_data->>'font_size', 'xl'),
              COALESCE(p_widget_data->>'text_align', 'center'),
              COALESCE(p_widget_data->>'font_weight', 'bold'));
    WHEN 'link' THEN
      INSERT INTO widget_links (id, profile_id, title, url, description, icon)
      VALUES (v_widget_id, p_profile_id,
              p_widget_data->>'title',
              p_widget_data->>'url',
              p_widget_data->>'description',
              p_widget_data->>'icon');
  END CASE;
  
  RETURN v_widget_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Reorder widgets
CREATE OR REPLACE FUNCTION reorder_widgets(
  p_profile_id uuid,
  p_widget_ids uuid[]
) RETURNS void AS $$
DECLARE
  v_widgets jsonb;
  v_widget jsonb;
  v_new_widgets jsonb := '[]'::jsonb;
  v_position integer := 0;
  v_widget_id uuid;
BEGIN
  -- Get current widgets
  SELECT widgets INTO v_widgets
  FROM profiles
  WHERE id = p_profile_id;
  
  -- Rebuild widgets array in new order
  FOREACH v_widget_id IN ARRAY p_widget_ids LOOP
    FOR v_widget IN SELECT * FROM jsonb_array_elements(v_widgets) LOOP
      IF (v_widget->>'id')::uuid = v_widget_id THEN
        v_new_widgets := v_new_widgets || jsonb_set(
          v_widget,
          '{position}',
          to_jsonb(v_position)
        );
        v_position := v_position + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Update profile
  UPDATE profiles
  SET widgets = v_new_widgets,
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Copy agent from template
CREATE OR REPLACE FUNCTION copy_agent_from_template(
  p_user_id uuid,
  p_template_id uuid,
  p_agent_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_template record;
  v_agent_id uuid;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM agent_templates
  WHERE id = p_template_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or inactive';
  END IF;
  
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
    execution_config
  ) VALUES (
    p_user_id,
    p_template_id,
    COALESCE(p_agent_name, v_template.name),
    v_template.description,
    v_template.icon,
    NULL, -- No override initially
    v_template.default_query_config,
    v_template.default_rag_config,
    v_template.default_execution_config
  ) RETURNING id INTO v_agent_id;
  
  -- Add agent ID to user's profile
  UPDATE profiles
  SET agents = agents || to_jsonb(v_agent_id::text),
      updated_at = now()
  WHERE id = p_user_id;
  
  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Simplified handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, description, avatar, social_links, agents, widgets)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    'Bienvenido a mi Nooble',
    COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-create trigger after updating function
DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- IMPORTANT: Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION create_widget TO authenticated;
GRANT EXECUTE ON FUNCTION create_widget TO anon;
GRANT EXECUTE ON FUNCTION reorder_widgets TO authenticated;
GRANT EXECUTE ON FUNCTION copy_agent_from_template TO authenticated;
GRANT EXECUTE ON FUNCTION generate_conversation_id TO authenticated;
GRANT EXECUTE ON FUNCTION generate_conversation_id TO anon;