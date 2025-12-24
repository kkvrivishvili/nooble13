-- ============================================
-- Nooble8 Database Schema
-- File: init_07_widgets.sql
-- Description: Widget tables with position and is_active fields
-- Version: 7.0 (SINKULAR NAMES & RESET)
-- ============================================

-- RESET: Clean up existing tables and functions
DROP FUNCTION IF EXISTS get_user_widgets_ordered(uuid, boolean);
DROP FUNCTION IF EXISTS count_user_widgets_by_type(uuid, text);
DROP FUNCTION IF EXISTS get_next_widget_position(uuid);

DROP TABLE IF EXISTS public.widget_links CASCADE;
DROP TABLE IF EXISTS public.widget_link CASCADE;
DROP TABLE IF EXISTS public.widget_gallery CASCADE;
DROP TABLE IF EXISTS public.widget_agents CASCADE;
DROP TABLE IF EXISTS public.widget_youtube CASCADE;
DROP TABLE IF EXISTS public.widget_maps CASCADE;
DROP TABLE IF EXISTS public.widget_map CASCADE;
DROP TABLE IF EXISTS public.widget_spotify CASCADE;
DROP TABLE IF EXISTS public.widget_calendar CASCADE;
DROP TABLE IF EXISTS public.widget_separator CASCADE;
DROP TABLE IF EXISTS public.widget_title CASCADE;

-- ============================================
-- COMMON FIELDS FOR ALL WIDGETS:
-- - user_id (FK to profiles)
-- - position (unique per user, for ordering)
-- - is_active (visibility toggle)
-- - created_at, updated_at
-- ============================================

-- ============================================
-- WIDGET: LINK
-- ============================================

CREATE TABLE public.widget_link (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Link specific fields
    title text NOT NULL,
    url text NOT NULL,
    description text,
    icon text,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Max 49 link widgets per user
    CONSTRAINT widget_link_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_link_user ON public.widget_link(user_id);
CREATE INDEX idx_widget_link_position ON public.widget_link(user_id, position);
CREATE INDEX idx_widget_link_active ON public.widget_link(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_link_updated_at 
    BEFORE UPDATE ON public.widget_link
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: GALLERY
-- ============================================

CREATE TABLE public.widget_gallery (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Gallery specific fields
    title text,
    products jsonb DEFAULT '[]'::jsonb,  -- Array of product IDs
    show_price boolean DEFAULT true,
    show_description boolean DEFAULT true,
    columns integer DEFAULT 3 CHECK (columns BETWEEN 1 AND 4),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_gallery_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_gallery_user ON public.widget_gallery(user_id);
CREATE INDEX idx_widget_gallery_position ON public.widget_gallery(user_id, position);
CREATE INDEX idx_widget_gallery_active ON public.widget_gallery(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_gallery_updated_at 
    BEFORE UPDATE ON public.widget_gallery
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: AGENTS
-- ============================================

CREATE TABLE public.widget_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Agents widget specific fields
    title text DEFAULT 'Chat with our agents',
    agent_ids jsonb DEFAULT '[]'::jsonb,  -- Array of agent IDs to display
    display_style text DEFAULT 'card' CHECK (display_style IN ('card', 'list', 'bubble')),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_agents_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_agents_user ON public.widget_agents(user_id);
CREATE INDEX idx_widget_agents_position ON public.widget_agents(user_id, position);
CREATE INDEX idx_widget_agents_active ON public.widget_agents(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_agents_updated_at 
    BEFORE UPDATE ON public.widget_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: YOUTUBE
-- ============================================

CREATE TABLE public.widget_youtube (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- YouTube specific fields
    video_url text NOT NULL,
    title text,
    autoplay boolean DEFAULT false,
    show_controls boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_youtube_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_youtube_user ON public.widget_youtube(user_id);
CREATE INDEX idx_widget_youtube_position ON public.widget_youtube(user_id, position);
CREATE INDEX idx_widget_youtube_active ON public.widget_youtube(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_youtube_updated_at 
    BEFORE UPDATE ON public.widget_youtube
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: MAP
-- ============================================

CREATE TABLE public.widget_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Maps specific fields
    address text NOT NULL,
    latitude decimal(10, 8),
    longitude decimal(11, 8),
    zoom_level integer DEFAULT 15 CHECK (zoom_level BETWEEN 1 AND 20),
    map_style text DEFAULT 'roadmap',
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_map_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_map_user ON public.widget_map(user_id);
CREATE INDEX idx_widget_map_position ON public.widget_map(user_id, position);
CREATE INDEX idx_widget_map_active ON public.widget_map(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_map_updated_at 
    BEFORE UPDATE ON public.widget_map
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: SPOTIFY
-- ============================================

CREATE TABLE public.widget_spotify (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Spotify specific fields
    spotify_url text NOT NULL,
    embed_type text DEFAULT 'playlist' CHECK (embed_type IN ('track', 'playlist', 'album', 'artist')),
    height integer DEFAULT 380,
    theme text DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_spotify_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_spotify_user ON public.widget_spotify(user_id);
CREATE INDEX idx_widget_spotify_position ON public.widget_spotify(user_id, position);
CREATE INDEX idx_widget_spotify_active ON public.widget_spotify(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_spotify_updated_at 
    BEFORE UPDATE ON public.widget_spotify
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: CALENDAR (Calendly)
-- ============================================

CREATE TABLE public.widget_calendar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Calendar specific fields
    calendly_url text NOT NULL,
    title text DEFAULT 'Schedule a meeting',
    hide_event_details boolean DEFAULT false,
    hide_cookie_banner boolean DEFAULT true,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_calendar_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_calendar_user ON public.widget_calendar(user_id);
CREATE INDEX idx_widget_calendar_position ON public.widget_calendar(user_id, position);
CREATE INDEX idx_widget_calendar_active ON public.widget_calendar(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_calendar_updated_at 
    BEFORE UPDATE ON public.widget_calendar
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: SEPARATOR
-- ============================================

CREATE TABLE public.widget_separator (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Separator specific fields
    style text DEFAULT 'solid' CHECK (style IN ('solid', 'dashed', 'dotted')),
    thickness integer DEFAULT 1 CHECK (thickness BETWEEN 1 AND 5),
    color text DEFAULT '#cccccc',
    margin_top integer DEFAULT 20,
    margin_bottom integer DEFAULT 20,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_separator_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_separator_user ON public.widget_separator(user_id);
CREATE INDEX idx_widget_separator_position ON public.widget_separator(user_id, position);
CREATE INDEX idx_widget_separator_active ON public.widget_separator(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_separator_updated_at 
    BEFORE UPDATE ON public.widget_separator
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WIDGET: TITLE
-- ============================================

CREATE TABLE public.widget_title (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Widget common fields
    position integer NOT NULL DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Title specific fields
    text text NOT NULL,
    font_size text DEFAULT 'xl' CHECK (font_size IN ('sm', 'md', 'lg', 'xl', '2xl', '3xl')),
    text_align text DEFAULT 'center' CHECK (text_align IN ('left', 'center', 'right')),
    font_weight text DEFAULT 'bold' CHECK (font_weight IN ('normal', 'medium', 'semibold', 'bold')),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT widget_title_max_per_user CHECK (position < 49)
);

CREATE INDEX idx_widget_title_user ON public.widget_title(user_id);
CREATE INDEX idx_widget_title_position ON public.widget_title(user_id, position);
CREATE INDEX idx_widget_title_active ON public.widget_title(user_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_widget_title_updated_at 
    BEFORE UPDATE ON public.widget_title
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES FOR ALL WIDGETS
-- ============================================

-- Enable RLS on all widget tables
ALTER TABLE public.widget_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_youtube ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_spotify ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_separator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_title ENABLE ROW LEVEL SECURITY;

-- ============================================
-- WIDGET_LINK POLICIES
-- ============================================

CREATE POLICY "Anyone can view link widgets of public profiles"
    ON public.widget_link FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own link widgets"
    ON public.widget_link FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to link widgets"
    ON public.widget_link FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_GALLERY POLICIES
-- ============================================

CREATE POLICY "Anyone can view gallery widgets of public profiles"
    ON public.widget_gallery FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own gallery widgets"
    ON public.widget_gallery FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to gallery widgets"
    ON public.widget_gallery FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_AGENTS POLICIES
-- ============================================

CREATE POLICY "Anyone can view agent widgets of public profiles"
    ON public.widget_agents FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own agent widgets"
    ON public.widget_agents FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to agent widgets"
    ON public.widget_agents FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_YOUTUBE POLICIES
-- ============================================

CREATE POLICY "Anyone can view youtube widgets of public profiles"
    ON public.widget_youtube FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own youtube widgets"
    ON public.widget_youtube FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to youtube widgets"
    ON public.widget_youtube FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_MAP POLICIES
-- ============================================

CREATE POLICY "Anyone can view map widgets of public profiles"
    ON public.widget_map FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own map widgets"
    ON public.widget_map FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to map widgets"
    ON public.widget_map FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_SPOTIFY POLICIES
-- ============================================

CREATE POLICY "Anyone can view spotify widgets of public profiles"
    ON public.widget_spotify FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own spotify widgets"
    ON public.widget_spotify FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to spotify widgets"
    ON public.widget_spotify FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_CALENDAR POLICIES
-- ============================================

CREATE POLICY "Anyone can view calendar widgets of public profiles"
    ON public.widget_calendar FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own calendar widgets"
    ON public.widget_calendar FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to calendar widgets"
    ON public.widget_calendar FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_SEPARATOR POLICIES
-- ============================================

CREATE POLICY "Anyone can view separator widgets of public profiles"
    ON public.widget_separator FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own separator widgets"
    ON public.widget_separator FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to separator widgets"
    ON public.widget_separator FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- WIDGET_TITLE POLICIES
-- ============================================

CREATE POLICY "Anyone can view title widgets of public profiles"
    ON public.widget_title FOR SELECT
    USING (user_id IN (SELECT id FROM profiles WHERE is_public = true));

CREATE POLICY "Users can manage their own title widgets"
    ON public.widget_title FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to title widgets"
    ON public.widget_title FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.widget_link TO anon;
GRANT ALL ON public.widget_link TO authenticated;
GRANT ALL ON public.widget_link TO service_role;

GRANT SELECT ON public.widget_gallery TO anon;
GRANT ALL ON public.widget_gallery TO authenticated;
GRANT ALL ON public.widget_gallery TO service_role;

GRANT SELECT ON public.widget_agents TO anon;
GRANT ALL ON public.widget_agents TO authenticated;
GRANT ALL ON public.widget_agents TO service_role;

GRANT SELECT ON public.widget_youtube TO anon;
GRANT ALL ON public.widget_youtube TO authenticated;
GRANT ALL ON public.widget_youtube TO service_role;

GRANT SELECT ON public.widget_map TO anon;
GRANT ALL ON public.widget_map TO authenticated;
GRANT ALL ON public.widget_map TO service_role;

GRANT SELECT ON public.widget_spotify TO anon;
GRANT ALL ON public.widget_spotify TO authenticated;
GRANT ALL ON public.widget_spotify TO service_role;

GRANT SELECT ON public.widget_calendar TO anon;
GRANT ALL ON public.widget_calendar TO authenticated;
GRANT ALL ON public.widget_calendar TO service_role;

GRANT SELECT ON public.widget_separator TO anon;
GRANT ALL ON public.widget_separator TO authenticated;
GRANT ALL ON public.widget_separator TO service_role;

GRANT SELECT ON public.widget_title TO anon;
GRANT ALL ON public.widget_title TO authenticated;
GRANT ALL ON public.widget_title TO service_role;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get all widgets for a user ordered by position
CREATE OR REPLACE FUNCTION get_user_widgets_ordered(p_user_id uuid, p_active_only boolean DEFAULT true)
RETURNS TABLE (
    id uuid,
    "widget_type" widget_type,
    "position" integer,
    is_active boolean,
    data jsonb,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id, 
        'link'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('title', w.title, 'url', w.url, 'description', w.description, 'icon', w.icon),
        w.created_at,
        w.updated_at
    FROM widget_link w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'gallery'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('title', w.title, 'products', w.products, 'show_price', w.show_price, 'show_description', w.show_description, 'columns', w.columns),
        w.created_at,
        w.updated_at
    FROM widget_gallery w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'agents'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('title', w.title, 'agent_ids', w.agent_ids, 'display_style', w.display_style),
        w.created_at,
        w.updated_at
    FROM widget_agents w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'youtube'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('video_url', w.video_url, 'title', w.title, 'autoplay', w.autoplay, 'show_controls', w.show_controls),
        w.created_at,
        w.updated_at
    FROM widget_youtube w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'maps'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('address', w.address, 'latitude', w.latitude, 'longitude', w.longitude, 'zoom_level', w.zoom_level, 'map_style', w.map_style),
        w.created_at,
        w.updated_at
    FROM widget_map w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'spotify'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('spotify_url', w.spotify_url, 'embed_type', w.embed_type, 'height', w.height, 'theme', w.theme),
        w.created_at,
        w.updated_at
    FROM widget_spotify w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'calendar'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('calendly_url', w.calendly_url, 'title', w.title, 'hide_event_details', w.hide_event_details, 'hide_cookie_banner', w.hide_cookie_banner),
        w.created_at,
        w.updated_at
    FROM widget_calendar w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'separator'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('style', w.style, 'thickness', w.thickness, 'color', w.color, 'margin_top', w.margin_top, 'margin_bottom', w.margin_bottom),
        w.created_at,
        w.updated_at
    FROM widget_separator w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    UNION ALL
    
    SELECT 
        w.id,
        'title'::widget_type,
        w.position,
        w.is_active,
        jsonb_build_object('text', w.text, 'font_size', w.font_size, 'text_align', w.text_align, 'font_weight', w.font_weight),
        w.created_at,
        w.updated_at
    FROM widget_title w
    WHERE w.user_id = p_user_id AND (NOT p_active_only OR w.is_active = true)
    
    ORDER BY "position";
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Count widgets by type for a user
CREATE OR REPLACE FUNCTION count_user_widgets_by_type(p_user_id uuid, p_widget_type text)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    EXECUTE format(
        'SELECT COUNT(*)::integer FROM widget_%s WHERE user_id = $1',
        p_widget_type
    ) INTO v_count USING p_user_id;
    
    RETURN COALESCE(v_count, 0);
EXCEPTION WHEN undefined_table THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get next available position for a user
CREATE OR REPLACE FUNCTION get_next_widget_position(p_user_id uuid)
RETURNS integer AS $$
DECLARE
    v_max_position integer;
BEGIN
    SELECT MAX(position) INTO v_max_position
    FROM (
        SELECT position FROM widget_link WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_gallery WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_agents WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_youtube WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_map WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_spotify WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_calendar WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_separator WHERE user_id = p_user_id
        UNION ALL SELECT position FROM widget_title WHERE user_id = p_user_id
    ) all_widgets;
    
    RETURN COALESCE(v_max_position, -1) + 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- GRANTS FOR FUNCTIONS
-- ============================================

GRANT EXECUTE ON FUNCTION get_user_widgets_ordered TO anon;
GRANT EXECUTE ON FUNCTION get_user_widgets_ordered TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_widgets_ordered TO service_role;

GRANT EXECUTE ON FUNCTION count_user_widgets_by_type TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_widgets_by_type TO service_role;

GRANT EXECUTE ON FUNCTION get_next_widget_position TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_widget_position TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.widget_link IS 'Link widgets for user profiles';
COMMENT ON TABLE public.widget_gallery IS 'Product gallery widgets';
COMMENT ON TABLE public.widget_agents IS 'AI agent chat widgets';
COMMENT ON TABLE public.widget_youtube IS 'YouTube embed widgets';
COMMENT ON TABLE public.widget_map IS 'Google Maps embed widgets';
COMMENT ON TABLE public.widget_spotify IS 'Spotify embed widgets';
COMMENT ON TABLE public.widget_calendar IS 'Calendly scheduling widgets';
COMMENT ON TABLE public.widget_separator IS 'Visual separator widgets';
COMMENT ON TABLE public.widget_title IS 'Title/heading widgets';

COMMENT ON FUNCTION get_user_widgets_ordered IS 'Returns all widgets for a user ordered by position';
COMMENT ON FUNCTION count_user_widgets_by_type IS 'Counts widgets of a specific type for a user';
COMMENT ON FUNCTION get_next_widget_position IS 'Returns the next available position for a new widget';
