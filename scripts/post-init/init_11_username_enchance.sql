-- URGENT SQL MIGRATIONS - Execute in order
-- File: scripts/post-init/urgent_username_migration.sql

-- ============================================
-- PART 1: Update handle_new_user function
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  desired_username text;
  final_username text;
  username_counter integer := 0;
  max_attempts integer := 100;
BEGIN
  -- Extract username from metadata, fallback to email-based or generated username
  desired_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1), -- Use email prefix
    'user_' || substring(NEW.id::text, 1, 8) -- Fallback to user_id
  );
  
  -- Clean the username: lowercase, remove invalid characters
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
  
  -- Check for username conflicts and resolve them
  WHILE username_counter < max_attempts LOOP
    -- Check if username exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
      EXIT; -- Username is available
    END IF;
    
    -- Generate alternative username
    username_counter := username_counter + 1;
    final_username := desired_username || '_' || username_counter;
    
    -- Ensure the new username doesn't exceed length limit
    IF length(final_username) > 30 THEN
      final_username := substring(desired_username, 1, 25) || '_' || username_counter;
    END IF;
  END LOOP;
  
  -- If we couldn't find an available username after max attempts, use UUID
  IF username_counter >= max_attempts THEN
    final_username := 'user_' || substring(NEW.id::text, 1, 8);
  END IF;
  
  -- Insert the new profile with proper error handling
  INSERT INTO public.profiles (
    id, 
    username, 
    display_name, 
    description, 
    avatar, 
    social_links, 
    agents, 
    widgets,
    design
  ) VALUES (
    NEW.id,
    final_username,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'username',
      final_username
    ),
    'Bienvenido a mi Nooble',
    COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{
      "theme": {
        "primaryColor": "#2563eb",
        "backgroundColor": "#ffffff",
        "textColor": "#1e293b",
        "buttonTextColor": "#ffffff",
        "borderRadius": "curved",
        "buttonFill": "solid",
        "buttonShadow": "subtle",
        "fontFamily": "sans",
        "wallpaper": {
          "type": "fill",
          "fillColor": "#f8fafc"
        }
      },
      "layout": {
        "socialPosition": "top",
        "contentWidth": "normal"
      },
      "version": 3
    }'::jsonb
  );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Handle rare case of concurrent username conflicts
    -- Generate a truly unique username using the user ID and timestamp
    final_username := 'user_' || substring(NEW.id::text, 1, 8) || '_' || extract(epoch from now())::text;
    
    -- Ensure it's not too long
    IF length(final_username) > 30 THEN
      final_username := 'u_' || substring(NEW.id::text, 1, 12);
    END IF;
    
    INSERT INTO public.profiles (
      id, 
      username, 
      display_name, 
      description, 
      avatar, 
      social_links, 
      agents, 
      widgets,
      design
    ) VALUES (
      NEW.id,
      final_username,
      COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'username',
        final_username
      ),
      'Bienvenido a mi Nooble',
      COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '{
        "theme": {
          "primaryColor": "#2563eb",
          "backgroundColor": "#ffffff",
          "textColor": "#1e293b",
          "buttonTextColor": "#ffffff",
          "borderRadius": "curved",
          "buttonFill": "solid",
          "buttonShadow": "subtle",
          "fontFamily": "sans",
          "wallpaper": {
            "type": "fill",
            "fillColor": "#f8fafc"
          }
        },
        "layout": {
          "socialPosition": "top",
          "contentWidth": "normal"
        },
        "version": 3
      }'::jsonb
    );
    
    RETURN NEW;
  WHEN others THEN
    -- Log the error and still return NEW to not block user creation
    RAISE NOTICE 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- PART 2: Create username availability function
-- ============================================

CREATE OR REPLACE FUNCTION public.check_username_availability(desired_username text)
RETURNS boolean AS $$
BEGIN
  -- Clean and validate the username
  desired_username := lower(trim(desired_username));
  
  -- Basic validation
  IF length(desired_username) < 3 OR 
     length(desired_username) > 30 OR 
     NOT (desired_username ~ '^[a-z0-9_-]+$') THEN
    RETURN false;
  END IF;
  
  -- Check if username is available
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE username = desired_username
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- PART 3: Recreate trigger and grant permissions
-- ============================================

-- Recreate the trigger to use the updated function
DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_username_availability TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_availability TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO service_role;

-- ============================================
-- PART 4: Fix existing profiles without proper usernames
-- ============================================

-- Update existing profiles that might have invalid usernames
DO $$
DECLARE
  profile_record RECORD;
  new_username text;
  counter integer := 0;
BEGIN
  FOR profile_record IN 
    SELECT id, username 
    FROM public.profiles 
    WHERE 
      username IS NULL OR 
      username = '' OR 
      length(username) < 3 OR
      username ~ '[^a-z0-9_-]' OR
      username != lower(username)
  LOOP
    -- Generate a new username
    new_username := 'user_' || substring(profile_record.id::text, 1, 8);
    counter := 0;
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = new_username) LOOP
      counter := counter + 1;
      new_username := 'user_' || substring(profile_record.id::text, 1, 6) || '_' || counter;
    END LOOP;
    
    -- Update the profile
    UPDATE public.profiles 
    SET username = new_username,
        updated_at = now()
    WHERE id = profile_record.id;
    
    RAISE NOTICE 'Updated username for profile % from % to %', 
      profile_record.id, profile_record.username, new_username;
  END LOOP;
END $$;

-- ============================================
-- PART 5: Verify and optimize indexes
-- ============================================

-- Ensure we have proper indexes for username operations
DROP INDEX IF EXISTS idx_profiles_username;
CREATE UNIQUE INDEX idx_profiles_username ON public.profiles(username);

-- Add index for username lookups (case-insensitive)
DROP INDEX IF EXISTS idx_profiles_username_lower;
CREATE INDEX idx_profiles_username_lower ON public.profiles(lower(username));

-- ============================================
-- PART 6: Add constraints for data integrity
-- ============================================

-- Add constraint to ensure username format
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS check_username_format;

ALTER TABLE public.profiles 
ADD CONSTRAINT check_username_format 
CHECK (
  username IS NOT NULL AND
  length(username) >= 3 AND 
  length(username) <= 30 AND
  username ~ '^[a-z0-9_-]+$'
);

-- Add constraint to ensure display_name is not empty
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS check_display_name_not_empty;

ALTER TABLE public.profiles 
ADD CONSTRAINT check_display_name_not_empty 
CHECK (display_name IS NOT NULL AND length(trim(display_name)) > 0);

-- ============================================
-- PART 7: Update RLS policies if needed
-- ============================================

-- Ensure public profiles can be accessed by username
DROP POLICY IF EXISTS "Public profiles viewable by username" ON public.profiles;
CREATE POLICY "Public profiles viewable by username" ON public.profiles
  FOR SELECT 
  USING (is_public = true);

-- Ensure users can check username availability
DROP POLICY IF EXISTS "Anyone can check username availability" ON public.profiles;
CREATE POLICY "Anyone can check username availability" ON public.profiles
  FOR SELECT 
  USING (true);

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these after migration to verify everything is working:

-- 1. Check all profiles have valid usernames
SELECT 
  COUNT(*) as total_profiles,
  COUNT(CASE WHEN username ~ '^[a-z0-9_-]+$' AND length(username) BETWEEN 3 AND 30 THEN 1 END) as valid_usernames,
  COUNT(CASE WHEN username IS NULL OR username = '' THEN 1 END) as null_usernames
FROM public.profiles;

-- 2. Check for duplicate usernames
SELECT username, COUNT(*) 
FROM public.profiles 
GROUP BY username 
HAVING COUNT(*) > 1;

-- 3. Test username availability function
SELECT 
  public.check_username_availability('testuser123') as available_test,
  public.check_username_availability('invalid-user!') as invalid_format_test;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Username migration completed successfully!';
  RAISE NOTICE '📊 Run the verification queries above to confirm everything is working.';
END $$;