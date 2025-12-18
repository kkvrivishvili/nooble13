// src/features/my-nooble/profile/components/widgets/spotify/spotify-editor.tsx
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { IconBrandSpotify, IconAlertCircle } from '@tabler/icons-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { WidgetEditor } from '../common/widget-editor';
import { SpotifyWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateSpotifyData } from './spotify-config';

export function SpotifyEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<SpotifyWidgetData>) {
  const [formData, setFormData] = useState<SpotifyWidgetData>({
    spotify_url: initialData?.spotify_url || '',
    embed_type: initialData?.embed_type || 'playlist',
    height: initialData?.height || 380,
    theme: initialData?.theme || 'dark',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  // Auto-detect embed type from URL
  useEffect(() => {
    if (formData.spotify_url) {
      const url = formData.spotify_url;
      if (url.includes('/track/')) {
        setFormData(prev => ({ ...prev, embed_type: 'track' }));
      } else if (url.includes('/playlist/')) {
        setFormData(prev => ({ ...prev, embed_type: 'playlist' }));
      } else if (url.includes('/album/')) {
        setFormData(prev => ({ ...prev, embed_type: 'album' }));
      } else if (url.includes('/artist/')) {
        setFormData(prev => ({ ...prev, embed_type: 'artist' }));
      }
    }
  }, [formData.spotify_url]);

  const handleSave = async () => {
    const validation = validateSpotifyData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el widget' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Get recommended heights based on embed type
  const getRecommendedHeight = () => {
    switch (formData.embed_type) {
      case 'track':
        return { min: 80, recommended: 152, max: 200 };
      case 'playlist':
      case 'album':
        return { min: 300, recommended: 380, max: 600 };
      case 'artist':
        return { min: 200, recommended: 350, max: 500 };
      default:
        return { min: 80, recommended: 380, max: 600 };
    }
  };

  const heights = getRecommendedHeight();

  return (
    <WidgetEditor
      title={initialData ? 'Editar widget de Spotify' : 'Nuevo widget de Spotify'}
      icon={IconBrandSpotify}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Spotify URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL de Spotify *
        </label>
        <Input
          type="url"
          placeholder="https://open.spotify.com/playlist/..."
          value={formData.spotify_url}
          onChange={(e) => {
            setFormData({ ...formData, spotify_url: e.target.value });
            if (errors.spotify_url) {
              const newErrors = { ...errors };
              delete newErrors.spotify_url;
              setErrors(newErrors);
            }
          }}
          className={errors.spotify_url ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
        />
        {errors.spotify_url && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.spotify_url}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Pega el enlace de una canción, playlist, álbum o artista
        </p>
      </div>

      {/* Embed type (auto-detected) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Tipo de contenido
        </label>
        <Select
          value={formData.embed_type}
          onValueChange={(value: 'track' | 'playlist' | 'album' | 'artist') => 
            setFormData({ ...formData, embed_type: value })
          }
          disabled={is_saving || is_loading}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="track">Canción</SelectItem>
            <SelectItem value="playlist">Playlist</SelectItem>
            <SelectItem value="album">Álbum</SelectItem>
            <SelectItem value="artist">Artista</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          Se detecta automáticamente desde la URL
        </p>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Tema</Label>
        <RadioGroup
          value={formData.theme}
          onValueChange={(value: 'dark' | 'light') => 
            setFormData({ ...formData, theme: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" id="dark" />
            <Label htmlFor="dark" className="font-normal cursor-pointer">
              Oscuro - Fondo negro con texto blanco
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="light" />
            <Label htmlFor="light" className="font-normal cursor-pointer">
              Claro - Fondo blanco con texto negro
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Height */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Altura: {formData.height}px
        </Label>
        <Slider
          value={[formData.height]}
          onValueChange={([value]) => setFormData({ ...formData, height: value })}
          min={heights.min}
          max={heights.max}
          step={10}
          className="w-full"
          disabled={is_saving || is_loading}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>Compacto ({heights.min}px)</span>
          <span className="text-primary">Recomendado ({heights.recommended}px)</span>
          <span>Expandido ({heights.max}px)</span>
        </div>
      </div>

      {/* Help text */}
      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-700 dark:text-green-300">
          <strong>Tip:</strong> Para obtener el enlace, abre Spotify, busca el contenido, 
          haz clic en los tres puntos (...) y selecciona "Compartir" → "Copiar enlace".
        </p>
      </div>
    </WidgetEditor>
  );
}