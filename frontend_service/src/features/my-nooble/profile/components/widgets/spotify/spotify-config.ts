// src/features/my-nooble/profile/components/widgets/spotify/spotify-config.ts
import { IconBrandSpotify } from '@tabler/icons-react';
import { SpotifyWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateSpotifyData(data: SpotifyWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate Spotify URL
  if (!data.spotify_url?.trim()) {
    errors.spotify_url = 'La URL de Spotify es requerida';
  } else {
    // Basic Spotify URL validation
    const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/(track|playlist|album|artist|show|episode)\/[a-zA-Z0-9]+/;
    if (!spotifyRegex.test(data.spotify_url)) {
      errors.spotify_url = 'URL de Spotify inválida';
    }
  }
  
  // Validate height
  if (data.height < 80 || data.height > 600) {
    errors.height = 'La altura debe estar entre 80 y 600 píxeles';
  }
  
  // Validate embed type
  if (!['track', 'playlist', 'album', 'artist'].includes(data.embed_type)) {
    errors.embed_type = 'Tipo de contenido inválido';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const spotifyWidgetConfig: WidgetConfig<SpotifyWidgetData> = {
  type: WidgetType.Spotify,
  label: 'Spotify',
  description: 'Comparte tu música favorita de Spotify',
  icon: IconBrandSpotify,
  defaultData: {
    spotify_url: '',
    embed_type: 'playlist',
    height: 380,
    theme: 'dark'
  },
  validator: validateSpotifyData
};