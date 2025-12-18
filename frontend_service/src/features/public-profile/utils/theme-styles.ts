// src/features/public-profile/utils/theme-styles.ts - Fixed snake_case
import { ProfileTheme } from '@/types/profile';

export const getBorderRadius = (theme: ProfileTheme) => {
  const radiusMap = {
    'sharp': '0.25rem',
    'curved': '0.75rem',
    'round': '9999px'
  };
  return radiusMap[theme.border_radius || 'curved'];
};

export const getShadowStyle = (theme: ProfileTheme) => {
  if (theme.button_shadow === 'none') return 'none';
  if (theme.button_shadow === 'hard') return '4px 4px 0 rgba(0,0,0,0.2)';
  return '0 2px 4px rgba(0,0,0,0.1)';
};

export const getGlassEffect = () => ({
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
});

export const getButtonStyles = (theme: ProfileTheme, variant?: 'primary' | 'secondary') => {
  const baseStyles = {
    borderRadius: getBorderRadius(theme),
    transition: 'all 0.2s ease',
    fontFamily: theme.font_family === 'serif' ? 'serif' :
                theme.font_family === 'mono' ? 'monospace' : 'sans-serif',
    boxShadow: getShadowStyle(theme),
  };

  if (theme.button_fill === 'glass') {
    return {
      ...baseStyles,
      ...getGlassEffect(),
      color: theme.primary_color,
    };
  } else if (theme.button_fill === 'outline') {
    return {
      ...baseStyles,
      backgroundColor: 'transparent',
      border: `1px solid ${theme.primary_color}`,
      color: theme.primary_color,
    };
  } else {
    // Solid fill
    return {
      ...baseStyles,
      backgroundColor: variant === 'secondary' 
        ? `${theme.primary_color}20` 
        : theme.primary_color,
      color: variant === 'secondary' 
        ? theme.primary_color 
        : theme.button_text_color || '#ffffff',
      border: 'none',
    };
  }
};

export const getButtonHoverStyles = (theme: ProfileTheme) => {
  if (theme.button_fill === 'outline') {
    return {
      backgroundColor: theme.primary_color,
      color: theme.button_text_color || '#ffffff',
    };
  } else if (theme.button_fill === 'glass') {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    };
  } else {
    return {
      transform: 'translateY(-2px)',
      boxShadow: theme.button_shadow === 'hard' 
        ? '6px 6px 0 rgba(0,0,0,0.2)' 
        : '0 4px 8px rgba(0,0,0,0.15)',
    };
  }
};

export const getContentWidth = (width?: 'narrow' | 'normal' | 'wide') => {
  const widthMap = {
    'narrow': 'max-w-md',
    'normal': 'max-w-xl',
    'wide': 'max-w-3xl'
  };
  return widthMap[width || 'normal'];
};

export const getSpacing = (spacing?: 'compact' | 'normal' | 'relaxed') => {
  const spacingMap = {
    'compact': '0.5rem',
    'normal': '1rem',
    'relaxed': '1.5rem'
  };
  return spacingMap[spacing || 'normal'];
};

export const getFontFamily = (font?: 'sans' | 'serif' | 'mono') => {
  const fontMap = {
    'sans': 'system-ui, -apple-system, sans-serif',
    'serif': 'Georgia, serif',
    'mono': 'Monaco, monospace'
  };
  return fontMap[font || 'sans'];
};

export const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    '0, 0, 0';
};