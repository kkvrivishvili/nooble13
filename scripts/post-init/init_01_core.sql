-- Nooble8 Core Schema
-- Version: 5.0 - Snake Case
-- Description: DROPS ALL DATA and recreates from scratch with snake_case convention

-- ============================================
-- DANGER: THIS WILL DELETE ALL DATA
-- ============================================

-- Drop all existing tables and dependencies
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Grant permissions
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core function needed by multiple tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 1: Create profiles table with snake_case
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text DEFAULT '',
  avatar text DEFAULT '',
  social_links jsonb DEFAULT '[]'::jsonb,
  agents jsonb DEFAULT '[]'::jsonb, -- Array of agent UUIDs
  widgets jsonb DEFAULT '[]'::jsonb, -- Ordered array of widgets with minimal info: [{id, type, position, is_active}]
  design jsonb DEFAULT '{
    "theme": {
      "primary_color": "#000000",
      "background_color": "#ffffff",
      "border_radius": "lg",
      "font_family": "sans"
    },
    "layout": {
      "link_style": "card",
      "social_position": "top"
    }
  }'::jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  version integer DEFAULT 1
);

-- Create indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_is_public ON public.profiles(is_public);
CREATE INDEX idx_profiles_widgets ON public.profiles USING gin(widgets);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Step 2: Create enum types
DO $$ BEGIN
    CREATE TYPE widget_type AS ENUM (
        'link', 'agents', 'gallery', 'youtube', 'maps', 
        'spotify', 'calendar', 'separator', 'title'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 3: Update profiles comment
COMMENT ON COLUMN public.profiles.widgets IS 'Ordered array of widgets with minimal info: [{id, type, position, is_active}]';
COMMENT ON COLUMN public.profiles.agents IS 'Array of agent UUIDs owned by this profile';

-- Step 4: Simplified validation functions (non-blocking)
CREATE OR REPLACE FUNCTION validate_widget_structure()
RETURNS TRIGGER AS $$
BEGIN
  -- Simple validation - just ensure widgets is valid JSON array
  IF NEW.widgets IS NOT NULL AND jsonb_typeof(NEW.widgets) != 'array' THEN
    NEW.widgets := '[]'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Simplified agents validation
CREATE OR REPLACE FUNCTION validate_profile_agents()
RETURNS TRIGGER AS $$
BEGIN
  -- Simple validation - just ensure agents is valid JSON array
  IF NEW.agents IS NOT NULL AND jsonb_typeof(NEW.agents) != 'array' THEN
    NEW.agents := '[]'::jsonb;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create non-blocking triggers
CREATE TRIGGER validate_profile_widgets
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION validate_widget_structure();

CREATE TRIGGER validate_profile_agents_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION validate_profile_agents();

-- Step 7: Apply the updated_at trigger for profiles
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Create handle_new_user function
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

-- Step 9: Create trigger for new users
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 10: Grant necessary permissions
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;