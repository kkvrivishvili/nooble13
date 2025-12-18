import { useState, useEffect } from 'react';
import { ProfileWallpaper } from '@/types/profile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { gradientPresets } from '@/api/design-api';
import { ColorPicker } from './color-picker';
import { cn } from '@/lib/utils';
import {
  IconSquare,
  IconColorSwatch,
  IconGridDots,
  IconPhoto,
  IconMovie,
  IconPlus,
  IconTrash,
  IconCheck,
} from '@tabler/icons-react';

interface WallpaperConfigProps {
  wallpaper?: ProfileWallpaper;
  onChange: (wallpaper: ProfileWallpaper) => void;
  theme: any;
}

export function WallpaperConfig({ wallpaper, onChange, theme }: WallpaperConfigProps) {
  const [customGradientColors, setCustomGradientColors] = useState<string[]>(
    wallpaper?.gradient_colors || ['#fbbf24', '#f97316', '#dc2626']
  );

  // Sync customGradientColors with wallpaper prop changes
  useEffect(() => {
    if (wallpaper?.gradient_colors) {
      setCustomGradientColors(wallpaper.gradient_colors);
    }
  }, [wallpaper?.gradient_colors]);

  const wallpaperTypes = [
    { 
      value: 'fill', 
      label: 'Sólido', 
      icon: IconSquare,
      preview: (color: string) => (
        <div className="w-full h-full rounded-md" style={{ backgroundColor: color }} />
      )
    },
    { 
      value: 'gradient', 
      label: 'Degradado', 
      icon: IconColorSwatch,
      preview: () => (
        <div className="w-full h-full rounded-md bg-gradient-to-br from-purple-400 to-pink-400" />
      )
    },
    { 
      value: 'pattern', 
      label: 'Patrón', 
      icon: IconGridDots,
      preview: () => (
        <div className="w-full h-full rounded-md bg-base-200 relative overflow-hidden">
          <div className="absolute inset-0 opacity-40" 
            style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '8px 8px',
              color: 'var(--color-base-content)'
            }}
          />
        </div>
      )
    },
    { 
      value: 'image', 
      label: 'Imagen', 
      icon: IconPhoto,
      preview: () => (
        <div className="w-full h-full rounded-md bg-base-200 flex items-center justify-center">
          <IconPhoto size={20} className="text-base-content/40" />
        </div>
      )
    },
    { 
      value: 'video', 
      label: 'Video', 
      icon: IconMovie,
      preview: () => (
        <div className="w-full h-full rounded-md bg-base-300 flex items-center justify-center">
          <IconMovie size={20} className="text-base-content/40" />
        </div>
      )
    },
  ];

  const handleTypeChange = (type: string) => {
    const newWallpaper: ProfileWallpaper = { type: type as any };
    
    switch (type) {
      case 'fill':
        newWallpaper.fill_color = theme?.background_color || '#f3f4f6';
        break;
      case 'gradient':
        newWallpaper.gradient_colors = customGradientColors;
        newWallpaper.gradient_direction = 'diagonal';
        break;
      case 'pattern':
        newWallpaper.pattern_type = 'dots';
        newWallpaper.pattern_color = '#6b7280';
        newWallpaper.pattern_opacity = 0.2;
        newWallpaper.pattern_blur = false;
        newWallpaper.pattern_blur_intensity = 5;
        break;
      case 'image':
        newWallpaper.image_url = '';
        newWallpaper.image_position = 'center';
        newWallpaper.image_size = 'cover';
        newWallpaper.image_blur = false;
        newWallpaper.image_blur_intensity = 10;
        break;
      case 'video':
        newWallpaper.video_url = '';
        newWallpaper.video_muted = true;
        newWallpaper.video_loop = true;
        newWallpaper.video_blur = false;
        newWallpaper.video_blur_intensity = 10;
        break;
    }
    
    onChange(newWallpaper);
  };

  const addGradientColor = () => {
    // Inteligentemente elige un color basado en los existentes
    const lastColor = customGradientColors[customGradientColors.length - 1];
    const newColor = lastColor ? adjustColor(lastColor) : '#3b82f6';
    
    const newColors = [...customGradientColors, newColor];
    setCustomGradientColors(newColors);
    if (wallpaper?.type === 'gradient') {
      onChange({ ...wallpaper, gradient_colors: newColors });
    }
  };

  // Helper para generar un color relacionado
  const adjustColor = (color: string) => {
    // Convierte hex a HSL y ajusta el hue
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    // Ajusta el hue en 60 grados
    h = (h + 0.167) % 1;
    
    // Convierte de vuelta a hex
    const hslToRgb = (h: number, s: number, l: number) => {
      let r, g, b;
      
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      
      const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };
    
    return hslToRgb(h, s, l);
  };

  const removeGradientColor = (index: number) => {
    if (customGradientColors.length <= 2) return;
    const newColors = customGradientColors.filter((_, i) => i !== index);
    setCustomGradientColors(newColors);
    if (wallpaper?.type === 'gradient') {
      onChange({ ...wallpaper, gradient_colors: newColors });
    }
  };

  const updateGradientColor = (index: number, color: string) => {
    const newColors = [...customGradientColors];
    newColors[index] = color;
    setCustomGradientColors(newColors);
    if (wallpaper?.type === 'gradient') {
      onChange({ ...wallpaper, gradient_colors: newColors });
    }
  };

  const QuickToggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
        checked 
          ? "bg-primary text-primary-content" 
          : "bg-base-200 text-base-content hover:bg-base-300"
      )}
    >
      {checked && <IconCheck size={14} className="inline mr-1" />}
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Fondo</h3>
      
      {/* Type selector - Visual tabs */}
      <div className="grid grid-cols-5 gap-3">
        {wallpaperTypes.map((type) => {
          const Icon = type.icon;
          const isActive = wallpaper?.type === type.value;
          const currentColor = wallpaper?.fill_color || theme?.background_color || '#f3f4f6';
          
          return (
            <button
              key={type.value}
              onClick={() => handleTypeChange(type.value)}
              className={cn(
                "relative rounded-xl p-1 transition-all group",
                isActive 
                  ? "ring-2 ring-primary shadow-md" 
                  : "ring-1 ring-base-300 hover:ring-base-400 hover:shadow-sm"
              )}
            >
              <div className="aspect-[4/3] rounded-lg overflow-hidden mb-2">
                {type.value === 'fill' ? type.preview(currentColor) : type.preview()}
              </div>
              
              <div className="px-2 pb-1">
                <div className="flex items-center justify-center gap-1">
                  <Icon size={14} className={cn(
                    "transition-colors",
                    isActive ? "text-primary" : "text-base-content/60"
                  )} />
                  <span className={cn(
                    "text-xs font-medium",
                    isActive ? "text-primary" : "text-base-content"
                  )}>
                    {type.label}
                  </span>
                </div>
              </div>

              {isActive && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm">
                  <IconCheck size={12} className="text-primary-content" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Dynamic content with fade transitions */}
      <div className="min-h-[200px]">
        {wallpaper?.type === 'fill' && (
          <div className="animate-in fade-in duration-200">
            <div className="flex items-center gap-4 p-4 bg-base-200 rounded-xl">
              <div className="flex-1">
                <Label className="text-sm font-medium mb-1">Color de fondo</Label>
                <p className="text-xs text-base-content/60">Elige un color sólido para tu fondo</p>
              </div>
              <ColorPicker
                value={wallpaper.fill_color || '#f3f4f6'}
                onChange={(color) => onChange({ ...wallpaper, fill_color: color })}
              />
            </div>
          </div>
        )}

        {wallpaper?.type === 'gradient' && (
          <div className="animate-in fade-in duration-200 space-y-4">
            {/* Preset gradients */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Presets populares</Label>
              <div className="grid grid-cols-4 gap-2">
                {gradientPresets.slice(0, 8).map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setCustomGradientColors(preset.colors);
                      onChange({
                        ...wallpaper,
                        gradient_colors: preset.colors,
                        gradient_direction: preset.direction
                      });
                    }}
                    className="relative group"
                  >
                    <div
                      className={cn(
                        "h-12 rounded-lg transition-all",
                        JSON.stringify(wallpaper.gradient_colors) === JSON.stringify(preset.colors)
                          ? "ring-2 ring-primary"
                          : "hover:ring-2 hover:ring-base-300"
                      )}
                      style={{
                        background: `linear-gradient(135deg, ${preset.colors.join(', ')})`
                      }}
                    />
                    <span className="sr-only">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Color editor */}
            <div className="p-4 bg-base-200 rounded-xl space-y-3">
              <Label className="text-sm font-medium">Colores del degradado</Label>
              <div className="flex gap-2 items-center flex-wrap">
                {customGradientColors.map((color, index) => (
                  <div key={index} className="relative group">
                    <button
                      className="w-12 h-12 rounded-lg border-2 border-base-100 shadow-sm transition-transform hover:shadow-md"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        // Podría abrir un color picker modal aquí
                      }}
                    />
                    {customGradientColors.length > 2 && (
                      <button
                        onClick={() => removeGradientColor(index)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <IconTrash size={12} className="text-error-content" />
                      </button>
                    )}
                  </div>
                ))}
                {customGradientColors.length < 5 && (
                  <button
                    onClick={addGradientColor}
                    className="w-12 h-12 rounded-lg border-2 border-dashed border-base-300 hover:border-base-400 flex items-center justify-center transition-colors"
                  >
                    <IconPlus size={16} className="text-base-content/40" />
                  </button>
                )}
              </div>
              
              {/* Color inputs */}
              <div className="space-y-2 pt-2 border-t border-base-300">
                {customGradientColors.map((color, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-base-content/60 w-16">Color {index + 1}</span>
                    <Input
                      value={color}
                      onChange={(e) => updateGradientColor(index, e.target.value)}
                      className="flex-1 h-8 text-xs font-mono bg-base-100"
                      placeholder="#000000"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div className="p-4 bg-base-200 rounded-xl">
              <Label className="text-sm font-medium mb-2 block">Dirección</Label>
              <div className="flex gap-2">
                {[
                  { value: 'up', label: '↑' },
                  { value: 'diagonal', label: '↗' },
                  { value: 'right', label: '→' },
                  { value: 'down', label: '↓' },
                  { value: 'left', label: '←' },
                ].map((dir) => (
                  <button
                    key={dir.value}
                    onClick={() => onChange({
                      ...wallpaper,
                      gradient_direction: dir.value as any
                    })}
                    className={cn(
                      "flex-1 h-10 rounded-lg font-bold text-lg transition-all",
                      wallpaper.gradient_direction === dir.value
                        ? "bg-primary text-primary-content shadow-sm"
                        : "bg-base-100 text-base-content hover:bg-base-300"
                    )}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {wallpaper?.type === 'pattern' && (
          <div className="animate-in fade-in duration-200 space-y-4">
            {/* Pattern selector */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'dots', label: 'Puntos', className: 'bg-dots' },
                { value: 'lines', label: 'Líneas', className: 'bg-lines' },
                { value: 'grid', label: 'Cuadrícula', className: 'bg-grid' },
                { value: 'waves', label: 'Ondas', className: 'bg-waves' },
              ].map((pattern) => (
                <button
                  key={pattern.value}
                  onClick={() => onChange({
                    ...wallpaper,
                    pattern_type: pattern.value as any
                  })}
                  className={cn(
                    "relative h-20 rounded-xl overflow-hidden transition-all group",
                    wallpaper.pattern_type === pattern.value
                      ? "ring-2 ring-primary shadow-md"
                      : "ring-1 ring-base-300 hover:ring-base-400"
                  )}
                >
                  <div className="absolute inset-0 bg-base-200" />
                  <div 
                    className={cn(
                      "absolute inset-0 opacity-30",
                      pattern.className
                    )}
                    style={{
                      backgroundColor: wallpaper.pattern_color || '#6b7280',
                      backgroundImage: 
                        pattern.value === 'dots' ? 'radial-gradient(circle, currentColor 1px, transparent 1px)' :
                        pattern.value === 'lines' ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 11px)' :
                        pattern.value === 'grid' ? 'repeating-linear-gradient(0deg, currentColor, currentColor 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, currentColor, currentColor 1px, transparent 1px, transparent 20px)' :
                        'repeating-radial-gradient(circle at 0 0, transparent 0, currentColor 10px, transparent 10px, transparent 20px)',
                      backgroundSize: 
                        pattern.value === 'dots' ? '20px 20px' :
                        pattern.value === 'waves' ? '40px 40px' :
                        'auto'
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn(
                      "text-sm font-medium px-3 py-1 rounded-full",
                      wallpaper.pattern_type === pattern.value
                        ? "bg-primary text-primary-content"
                        : "bg-base-100/80 text-base-content"
                    )}>
                      {pattern.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Pattern controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-base-200 rounded-xl">
                <Label className="text-sm font-medium mb-2">Color</Label>
                <ColorPicker
                  value={wallpaper.pattern_color || '#6b7280'}
                  onChange={(color) => onChange({ ...wallpaper, pattern_color: color })}
                  className="w-full"
                />
              </div>

              <div className="p-4 bg-base-200 rounded-xl">
                <Label className="text-sm font-medium mb-2">Opacidad</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[(wallpaper.pattern_opacity || 0.2) * 100]}
                    onValueChange={([value]) => onChange({
                      ...wallpaper,
                      pattern_opacity: value / 100
                    })}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono text-base-content/60 w-10">
                    {Math.round((wallpaper.pattern_opacity || 0.2) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Effects */}
            <div className="flex items-center gap-2">
              <QuickToggle
                label="Desenfocar"
                checked={wallpaper.pattern_blur ?? false}
                onChange={(checked: boolean) => onChange({
                  ...wallpaper,
                  pattern_blur: checked
                })}
              />
              {wallpaper.pattern_blur && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-base-200 rounded-full">
                  <span className="text-xs text-base-content/60">Intensidad:</span>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={wallpaper.pattern_blur_intensity || 5}
                    onChange={(e) => onChange({
                      ...wallpaper,
                      pattern_blur_intensity: parseInt(e.target.value)
                    })}
                    className="w-20 h-1"
                  />
                  <span className="text-xs font-mono text-base-content/70">
                    {wallpaper.pattern_blur_intensity || 5}px
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {wallpaper?.type === 'image' && (
          <div className="animate-in fade-in duration-200 space-y-4">
            <div className="p-4 bg-base-200 rounded-xl">
              <Label className="text-sm font-medium mb-2">URL de la imagen</Label>
              <Input
                value={wallpaper.image_url || ''}
                onChange={(e) => onChange({
                  ...wallpaper,
                  image_url: e.target.value
                })}
                placeholder="https://ejemplo.com/imagen.jpg"
                className="font-mono text-sm bg-base-100"
              />
            </div>

            {/* Image options as visual chips */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-base-content/60 mb-2 block">POSICIÓN</Label>
                <div className="flex gap-2">
                  {['center', 'top', 'bottom', 'left', 'right'].map((pos) => (
                    <QuickToggle
                      key={pos}
                      label={pos === 'center' ? 'Centro' : 
                             pos === 'top' ? 'Arriba' : 
                             pos === 'bottom' ? 'Abajo' :
                             pos === 'left' ? 'Izquierda' : 'Derecha'}
                      checked={wallpaper.image_position === pos}
                      onChange={() => onChange({
                        ...wallpaper,
                        image_position: pos as any
                      })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-base-content/60 mb-2 block">TAMAÑO</Label>
                <div className="flex gap-2">
                  {['cover', 'contain', 'auto'].map((size) => (
                    <QuickToggle
                      key={size}
                      label={size === 'cover' ? 'Cubrir' : 
                             size === 'contain' ? 'Contener' : 'Auto'}
                      checked={wallpaper.image_size === size}
                      onChange={() => onChange({
                        ...wallpaper,
                        image_size: size as any
                      })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-base-content/60 mb-2 block">EFECTOS</Label>
                <div className="flex items-center gap-2">
                  <QuickToggle
                    label="Desenfocar"
                    checked={wallpaper.image_blur ?? false}
                    onChange={(checked: boolean) => onChange({
                      ...wallpaper,
                      image_blur: checked
                    })}
                  />
                  {wallpaper.image_blur && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-base-200 rounded-full">
                      <span className="text-xs text-base-content/60">Intensidad:</span>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        value={wallpaper.image_blur_intensity || 10}
                        onChange={(e) => onChange({
                          ...wallpaper,
                          image_blur_intensity: parseInt(e.target.value)
                        })}
                        className="w-20 h-1"
                      />
                      <span className="text-xs font-mono text-base-content/70">
                        {wallpaper.image_blur_intensity || 10}px
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {wallpaper?.type === 'video' && (
          <div className="animate-in fade-in duration-200 space-y-4">
            <div className="p-4 bg-base-200 rounded-xl">
              <Label className="text-sm font-medium mb-2">URL del video</Label>
              <Input
                value={wallpaper.video_url || ''}
                onChange={(e) => onChange({
                  ...wallpaper,
                  video_url: e.target.value
                })}
                placeholder="https://ejemplo.com/video.mp4"
                className="font-mono text-sm bg-base-100"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-base-content/60 mb-2 block">OPCIONES DE REPRODUCCIÓN</Label>
              <div className="flex flex-wrap gap-2">
                <QuickToggle
                  label="Silenciado"
                  checked={wallpaper.video_muted ?? true}
                  onChange={(checked: boolean) => onChange({
                    ...wallpaper,
                    video_muted: checked
                  })}
                />
                <QuickToggle
                  label="En bucle"
                  checked={wallpaper.video_loop ?? true}
                  onChange={(checked: boolean) => onChange({
                    ...wallpaper,
                    video_loop: checked
                  })}
                />
                <QuickToggle
                  label="Desenfocar"
                  checked={wallpaper.video_blur ?? false}
                  onChange={(checked: boolean) => onChange({
                    ...wallpaper,
                    video_blur: checked
                  })}
                />
              </div>
              
              {wallpaper.video_blur && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-base-200 rounded-full w-fit">
                  <span className="text-xs text-base-content/60">Desenfoque:</span>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={wallpaper.video_blur_intensity || 10}
                    onChange={(e) => onChange({
                      ...wallpaper,
                      video_blur_intensity: parseInt(e.target.value)
                    })}
                    className="w-20 h-1"
                  />
                  <span className="text-xs font-mono text-base-content/70">
                    {wallpaper.video_blur_intensity || 10}px
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}