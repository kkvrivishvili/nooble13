// src/features/my-nooble/profile/components/widgets/spotify/spotify-widget.tsx
import { IconBrandSpotify } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { SpotifyWidgetData, WidgetComponentProps } from '@/types/widget';

export function SpotifyWidget({
  widget,
  data,
  is_editing,
  onEdit,
  onDelete,
}: WidgetComponentProps<SpotifyWidgetData>) {
  // Extract Spotify ID from URL
  const getSpotifyId = (url: string) => {
    const match = url.match(/\/([a-zA-Z0-9]+)(\?|$)/);
    return match ? match[1] : null;
  };

  const spotifyId = getSpotifyId(data.spotify_url);

  // Get embed URL based on type
  const getEmbedUrl = () => {
    if (!spotifyId) return null;
    
    switch (data.embed_type) {
      case 'track':
        return `https://open.spotify.com/embed/track/${spotifyId}`;
      case 'playlist':
        return `https://open.spotify.com/embed/playlist/${spotifyId}`;
      case 'album':
        return `https://open.spotify.com/embed/album/${spotifyId}`;
      case 'artist':
        return `https://open.spotify.com/embed/artist/${spotifyId}`;
      default:
        return null;
    }
  };

  const embedUrl = getEmbedUrl();

  return (
    <SortableWidget widget={widget} isDraggingDisabled={is_editing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconBrandSpotify size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">
            {data.embed_type === 'track' && 'Canción de Spotify'}
            {data.embed_type === 'playlist' && 'Playlist de Spotify'}
            {data.embed_type === 'album' && 'Álbum de Spotify'}
            {data.embed_type === 'artist' && 'Artista de Spotify'}
          </h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={is_editing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Spotify embed */}
      {embedUrl ? (
        <div className="p-4 pt-3">
          <iframe
            src={`${embedUrl}?theme=${data.theme === 'light' ? '0' : '1'}`}
            width="100%"
            height={data.height}
            frameBorder="0"
            allowTransparency={true}
            allow="encrypted-media"
            className="rounded-lg"
            title="Spotify Player"
          />
        </div>
      ) : (
        <div className="p-4 pt-3 text-center text-sm text-gray-500 dark:text-gray-400">
          URL de Spotify inválida
        </div>
      )}
    </SortableWidget>
  );
}