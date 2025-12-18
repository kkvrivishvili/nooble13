-- Migration: Fix 403 Forbidden errors for widget access
-- This script ensures RLS policies are correctly set for public widget access
-- Note: This migration may be redundant if init_08_policies.sql already ran
-- 
-- IMPORTANT: This migration is only needed if you're experiencing 403 errors
-- when accessing widgets. If init_08_policies.sql ran successfully, this
-- migration can be skipped.
--
-- Design principle: 
-- - Widgets are PUBLIC by default (anyone can view them)
-- - Only profile owners can create/update/delete their widgets

-- Grant necessary permissions to all roles for widget tables
GRANT SELECT ON public.widget_links TO anon;
GRANT SELECT ON public.widget_links TO authenticated;
GRANT ALL ON public.widget_links TO authenticated;

GRANT SELECT ON public.widget_gallery TO anon;
GRANT SELECT ON public.widget_gallery TO authenticated;
GRANT ALL ON public.widget_gallery TO authenticated;

GRANT SELECT ON public.widget_agents TO anon;
GRANT SELECT ON public.widget_agents TO authenticated;
GRANT ALL ON public.widget_agents TO authenticated;

GRANT SELECT ON public.widget_youtube TO anon;
GRANT SELECT ON public.widget_youtube TO authenticated;
GRANT ALL ON public.widget_youtube TO authenticated;

GRANT SELECT ON public.widget_maps TO anon;
GRANT SELECT ON public.widget_maps TO authenticated;
GRANT ALL ON public.widget_maps TO authenticated;

GRANT SELECT ON public.widget_spotify TO anon;
GRANT SELECT ON public.widget_spotify TO authenticated;
GRANT ALL ON public.widget_spotify TO authenticated;

GRANT SELECT ON public.widget_calendar TO anon;
GRANT SELECT ON public.widget_calendar TO authenticated;
GRANT ALL ON public.widget_calendar TO authenticated;

GRANT SELECT ON public.widget_separator TO anon;
GRANT SELECT ON public.widget_separator TO authenticated;
GRANT ALL ON public.widget_separator TO authenticated;

GRANT SELECT ON public.widget_title TO anon;
GRANT SELECT ON public.widget_title TO authenticated;
GRANT ALL ON public.widget_title TO authenticated;

-- Fix RLS policies to match the intended design:
-- - Anyone (including anonymous) can VIEW widgets
-- - Only authenticated users can manage their own widgets

-- WIDGET LINKS
DROP POLICY IF EXISTS "Authenticated users can view all link widgets" ON public.widget_links;
DROP POLICY IF EXISTS "Users can view their own link widgets" ON public.widget_links;
DROP POLICY IF EXISTS "Users can manage their own link widgets" ON public.widget_links;
DROP POLICY IF EXISTS "Anyone can view link widgets" ON public.widget_links;

CREATE POLICY "Anyone can view link widgets" ON public.widget_links
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own link widgets" ON public.widget_links
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET GALLERY
DROP POLICY IF EXISTS "Authenticated users can view all gallery widgets" ON public.widget_gallery;
DROP POLICY IF EXISTS "Users can view their own gallery widgets" ON public.widget_gallery;
DROP POLICY IF EXISTS "Users can manage their own gallery widgets" ON public.widget_gallery;
DROP POLICY IF EXISTS "Anyone can view gallery widgets" ON public.widget_gallery;

CREATE POLICY "Anyone can view gallery widgets" ON public.widget_gallery
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own gallery widgets" ON public.widget_gallery
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET AGENTS
DROP POLICY IF EXISTS "Authenticated users can view all agent widgets" ON public.widget_agents;
DROP POLICY IF EXISTS "Users can view their own agent widgets" ON public.widget_agents;
DROP POLICY IF EXISTS "Users can manage their own agent widgets" ON public.widget_agents;
DROP POLICY IF EXISTS "Anyone can view agent widgets" ON public.widget_agents;

CREATE POLICY "Anyone can view agent widgets" ON public.widget_agents
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own agent widgets" ON public.widget_agents
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET YOUTUBE
DROP POLICY IF EXISTS "Authenticated users can view all youtube widgets" ON public.widget_youtube;
DROP POLICY IF EXISTS "Users can view their own youtube widgets" ON public.widget_youtube;
DROP POLICY IF EXISTS "Users can manage their own youtube widgets" ON public.widget_youtube;
DROP POLICY IF EXISTS "Anyone can view youtube widgets" ON public.widget_youtube;

CREATE POLICY "Anyone can view youtube widgets" ON public.widget_youtube
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own youtube widgets" ON public.widget_youtube
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET MAPS
DROP POLICY IF EXISTS "Authenticated users can view all map widgets" ON public.widget_maps;
DROP POLICY IF EXISTS "Users can view their own map widgets" ON public.widget_maps;
DROP POLICY IF EXISTS "Users can manage their own map widgets" ON public.widget_maps;
DROP POLICY IF EXISTS "Anyone can view map widgets" ON public.widget_maps;

CREATE POLICY "Anyone can view map widgets" ON public.widget_maps
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own map widgets" ON public.widget_maps
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET SPOTIFY
DROP POLICY IF EXISTS "Authenticated users can view all spotify widgets" ON public.widget_spotify;
DROP POLICY IF EXISTS "Users can view their own spotify widgets" ON public.widget_spotify;
DROP POLICY IF EXISTS "Users can manage their own spotify widgets" ON public.widget_spotify;
DROP POLICY IF EXISTS "Anyone can view spotify widgets" ON public.widget_spotify;

CREATE POLICY "Anyone can view spotify widgets" ON public.widget_spotify
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own spotify widgets" ON public.widget_spotify
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET CALENDAR
DROP POLICY IF EXISTS "Authenticated users can view all calendar widgets" ON public.widget_calendar;
DROP POLICY IF EXISTS "Users can view their own calendar widgets" ON public.widget_calendar;
DROP POLICY IF EXISTS "Users can manage their own calendar widgets" ON public.widget_calendar;
DROP POLICY IF EXISTS "Anyone can view calendar widgets" ON public.widget_calendar;

CREATE POLICY "Anyone can view calendar widgets" ON public.widget_calendar
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own calendar widgets" ON public.widget_calendar
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET SEPARATOR
DROP POLICY IF EXISTS "Authenticated users can view all separator widgets" ON public.widget_separator;
DROP POLICY IF EXISTS "Users can view their own separator widgets" ON public.widget_separator;
DROP POLICY IF EXISTS "Users can manage their own separator widgets" ON public.widget_separator;
DROP POLICY IF EXISTS "Anyone can view separator widgets" ON public.widget_separator;

CREATE POLICY "Anyone can view separator widgets" ON public.widget_separator
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own separator widgets" ON public.widget_separator
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- WIDGET TITLE
DROP POLICY IF EXISTS "Authenticated users can view all title widgets" ON public.widget_title;
DROP POLICY IF EXISTS "Users can view their own title widgets" ON public.widget_title;
DROP POLICY IF EXISTS "Users can manage their own title widgets" ON public.widget_title;
DROP POLICY IF EXISTS "Anyone can view title widgets" ON public.widget_title;

CREATE POLICY "Anyone can view title widgets" ON public.widget_title
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own title widgets" ON public.widget_title
  FOR ALL USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Commit the changes
COMMIT;

-- WIDGET GALLERY
DROP POLICY IF EXISTS "Authenticated users can view all gallery widgets" ON public.widget_gallery;
DROP POLICY IF EXISTS "Users can view their own gallery widgets" ON public.widget_gallery;
DROP POLICY IF EXISTS "Users can manage their own gallery widgets" ON public.widget_gallery;

CREATE POLICY "Users can view their own gallery widgets" ON public.widget_gallery
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own gallery widgets" ON public.widget_gallery
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET AGENTS
DROP POLICY IF EXISTS "Authenticated users can view all agent widgets" ON public.widget_agents;
DROP POLICY IF EXISTS "Users can view their own agent widgets" ON public.widget_agents;
DROP POLICY IF EXISTS "Users can manage their own agent widgets" ON public.widget_agents;

CREATE POLICY "Users can view their own agent widgets" ON public.widget_agents
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own agent widgets" ON public.widget_agents
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET YOUTUBE
DROP POLICY IF EXISTS "Authenticated users can view all youtube widgets" ON public.widget_youtube;
DROP POLICY IF EXISTS "Users can view their own youtube widgets" ON public.widget_youtube;
DROP POLICY IF EXISTS "Users can manage their own youtube widgets" ON public.widget_youtube;

CREATE POLICY "Users can view their own youtube widgets" ON public.widget_youtube
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own youtube widgets" ON public.widget_youtube
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET MAPS
DROP POLICY IF EXISTS "Authenticated users can view all map widgets" ON public.widget_maps;
DROP POLICY IF EXISTS "Users can view their own map widgets" ON public.widget_maps;
DROP POLICY IF EXISTS "Users can manage their own map widgets" ON public.widget_maps;

CREATE POLICY "Users can view their own map widgets" ON public.widget_maps
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own map widgets" ON public.widget_maps
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET SPOTIFY
DROP POLICY IF EXISTS "Authenticated users can view all spotify widgets" ON public.widget_spotify;
DROP POLICY IF EXISTS "Users can view their own spotify widgets" ON public.widget_spotify;
DROP POLICY IF EXISTS "Users can manage their own spotify widgets" ON public.widget_spotify;

CREATE POLICY "Users can view their own spotify widgets" ON public.widget_spotify
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own spotify widgets" ON public.widget_spotify
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET CALENDAR
DROP POLICY IF EXISTS "Authenticated users can view all calendar widgets" ON public.widget_calendar;
DROP POLICY IF EXISTS "Users can view their own calendar widgets" ON public.widget_calendar;
DROP POLICY IF EXISTS "Users can manage their own calendar widgets" ON public.widget_calendar;

CREATE POLICY "Users can view their own calendar widgets" ON public.widget_calendar
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own calendar widgets" ON public.widget_calendar
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET SEPARATOR
DROP POLICY IF EXISTS "Authenticated users can view all separator widgets" ON public.widget_separator;
DROP POLICY IF EXISTS "Users can view their own separator widgets" ON public.widget_separator;
DROP POLICY IF EXISTS "Users can manage their own separator widgets" ON public.widget_separator;

CREATE POLICY "Users can view their own separator widgets" ON public.widget_separator
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own separator widgets" ON public.widget_separator
  FOR ALL USING (auth.uid() = profile_id);

-- WIDGET TITLE
DROP POLICY IF EXISTS "Authenticated users can view all title widgets" ON public.widget_title;
DROP POLICY IF EXISTS "Users can view their own title widgets" ON public.widget_title;
DROP POLICY IF EXISTS "Users can manage their own title widgets" ON public.widget_title;

CREATE POLICY "Users can view their own title widgets" ON public.widget_title
  FOR SELECT USING (
    auth.uid() = profile_id OR
    profile_id IN (SELECT id FROM profiles WHERE is_public = true)
  );

CREATE POLICY "Users can manage their own title widgets" ON public.widget_title
  FOR ALL USING (auth.uid() = profile_id);

-- Commit the changes
COMMIT;