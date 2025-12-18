-- Nooble8 Widgets Schema
-- Version: 5.0 - Snake Case
-- Description: Individual widget tables for profile customization with snake_case convention

-- Widget: Links
CREATE TABLE public.widget_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  description text,
  icon text,
  created_at timestamptz DEFAULT now()
);

-- Widget: Gallery
CREATE TABLE public.widget_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  products jsonb DEFAULT '[]'::jsonb, -- Array of product IDs to display
  show_price boolean DEFAULT true,
  show_description boolean DEFAULT true,
  columns integer DEFAULT 3 CHECK (columns BETWEEN 1 AND 4),
  created_at timestamptz DEFAULT now()
);

-- Widget: Agents
CREATE TABLE public.widget_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text DEFAULT 'Chat with our agents',
  agent_ids jsonb DEFAULT '[]'::jsonb, -- Array of selected agent IDs
  display_style text DEFAULT 'card' CHECK (display_style IN ('card', 'list', 'bubble')),
  created_at timestamptz DEFAULT now()
);

-- Widget: YouTube
CREATE TABLE public.widget_youtube (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  title text,
  autoplay boolean DEFAULT false,
  show_controls boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Widget: Maps
CREATE TABLE public.widget_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address text NOT NULL,
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  zoom_level integer DEFAULT 15 CHECK (zoom_level BETWEEN 1 AND 20),
  map_style text DEFAULT 'roadmap',
  created_at timestamptz DEFAULT now()
);

-- Widget: Spotify
CREATE TABLE public.widget_spotify (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spotify_url text NOT NULL,
  embed_type text DEFAULT 'playlist' CHECK (embed_type IN ('track', 'playlist', 'album', 'artist')),
  height integer DEFAULT 380,
  theme text DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  created_at timestamptz DEFAULT now()
);

-- Widget: Calendar (Calendly)
CREATE TABLE public.widget_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calendly_url text NOT NULL,
  title text DEFAULT 'Schedule a meeting',
  hide_event_details boolean DEFAULT false,
  hide_cookie_banner boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Widget: Separator
CREATE TABLE public.widget_separator (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  style text DEFAULT 'solid' CHECK (style IN ('solid', 'dashed', 'dotted')),
  thickness integer DEFAULT 1 CHECK (thickness BETWEEN 1 AND 5),
  color text DEFAULT '#cccccc',
  margin_top integer DEFAULT 20,
  margin_bottom integer DEFAULT 20,
  created_at timestamptz DEFAULT now()
);

-- Widget: Title
CREATE TABLE public.widget_title (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  font_size text DEFAULT 'xl' CHECK (font_size IN ('sm', 'md', 'lg', 'xl', '2xl', '3xl')),
  text_align text DEFAULT 'center' CHECK (text_align IN ('left', 'center', 'right')),
  font_weight text DEFAULT 'bold' CHECK (font_weight IN ('normal', 'medium', 'semibold', 'bold')),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for all widget tables
CREATE INDEX idx_widget_links_profile ON public.widget_links(profile_id);
CREATE INDEX idx_widget_gallery_profile ON public.widget_gallery(profile_id);
CREATE INDEX idx_widget_agents_profile ON public.widget_agents(profile_id);
CREATE INDEX idx_widget_youtube_profile ON public.widget_youtube(profile_id);
CREATE INDEX idx_widget_maps_profile ON public.widget_maps(profile_id);
CREATE INDEX idx_widget_spotify_profile ON public.widget_spotify(profile_id);
CREATE INDEX idx_widget_calendar_profile ON public.widget_calendar(profile_id);
CREATE INDEX idx_widget_separator_profile ON public.widget_separator(profile_id);
CREATE INDEX idx_widget_title_profile ON public.widget_title(profile_id);

-- Enable RLS for all widget tables
ALTER TABLE public.widget_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_youtube ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_spotify ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_separator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_title ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all widget tables
-- Pattern: Users can CRUD their own widgets, view public profile widgets

-- Widget Links
CREATE POLICY "Users can manage their own link widgets" ON public.widget_links
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view link widgets of public profiles" ON public.widget_links
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Gallery
CREATE POLICY "Users can manage their own gallery widgets" ON public.widget_gallery
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view gallery widgets of public profiles" ON public.widget_gallery
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Agents
CREATE POLICY "Users can manage their own agent widgets" ON public.widget_agents
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view agent widgets of public profiles" ON public.widget_agents
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget YouTube
CREATE POLICY "Users can manage their own youtube widgets" ON public.widget_youtube
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view youtube widgets of public profiles" ON public.widget_youtube
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Maps
CREATE POLICY "Users can manage their own map widgets" ON public.widget_maps
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view map widgets of public profiles" ON public.widget_maps
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Spotify
CREATE POLICY "Users can manage their own spotify widgets" ON public.widget_spotify
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view spotify widgets of public profiles" ON public.widget_spotify
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Calendar
CREATE POLICY "Users can manage their own calendar widgets" ON public.widget_calendar
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view calendar widgets of public profiles" ON public.widget_calendar
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Separator
CREATE POLICY "Users can manage their own separator widgets" ON public.widget_separator
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view separator widgets of public profiles" ON public.widget_separator
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Widget Title
CREATE POLICY "Users can manage their own title widgets" ON public.widget_title
  FOR ALL TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Public can view title widgets of public profiles" ON public.widget_title
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = profile_id AND is_public = true));

-- Grant permissions
GRANT ALL ON public.widget_links TO authenticated;
GRANT SELECT ON public.widget_links TO anon;

GRANT ALL ON public.widget_gallery TO authenticated;
GRANT SELECT ON public.widget_gallery TO anon;

GRANT ALL ON public.widget_agents TO authenticated;
GRANT SELECT ON public.widget_agents TO anon;

GRANT ALL ON public.widget_youtube TO authenticated;
GRANT SELECT ON public.widget_youtube TO anon;

GRANT ALL ON public.widget_maps TO authenticated;
GRANT SELECT ON public.widget_maps TO anon;

GRANT ALL ON public.widget_spotify TO authenticated;
GRANT SELECT ON public.widget_spotify TO anon;

GRANT ALL ON public.widget_calendar TO authenticated;
GRANT SELECT ON public.widget_calendar TO anon;

GRANT ALL ON public.widget_separator TO authenticated;
GRANT SELECT ON public.widget_separator TO anon;

GRANT ALL ON public.widget_title TO authenticated;
GRANT SELECT ON public.widget_title TO anon;