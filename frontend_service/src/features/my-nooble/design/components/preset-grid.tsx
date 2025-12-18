import { designPresets } from '@/api/design-api';
import { ProfileDesign } from '@/types/profile';
import { cn } from '@/lib/utils';

interface PresetGridProps {
  currentDesign: ProfileDesign;
  onSelectPreset: (presetName: keyof typeof designPresets) => void;
}

export function PresetGrid({ currentDesign, onSelectPreset }: PresetGridProps) {
  const isPresetActive = (preset: ProfileDesign) => {
    return JSON.stringify(currentDesign) === JSON.stringify(preset);
  };

  const getWallpaperStyle = (theme: ProfileDesign['theme']) => {
    const backgroundColor = theme.background_color;
    if (!theme.wallpaper) return { backgroundColor };
    
    switch (theme.wallpaper.type) {
      case 'gradient': {
        const gradientColors = theme.wallpaper.gradient_colors;
        if (gradientColors && Array.isArray(gradientColors) && gradientColors.length > 0) {
          const gradientDirection = theme.wallpaper.gradient_direction;
          const direction = gradientDirection === 'diagonal' ? '135deg' :
                          gradientDirection === 'up' ? '0deg' :
                          gradientDirection === 'down' ? '180deg' :
                          gradientDirection === 'left' ? '270deg' : '90deg';
          return {
            background: `linear-gradient(${direction}, ${gradientColors.join(', ')})`,
          };
        }
        // Fallback si no hay gradient_colors válidos
        return { backgroundColor };
      }
      case 'pattern': {
        const opacity = theme.wallpaper.pattern_opacity || 0.3;
        const hexOpacity = Math.round(opacity * 255).toString(16).padStart(2, '0');
        
        const patternType = theme.wallpaper.pattern_type;
        const patternColor = theme.wallpaper.pattern_color;
        
        if (patternType === 'dots') {
          return {
            backgroundColor,
            backgroundImage: `radial-gradient(circle, ${patternColor}${hexOpacity} 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          };
        } else if (patternType === 'grid') {
          return {
            backgroundColor,
            backgroundImage: `
              repeating-linear-gradient(0deg, ${patternColor}${hexOpacity}, ${patternColor}${hexOpacity} 1px, transparent 1px, transparent 20px),
              repeating-linear-gradient(90deg, ${patternColor}${hexOpacity}, ${patternColor}${hexOpacity} 1px, transparent 1px, transparent 20px)
            `,
          };
        } else if (patternType === 'lines') {
          return {
            backgroundColor,
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              ${patternColor}${hexOpacity} 10px,
              ${patternColor}${hexOpacity} 11px
            )`,
          };
        } else if (patternType === 'waves') {
          return {
            backgroundColor,
            backgroundImage: `repeating-radial-gradient(
              circle at 0 0,
              transparent 0,
              ${patternColor}${hexOpacity} 10px,
              transparent 10px,
              transparent 20px,
              ${patternColor}${hexOpacity} 20px,
              ${patternColor}${hexOpacity} 30px,
              transparent 30px,
              transparent 40px
            )`,
          };
        }
        break;
      }
      case 'fill':
        return {
          backgroundColor: theme.wallpaper.fill_color || backgroundColor,
        };
    }
    
    return { backgroundColor };
  };

  const getBorderRadius = (borderRadius?: string) => {
    switch (borderRadius) {
      case 'sharp': return '0.25rem';
      case 'round': return '9999px';
      case 'curved': 
      default: return '0.75rem';
    }
  };

  const getFontFamily = (font?: string) => {
    switch (font) {
      case 'serif': return 'Georgia, serif';
      case 'mono': return 'Monaco, monospace';
      case 'sans':
      default: return 'system-ui, -apple-system, sans-serif';
    }
  };

  const renderButtonShape = (theme: ProfileDesign['theme']) => {
    const borderRadiusValue = theme.border_radius;
    const borderRadius = getBorderRadius(borderRadiusValue);
    const isRound = borderRadiusValue === 'round';
    
    // Posición y tamaño dinámicos basados en el estilo
    const shapeStyles = {
      width: isRound ? '25%' : '30%',
      height: isRound ? '50%' : '55%',
      borderRadius: borderRadius,
      position: 'absolute' as const,
      bottom: '20%',
      right: '15%',
    };

    // Estilos según el tipo de relleno
    const buttonFill = theme.button_fill;
    const buttonShadow = theme.button_shadow;
    const primaryColor = theme.primary_color;
    
    if (buttonFill === 'glass') {
      return (
        <div
          style={{
            ...shapeStyles,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: buttonShadow === 'subtle' ? '0 2px 8px rgba(0,0,0,0.1)' : 
                      buttonShadow === 'hard' ? '4px 4px 0 rgba(0,0,0,0.2)' : 'none',
          }}
        />
      );
    } else if (buttonFill === 'outline') {
      return (
        <div
          style={{
            ...shapeStyles,
            backgroundColor: 'transparent',
            border: `1px solid ${primaryColor}`,
            boxShadow: buttonShadow === 'subtle' ? '0 2px 8px rgba(0,0,0,0.1)' : 
                      buttonShadow === 'hard' ? '4px 4px 0 rgba(0,0,0,0.2)' : 'none',
          }}
        />
      );
    } else {
      // Solid fill
      return (
        <div
          style={{
            ...shapeStyles,
            backgroundColor: primaryColor,
            boxShadow: buttonShadow === 'subtle' ? '0 2px 8px rgba(0,0,0,0.1)' : 
                      buttonShadow === 'hard' ? '4px 4px 0 rgba(0,0,0,0.2)' : 'none',
          }}
        />
      );
    }
  };

  const renderPresetPreview = (preset: ProfileDesign, name: string) => {
    const { theme } = preset;
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    
    return (
      <div className="relative w-full h-full">
        {/* Background con wallpaper */}
        <div 
          className="absolute inset-0 rounded-xl overflow-hidden"
          style={getWallpaperStyle(theme)}
        />
        
        {/* Texto "Aa" */}
        <div className="absolute top-1/2 left-1/3 transform -translate-x-1/2 -translate-y-1/2">
          <span 
            style={{
              fontFamily: getFontFamily(theme.font_family),
              fontSize: '2.5rem',
              fontWeight: '500',
              color: theme.text_color || '#000000',
              letterSpacing: '-0.02em',
            }}
          >
            Aa
          </span>
        </div>
        
        {/* Forma del botón */}
        {renderButtonShape(theme)}
        
        {/* Nombre del preset */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-3 py-2 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900">{displayName}</p>
        </div>
      </div>
    );
  };

  // Orden de los presets para mejor organización visual
  const presetOrder = [
    'minimal', 'classic', 'modern', 
    'aurora', 'nature', 'pastel',
    'neon', 'luxury', 'industrial'
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Diseños predefinidos</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {presetOrder.map((key) => {
          const preset = designPresets[key as keyof typeof designPresets];
          if (!preset) return null;
          
          return (
            <button
              key={key}
              onClick={() => onSelectPreset(key as keyof typeof designPresets)}
              className={cn(
                "relative aspect-[16/9] rounded-xl overflow-hidden transition-all",
                isPresetActive(preset) 
                  ? "ring-2 ring-blue-500 shadow-lg scale-[0.98]" 
                  : "ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-md"
              )}
            >
              {renderPresetPreview(preset, key)}
              
              {/* Indicador activo */}
              {isPresetActive(preset) && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}