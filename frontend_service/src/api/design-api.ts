// src/api/design-api.ts - FIXED SNAKE_CASE VERSION
import { supabase } from '@/lib/supabase';
import { ProfileDesign } from '@/types/profile';
import { PostgrestError, AuthError } from '@supabase/supabase-js';

// Helper Functions
const handleApiError = (error: PostgrestError | AuthError | null, context: string) => {
  if (error) {
    // Avoid console noise in production; surface via thrown error
    throw new Error(`A problem occurred in ${context}: ${error.message}`);
  }
};

const getUserId = async (): Promise<string> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  handleApiError(error, 'session check');
  if (!session?.user?.id) throw new Error('User not authenticated.');
  return session.user.id;
};

export const designPresets = {
  minimal: {
    theme: {
      primary_color: '#18181b',
      background_color: '#ffffff',
      text_color: '#18181b',
      button_text_color: '#ffffff',
      font_family: 'sans' as const,
      border_radius: 'sharp' as const,
      button_fill: 'solid' as const,
      button_shadow: 'none' as const,
      wallpaper: {
        type: 'fill' as const,
        fill_color: '#fafafa'
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'narrow' as const,
    }
  },
  
  classic: {
    theme: {
      primary_color: '#2563eb',
      background_color: '#ffffff',
      text_color: '#1e293b',
      button_text_color: '#ffffff',
      font_family: 'serif' as const,
      border_radius: 'curved' as const,
      button_fill: 'solid' as const,
      button_shadow: 'subtle' as const,
      wallpaper: {
        type: 'fill' as const,
        fill_color: '#f8fafc'
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  },
  
  aurora: {
    theme: {
      primary_color: '#6366f1',
      background_color: '#faf5ff',
      text_color: '#4c1d95',
      button_text_color: '#ffffff',
      font_family: 'sans' as const,
      border_radius: 'curved' as const,
      button_fill: 'solid' as const,
      button_shadow: 'hard' as const,
      wallpaper: {
        type: 'gradient' as const,
        gradient_colors: ['#ddd6fe', '#c7d2fe', '#a5b4fc', '#818cf8'],
        gradient_direction: 'diagonal' as const,
        gradient_type: 'linear' as const
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  },
  
  neon: {
    theme: {
      primary_color: '#f97316',
      background_color: '#18181b',
      text_color: '#fafafa',
      button_text_color: '#18181b',
      font_family: 'sans' as const,
      border_radius: 'sharp' as const,
      button_fill: 'solid' as const,
      button_shadow: 'hard' as const,
      wallpaper: {
        type: 'gradient' as const,
        gradient_colors: ['#1e1b4b', '#312e81', '#4c1d95', '#6d28d9', '#7c3aed'],
        gradient_direction: 'up' as const,
        gradient_type: 'linear' as const
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  },
  
  nature: {
    theme: {
      primary_color: '#059669',
      background_color: '#ecfdf5',
      text_color: '#064e3b',
      button_text_color: '#ffffff',
      font_family: 'sans' as const,
      border_radius: 'curved' as const,
      button_fill: 'glass' as const,
      button_shadow: 'hard' as const,
      wallpaper: {
        type: 'gradient' as const,
        gradient_colors: ['#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399'],
        gradient_direction: 'diagonal' as const,
        gradient_type: 'linear' as const
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'narrow' as const,
    }
  },
  
  modern: {
    theme: {
      primary_color: '#000000',
      background_color: '#ffffff',
      text_color: '#000000',
      button_text_color: '#ffffff',
      font_family: 'sans' as const,
      border_radius: 'sharp' as const,
      button_fill: 'solid' as const,
      button_shadow: 'hard' as const,
      wallpaper: {
        type: 'pattern' as const,
        pattern_type: 'grid' as const,
        pattern_color: '#e5e7eb',
        pattern_opacity: 0.5
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  },
  
  industrial: {
    theme: {
      primary_color: '#475569',
      background_color: '#f1f5f9',
      text_color: '#0f172a',
      button_text_color: '#f8fafc',
      font_family: 'mono' as const,
      border_radius: 'sharp' as const,
      button_fill: 'solid' as const,
      button_shadow: 'none' as const,
      wallpaper: {
        type: 'pattern' as const,
        pattern_type: 'dots' as const,
        pattern_color: '#94a3b8',
        pattern_opacity: 0.3
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'wide' as const,
    }
  },
  
  luxury: {
    theme: {
      primary_color: '#d97706',
      background_color: '#1f2937',
      text_color: '#f9fafb',
      button_text_color: '#111827',
      font_family: 'serif' as const,
      border_radius: 'curved' as const,
      button_fill: 'solid' as const,
      button_shadow: 'subtle' as const,
      wallpaper: {
        type: 'gradient' as const,
        gradient_colors: ['#1f2937', '#374151', '#4b5563', '#374151', '#1f2937'],
        gradient_direction: 'diagonal' as const,
        gradient_type: 'linear' as const
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  },
  
  pastel: {
    theme: {
      primary_color: '#ec4899',
      background_color: '#fef3c7',
      text_color: '#831843',
      button_text_color: '#ffffff',
      font_family: 'sans' as const,
      border_radius: 'round' as const,
      button_fill: 'glass' as const,
      button_shadow: 'hard' as const,
      wallpaper: {
        type: 'gradient' as const,
        gradient_colors: ['#fef3c7', '#fde68a', '#fbbf24', '#f59e0b'],
        gradient_direction: 'down' as const,
        gradient_type: 'linear' as const
      }
    },
    layout: {
      social_position: 'top' as const,
      content_width: 'normal' as const,
    }
  }
};

export type DesignPresetName = keyof typeof designPresets;
export type DesignUpdate = {
  theme?: Partial<ProfileDesign['theme']>;
  layout?: Partial<ProfileDesign['layout']>;
};

// Enhanced gradient presets with more sophisticated designs
export const gradientPresets = [
  { 
    name: 'sunset', 
    colors: ['#fde047', '#fb923c', '#f87171', '#c084fc', '#818cf8'],
    direction: 'diagonal' as const
  },
  { 
    name: 'ocean', 
    colors: ['#0891b2', '#0e7490', '#155e75', '#164e63', '#134e4a'],
    direction: 'down' as const
  },
  { 
    name: 'aurora', 
    colors: ['#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#34d399'],
    direction: 'diagonal' as const
  },
  { 
    name: 'forest', 
    colors: ['#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d'],
    direction: 'up' as const
  },
  { 
    name: 'lavender', 
    colors: ['#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7'],
    direction: 'down' as const
  },
  { 
    name: 'fire', 
    colors: ['#fef3c7', '#fde047', '#facc15', '#f59e0b', '#dc2626'],
    direction: 'diagonal' as const
  },
  { 
    name: 'midnight', 
    colors: ['#1e293b', '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6'],
    direction: 'up' as const
  },
  { 
    name: 'cotton candy', 
    colors: ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899'],
    direction: 'right' as const
  },
  { 
    name: 'vintage', 
    colors: ['#fef3c7', '#fed7aa', '#fdba74', '#fb923c', '#f97316'],
    direction: 'diagonal' as const
  },
  { 
    name: 'mystic', 
    colors: ['#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa'],
    direction: 'left' as const
  },
  { 
    name: 'rose gold', 
    colors: ['#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c'],
    direction: 'diagonal' as const
  },
  { 
    name: 'northern lights', 
    colors: ['#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7'],
    direction: 'right' as const
  }
];

// API Implementation
export const designApi = {
  /**
   * Get current design settings from profile.design
   */
  async getDesign(): Promise<ProfileDesign> {
    const userId = await getUserId();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('design')
      .eq('id', userId)
      .single();

    handleApiError(error, 'getDesign');
    
    // If no design exists, return default preset
    if (!data?.design) {
      return designPresets.classic;
    }
    
    // Ensure the design has all required fields with defaults
    const design = data.design as ProfileDesign;
    return {
      theme: {
        ...designPresets.classic.theme,
        ...design.theme
      },
      layout: {
        ...designPresets.classic.layout,
        ...design.layout
      },
      version: design.version || 3 // Updated version
    };
  },

  /**
   * Update design settings in profile.design
   */
  async updateDesign(design: DesignUpdate): Promise<ProfileDesign> {
    const userId = await getUserId();
    const currentDesign = await this.getDesign();
    
    // Merge with current design, ensuring all required fields
    const newDesign: ProfileDesign = {
      theme: {
        ...currentDesign.theme,
        ...(design.theme || {})
      },
      layout: {
        ...currentDesign.layout,
        ...(design.layout || {})
      },
      version: 3 // Mark as new version
    };
    
    // Update the profile with new design and updated_at timestamp
    const { error } = await supabase
      .from('profiles')
      .update({
        design: newDesign,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    handleApiError(error, 'updateDesign');
    
    return newDesign;
  },

  /**
   * Apply a preset design
   */
  async applyPreset(presetName: keyof typeof designPresets): Promise<ProfileDesign> {
    // Use exported type for stability
    const _name: DesignPresetName = presetName as DesignPresetName;
    const preset = designPresets[_name];
    if (!preset) {
      throw new Error(`Preset "${presetName}" not found`);
    }
    
    return this.updateDesign(preset);
  },

  /**
   * Reset design to default preset
   */
  async resetToDefault(): Promise<ProfileDesign> {
    return this.applyPreset('classic');
  },

  /**
   * Update theme only
   */
  async updateTheme(theme: Partial<ProfileDesign['theme']>): Promise<ProfileDesign> {
    return this.updateDesign({ theme });
  },

  /**
   * Update layout only
   */
  async updateLayout(layout: Partial<ProfileDesign['layout']>): Promise<ProfileDesign> {
    return this.updateDesign({ layout });
  },

  /**
   * Update wallpaper settings
   */
  async updateWallpaper(wallpaper: ProfileDesign['theme']['wallpaper']): Promise<ProfileDesign> {
    const currentDesign = await this.getDesign();
    return this.updateDesign({
      theme: {
        ...currentDesign.theme,
        wallpaper
      }
    });
  },

  /**
   * Get available presets with preview info
   */
  getPresets() {
    return Object.keys(designPresets).map(key => ({
      name: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      design: designPresets[key as keyof typeof designPresets],
      preview: {
        primary_color: designPresets[key as keyof typeof designPresets].theme.primary_color,
        background_color: designPresets[key as keyof typeof designPresets].theme.background_color,
        wallpaper: designPresets[key as keyof typeof designPresets].theme.wallpaper,
      }
    }));
  },

  /**
   * Validate design structure
   */
  validateDesign(design: unknown): design is ProfileDesign {
    if (!design || typeof design !== 'object') return false;
    const d = design as { theme?: Record<string, unknown>; layout?: Record<string, unknown> };
    // Check theme
    if (!d.theme || typeof d.theme !== 'object') return false;
    if (typeof d.theme.primary_color !== 'string') return false;
    if (typeof d.theme.background_color !== 'string') return false;
    // Check layout (optional)
    if (d.layout && typeof d.layout !== 'object') return false;
    return true;
  }
};