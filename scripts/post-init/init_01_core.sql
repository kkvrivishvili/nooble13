-- ============================================
-- Nooble8 Database Schema
-- File: init_01_core.sql
-- Description: Core setup - Extensions, base functions, profiles
-- Version: 6.0
-- ============================================

-- ============================================
-- SCHEMA SETUP
-- ============================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Grant permissions on schema
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

-- Widget types enum
CREATE TYPE widget_type AS ENUM (
    'link', 'agents', 'gallery', 'youtube', 'maps', 
    'spotify', 'calendar', 'separator', 'title'
);

-- Subscription status enum
CREATE TYPE subscription_status AS ENUM (
    'active', 'canceled', 'past_due', 'trialing', 'paused'
);

-- Conversation status enum
CREATE TYPE conversation_status AS ENUM (
    'active', 'closed', 'archived'
);

-- Message role enum
CREATE TYPE message_role AS ENUM (
    'user', 'assistant', 'system'
);

-- Document processing status enum
CREATE TYPE document_status AS ENUM (
    'pending', 'processing', 'completed', 'failed'
);

-- ============================================
-- BASE FUNCTIONS
-- ============================================

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate username format
CREATE OR REPLACE FUNCTION validate_username(username text)
RETURNS boolean AS $$
BEGIN
    RETURN username IS NOT NULL 
        AND length(username) >= 3 
        AND length(username) <= 30 
        AND username ~ '^[a-z0-9_-]+$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text NOT NULL,
    display_name text NOT NULL,
    description text DEFAULT '',
    avatar text DEFAULT '',
    social_links jsonb DEFAULT '[]'::jsonb,
    design jsonb DEFAULT '{
        "theme": {
            "primary_color": "#2563eb",
            "background_color": "#ffffff",
            "text_color": "#1e293b",
            "button_text_color": "#ffffff",
            "border_radius": "curved",
            "button_fill": "solid",
            "button_shadow": "subtle",
            "font_family": "sans",
            "wallpaper": {
                "type": "fill",
                "fill_color": "#f8fafc"
            }
        },
        "layout": {
            "social_position": "top",
            "content_width": "normal"
        },
        "version": 3
    }'::jsonb,
    is_public boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT profiles_username_unique UNIQUE (username),
    CONSTRAINT profiles_username_format CHECK (validate_username(username)),
    CONSTRAINT profiles_display_name_not_empty CHECK (length(trim(display_name)) > 0)
);

-- Indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_username_lower ON public.profiles(lower(username));
CREATE INDEX idx_profiles_is_public ON public.profiles(is_public) WHERE is_public = true;

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view public profiles
CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles
    FOR SELECT 
    USING (is_public = true);

-- Users can view their own profile (even if private)
CREATE POLICY "Users can view their own profile" 
    ON public.profiles
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" 
    ON public.profiles
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service role has full access
CREATE POLICY "Service role has full access to profiles"
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- HANDLE NEW USER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    desired_username text;
    final_username text;
    username_counter integer := 0;
    max_attempts integer := 100;
BEGIN
    -- Extract username from metadata, fallback to email prefix or generated
    desired_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1),
        'user_' || substring(NEW.id::text, 1, 8)
    );
    
    -- Clean username: lowercase, remove invalid characters
    desired_username := lower(regexp_replace(desired_username, '[^a-z0-9_-]', '', 'g'));
    
    -- Ensure minimum length
    IF length(desired_username) < 3 THEN
        desired_username := 'user_' || substring(NEW.id::text, 1, 8);
    END IF;
    
    -- Ensure maximum length
    IF length(desired_username) > 30 THEN
        desired_username := substring(desired_username, 1, 30);
    END IF;
    
    final_username := desired_username;
    
    -- Check for username conflicts and resolve
    WHILE username_counter < max_attempts LOOP
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
            EXIT;
        END IF;
        
        username_counter := username_counter + 1;
        final_username := desired_username || '_' || username_counter;
        
        IF length(final_username) > 30 THEN
            final_username := substring(desired_username, 1, 25) || '_' || username_counter;
        END IF;
    END LOOP;
    
    -- Fallback if max attempts reached
    IF username_counter >= max_attempts THEN
        final_username := 'user_' || substring(NEW.id::text, 1, 8);
    END IF;
    
    -- Insert profile
    INSERT INTO public.profiles (
        id, 
        username, 
        display_name, 
        description, 
        avatar, 
        social_links
    ) VALUES (
        NEW.id,
        final_username,
        COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'username',
            final_username
        ),
        'Welcome to my Nooble',
        COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
        '[]'::jsonb
    );
    
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle rare concurrent conflict
        final_username := 'user_' || substring(NEW.id::text, 1, 8) || '_' || extract(epoch from now())::integer;
        
        IF length(final_username) > 30 THEN
            final_username := 'u_' || substring(NEW.id::text, 1, 12);
        END IF;
        
        INSERT INTO public.profiles (
            id, username, display_name, description, avatar, social_links
        ) VALUES (
            NEW.id, final_username, final_username, 'Welcome to my Nooble', '', '[]'::jsonb
        );
        
        RETURN NEW;
    WHEN others THEN
        RAISE NOTICE 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: Create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Function: Check username availability
CREATE OR REPLACE FUNCTION public.check_username_availability(desired_username text)
RETURNS boolean AS $$
BEGIN
    desired_username := lower(trim(desired_username));
    
    IF NOT validate_username(desired_username) THEN
        RETURN false;
    END IF;
    
    RETURN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE username = desired_username
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- GRANTS
-- ============================================

GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

GRANT EXECUTE ON FUNCTION public.check_username_availability TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_availability TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO service_role;
GRANT EXECUTE ON FUNCTION validate_username TO anon;
GRANT EXECUTE ON FUNCTION validate_username TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users. Contains display info and design settings.';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users(id) - this is the user_id used throughout the system';
COMMENT ON COLUMN public.profiles.social_links IS 'Array of social links: [{platform, url, icon}]';
COMMENT ON COLUMN public.profiles.design IS 'Profile design configuration V3 with snake_case fields';
