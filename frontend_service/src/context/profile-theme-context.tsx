// src/context/profile-theme-context.tsx - Fixed snake_case
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ProfileDesign, ProfileTheme, ProfileLayout, ProfileWallpaper } from '@/types/profile';

interface ProfileThemeContextType {
  theme: ProfileTheme;
  layout: ProfileLayout;
  applyTheme: (design: ProfileDesign) => void;
  resetTheme: () => void;
  isLoading: boolean;
  getCSSVariables: () => Record<string, string>;
}

const defaultTheme: ProfileTheme = {
  primary_color: '#000000',
  background_color: '#ffffff',
  text_color: '#111827',
  button_text_color: '#ffffff',
  border_radius: 'curved',
  button_fill: 'solid',
  button_shadow: 'subtle',
  font_family: 'sans',
};

const defaultLayout: ProfileLayout = {
  social_position: 'top',
  content_width: 'normal',
};

const ProfileThemeContext = createContext<ProfileThemeContextType | null>(null);

interface ProfileThemeProviderProps {
  children: React.ReactNode;
  profileDesign?: ProfileDesign;
}

export function ProfileThemeProvider({ 
  children, 
  profileDesign 
}: ProfileThemeProviderProps) {
  const [theme, setTheme] = useState<ProfileTheme>(() => profileDesign?.theme ?? defaultTheme);
  const [layout, setLayout] = useState<ProfileLayout>(() => profileDesign?.layout ?? defaultLayout);
  const [isLoading] = useState(false);

  // Generate wallpaper CSS
  const generateWallpaperStyles = (wallpaper?: ProfileWallpaper): string => {
    if (!wallpaper) return '';

    switch (wallpaper.type) {
      case 'fill':
        return wallpaper.fill_color || '#ffffff';
      
      case 'gradient': {
        if (!wallpaper.gradient_colors || wallpaper.gradient_colors.length === 0) return '';
        const direction = wallpaper.gradient_direction === 'diagonal' ? 'to bottom right' :
                         wallpaper.gradient_direction === 'up' ? 'to top' :
                         wallpaper.gradient_direction === 'down' ? 'to bottom' :
                         wallpaper.gradient_direction === 'left' ? 'to left' : 'to right';
        return `linear-gradient(${direction}, ${wallpaper.gradient_colors.join(', ')})`;
      }
      
      case 'pattern':
        return generatePatternBackground(wallpaper);
      
      case 'image':
        if (!wallpaper.image_url) return '';
        return `url(${wallpaper.image_url})`;
      
      case 'video':
        // Video backgrounds need to be handled differently with a video element
        return 'transparent';
      
      default:
        return '';
    }
  };

  // Generate pattern backgrounds
  const generatePatternBackground = (wallpaper: ProfileWallpaper): string => {
    const color = wallpaper.pattern_color || '#000000';
    const opacity = wallpaper.pattern_opacity || 0.2;
    
    switch (wallpaper.pattern_type) {
      case 'dots':
        return `radial-gradient(circle, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 1px, transparent 1px)`;
      case 'lines':
        return `repeating-linear-gradient(45deg, transparent, transparent 10px, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 10px, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 11px)`;
      case 'grid':
        return `repeating-linear-gradient(0deg, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 1px, transparent 1px, transparent 20px)`;
      default:
        return '';
    }
  };

  // Generate CSS variables object for scoped application
  const generateCSSVariables = (theme: ProfileTheme): Record<string, string> => {
    const variables: Record<string, string> = {};
    
    // Colors
    variables['--profile-primary-color'] = theme.primary_color;
    variables['--profile-background-color'] = theme.background_color;
    variables['--profile-text-color'] = theme.text_color || '#111827';
    variables['--profile-button-text-color'] = theme.button_text_color || '#ffffff';
    
    // Border radius mapping
    const radiusMap = {
      'sharp': '0.25rem',
      'curved': '0.5rem',
      'round': '9999px'
    };
    variables['--profile-border-radius'] = radiusMap[theme.border_radius || 'curved'];
    
    // Font family
    const fontMap = {
      'sans': 'system-ui, -apple-system, sans-serif',
      'serif': 'Georgia, serif',
      'mono': 'Monaco, monospace'
    };
    variables['--profile-font-family'] = fontMap[theme.font_family || 'sans'];
    
    // Button styles
    variables['--profile-button-fill'] = theme.button_fill || 'solid';
    
    // Button shadow mapping
    const shadowMap = {
      'none': 'none',
      'subtle': '0 2px 4px rgba(0, 0, 0, 0.1)',
      'hard': '4px 4px 0 rgba(0, 0, 0, 0.2)'
    };
    variables['--profile-button-shadow'] = shadowMap[theme.button_shadow || 'subtle'];
    
    // Wallpaper
    if (theme.wallpaper) {
      const wallpaperStyle = generateWallpaperStyles(theme.wallpaper);
      variables['--profile-wallpaper'] = wallpaperStyle;
      
      // Background size for patterns
      if (theme.wallpaper.type === 'pattern') {
        variables['--profile-wallpaper-size'] = '20px 20px';
      } else if (theme.wallpaper.type === 'image') {
        variables['--profile-wallpaper-size'] = theme.wallpaper.image_size || 'cover';
        variables['--profile-wallpaper-position'] = theme.wallpaper.image_position || 'center';
      } else {
        variables['--profile-wallpaper-size'] = 'auto';
        variables['--profile-wallpaper-position'] = 'center';
      }
      
      // Blur effect for image, pattern, and video
      let blurIntensity = '0';
      if (theme.wallpaper.type === 'image' && theme.wallpaper.image_blur) {
        blurIntensity = `${theme.wallpaper.image_blur_intensity || 10}px`;
      } else if (theme.wallpaper.type === 'pattern' && theme.wallpaper.pattern_blur) {
        blurIntensity = `${theme.wallpaper.pattern_blur_intensity || 5}px`;
      } else if (theme.wallpaper.type === 'video' && theme.wallpaper.video_blur) {
        blurIntensity = `${theme.wallpaper.video_blur_intensity || 10}px`;
      }
      variables['--profile-blur-intensity'] = blurIntensity;
    } else {
      variables['--profile-wallpaper'] = theme.background_color;
      variables['--profile-wallpaper-size'] = 'auto';
      variables['--profile-blur-intensity'] = '0';
    }
    
    return variables;
  };

  // Generate layout CSS variables
  const generateLayoutVariables = (layout: ProfileLayout): Record<string, string> => {
    const variables: Record<string, string> = {};
    
    // Content width
    const widthMap = {
      'narrow': '28rem',
      'normal': '36rem',
      'wide': '48rem'
    };
    variables['--profile-content-width'] = widthMap[layout.content_width || 'normal'];
    
    // Always use compact spacing
    variables['--profile-spacing'] = '0.5rem';
    
    return variables;
  };

  // Apply theme when profileDesign changes
  useEffect(() => {
    if (profileDesign) {
      const newTheme = { ...defaultTheme, ...profileDesign.theme };
      const newLayout = { ...defaultLayout, ...profileDesign.layout };
      setTheme(newTheme);
      setLayout(newLayout);
    } else {
      setTheme(defaultTheme);
      setLayout(defaultLayout);
    }
  }, [profileDesign]);

  const applyTheme = (design: ProfileDesign) => {
    const newTheme = { ...defaultTheme, ...design.theme };
    const newLayout = { ...defaultLayout, ...design.layout };
    
    setTheme(newTheme);
    setLayout(newLayout);
  };

  const resetTheme = () => {
    setTheme(defaultTheme);
    setLayout(defaultLayout);
  };

  const value: ProfileThemeContextType = {
    theme,
    layout,
    applyTheme,
    resetTheme,
    isLoading,
    getCSSVariables: () => ({ ...generateCSSVariables(theme), ...generateLayoutVariables(layout) }),
  };

  return (
    <ProfileThemeContext.Provider value={value}>
      {children}
    </ProfileThemeContext.Provider>
  );
}

export function useProfileTheme() {
  const context = useContext(ProfileThemeContext);
  if (!context) {
    throw new Error('useProfileTheme must be used within a ProfileThemeProvider');
  }
  return context;
}