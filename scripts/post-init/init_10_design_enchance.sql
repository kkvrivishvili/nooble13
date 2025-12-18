-- Migration: Update design structure V3
-- Removes linkStyle, spacing, and blur as independent wallpaper type

-- First, drop the existing constraint
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS check_wallpaper_type;

-- Update the default design structure for new profiles
ALTER TABLE public.profiles 
ALTER COLUMN design SET DEFAULT '{
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
}'::jsonb;

-- Add new constraint without blur type
ALTER TABLE public.profiles
ADD CONSTRAINT check_wallpaper_type
CHECK (
  design->'theme'->'wallpaper'->>'type' IS NULL OR
  design->'theme'->'wallpaper'->>'type' IN (
    'fill', 'gradient', 'pattern', 'image', 'video'
  )
);

-- Function to migrate existing profiles to new design structure V3
CREATE OR REPLACE FUNCTION migrate_profile_designs_v3()
RETURNS void AS $$
DECLARE
  profile_record RECORD;
  new_wallpaper jsonb;
BEGIN
  FOR profile_record IN 
    SELECT id, design 
    FROM public.profiles 
    WHERE design IS NOT NULL 
    AND (design->>'version' IS NULL OR (design->>'version')::int < 3)
  LOOP
    -- Handle wallpaper migration
    IF profile_record.design->'theme'->'wallpaper' IS NOT NULL THEN
      new_wallpaper := profile_record.design->'theme'->'wallpaper';
      
      -- Convert blur type to fill with blur effect
      IF new_wallpaper->>'type' = 'blur' THEN
        new_wallpaper := jsonb_build_object(
          'type', 'fill',
          'fillColor', COALESCE(new_wallpaper->>'blurColor', '#f3f4f6')
        );
      END IF;
      
      -- Remove hero type if exists
      IF new_wallpaper->>'type' = 'hero' THEN
        new_wallpaper := jsonb_build_object(
          'type', 'fill',
          'fillColor', '#ffffff'
        );
      END IF;
    ELSE
      new_wallpaper := jsonb_build_object(
        'type', 'fill',
        'fillColor', COALESCE(profile_record.design->'theme'->>'backgroundColor', '#ffffff')
      );
    END IF;
    
    UPDATE public.profiles
    SET design = jsonb_build_object(
      'theme', jsonb_build_object(
        'primaryColor', COALESCE(profile_record.design->'theme'->>'primaryColor', '#2563eb'),
        'backgroundColor', COALESCE(profile_record.design->'theme'->>'backgroundColor', '#ffffff'),
        'textColor', COALESCE(profile_record.design->'theme'->>'textColor', '#1e293b'),
        'buttonTextColor', COALESCE(profile_record.design->'theme'->>'buttonTextColor', '#ffffff'),
        'borderRadius', COALESCE(profile_record.design->'theme'->>'borderRadius', 'curved'),
        'buttonFill', COALESCE(profile_record.design->'theme'->>'buttonFill', 'solid'),
        'buttonShadow', COALESCE(profile_record.design->'theme'->>'buttonShadow', 'subtle'),
        'fontFamily', COALESCE(profile_record.design->'theme'->>'fontFamily', 'sans'),
        'wallpaper', new_wallpaper
      ),
      'layout', jsonb_build_object(
        'socialPosition', COALESCE(profile_record.design->'layout'->>'socialPosition', 'top'),
        'contentWidth', COALESCE(profile_record.design->'layout'->>'contentWidth', 'normal')
      ),
      'version', 3
    ),
    updated_at = now()
    WHERE id = profile_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_profile_designs_v3();

-- Update validation function for the new design structure
CREATE OR REPLACE FUNCTION validate_profile_design()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure design has required structure
  IF NEW.design IS NOT NULL THEN
    -- Ensure it has theme object
    IF NEW.design->'theme' IS NULL THEN
      NEW.design = jsonb_set(NEW.design, '{theme}', '{}'::jsonb);
    END IF;
    
    -- Ensure it has layout object
    IF NEW.design->'layout' IS NULL THEN
      NEW.design = jsonb_set(NEW.design, '{layout}', '{}'::jsonb);
    END IF;
    
    -- Set version if not present
    IF NEW.design->>'version' IS NULL THEN
      NEW.design = jsonb_set(NEW.design, '{version}', '3'::jsonb);
    END IF;
    
    -- Remove deprecated fields if present
    IF NEW.design->'layout'->>'linkStyle' IS NOT NULL THEN
      NEW.design = NEW.design #- '{layout,linkStyle}';
    END IF;
    
    IF NEW.design->'layout'->>'spacing' IS NOT NULL THEN
      NEW.design = NEW.design #- '{layout,spacing}';
    END IF;
    
    -- Validate wallpaper structure if present
    IF NEW.design->'theme'->'wallpaper' IS NOT NULL THEN
      DECLARE
        wallpaper_type text;
      BEGIN
        wallpaper_type := NEW.design->'theme'->'wallpaper'->>'type';
        
        -- Ensure wallpaper type is valid (no blur or hero)
        IF wallpaper_type NOT IN ('fill', 'gradient', 'pattern', 'image', 'video') THEN
          RAISE EXCEPTION 'Invalid wallpaper type: %', wallpaper_type;
        END IF;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger for design validation
DROP TRIGGER IF EXISTS validate_profile_design_trigger ON public.profiles;
CREATE TRIGGER validate_profile_design_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION validate_profile_design();

-- Update comment explaining the new design structure
COMMENT ON COLUMN public.profiles.design IS 'Enhanced design configuration V3. Structure: {
  theme: {
    primaryColor: string,
    backgroundColor: string,
    textColor: string,
    buttonTextColor: string,
    borderRadius: "sharp" | "curved" | "round",
    buttonFill: "solid" | "glass" | "outline",
    buttonShadow: "none" | "subtle" | "hard",
    fontFamily: "sans" | "serif" | "mono",
    wallpaper: {
      type: "fill" | "gradient" | "pattern" | "image" | "video",
      // Additional properties based on type
      // Pattern, image, and video types can have blur options
    }
  },
  layout: {
    socialPosition: "top" | "bottom" | "hidden",
    contentWidth: "narrow" | "normal" | "wide"
  },
  version: 3
}';