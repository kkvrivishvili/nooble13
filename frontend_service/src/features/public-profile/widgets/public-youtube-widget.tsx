// src/features/public-profile/widgets/public-youtube-widget.tsx - Refactored with BaseWidget utilities
import { useState } from 'react';
import { IconBrandYoutube, IconPlayerPlay } from '@tabler/icons-react';
import { PublicWidgetProps } from './types';
import BaseWidget from './BaseWidget';
import { getBorderRadius, getShadowStyle } from '@/features/public-profile/utils/theme-styles';

interface PublicYouTubeWidgetProps extends PublicWidgetProps {
  data: {
    video_url: string;
    title?: string;
    autoplay: boolean;
    show_controls: boolean;
  };
}

export function PublicYouTubeWidget({ data, theme, className }: PublicYouTubeWidgetProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Extract video ID from URL
  const getVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?]*)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const videoId = getVideoId(data.video_url);
  
  if (!videoId) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <p style={{ color: theme?.text_color || theme?.primary_color }}>Video no válido</p>
      </div>
    );
  }

  const handlePlay = () => {
    setIsPlaying(true);
  };

  // Para YouTube widget, si el borde es 'round', usar 'curved' en su lugar
  const containerStyles = {
    borderRadius: theme ? 
      theme.border_radius === 'round' ? '0.5rem' : getBorderRadius(theme) 
      : '0.5rem',
    overflow: 'hidden',
    boxShadow: theme ? getShadowStyle(theme) : 'none',
  };

  return (
    <div className={className}>
      {data.title && (
        <BaseWidget.Text
          theme={theme}
          variant="primary"
          className="font-medium mb-3 text-lg"
          as="h3"
        >
          {data.title}
        </BaseWidget.Text>
      )}
      
      <div 
        className="relative w-full" 
        style={{ ...containerStyles, paddingBottom: '56.25%' }}
      >
        {/* Thumbnail with play button overlay */}
        {!isPlaying ? (
          <div className="absolute inset-0 cursor-pointer group" onClick={handlePlay}>
            {/* Fondo negro para evitar parpadeos mientras carga la imagen */}
            <div className="absolute inset-0 bg-black"></div>
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt={data.title || 'Video thumbnail'}
              className="absolute inset-0 w-full h-full object-cover z-10"
              loading="lazy"
              onError={(e) => {
                // Cascada de fallbacks para encontrar la mejor miniatura disponible
                const fallbacks = [
                  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                  `https://img.youtube.com/vi/${videoId}/0.jpg`
                ];
                
                const currentSrc = e.currentTarget.src;
                const currentIndex = fallbacks.findIndex(src => 
                  currentSrc.includes(src.split('/').pop() || '')
                );
                
                // Si estamos en maxresdefault, intentamos el primer fallback
                if (currentIndex === -1) {
                  e.currentTarget.src = fallbacks[0];
                } 
                // De lo contrario, intentamos el siguiente fallback si existe
                else if (currentIndex < fallbacks.length - 1) {
                  e.currentTarget.src = fallbacks[currentIndex + 1];
                }
              }}
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all">
              {/* Center play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="rounded-full p-4 group-hover:scale-110 transition-transform shadow-lg"
                  style={{
                    backgroundColor: theme?.button_fill === 'glass' 
                      ? 'rgba(255, 255, 255, 0.9)' 
                      : theme?.primary_color || '#ff0000',
                    boxShadow: theme ? getShadowStyle(theme) : 'none',
                  }}
                >
                  <IconPlayerPlay 
                    size={32} 
                    className="ml-1" 
                    style={{ 
                      color: theme?.button_fill === 'glass' 
                        ? (theme?.primary_color || '#ff0000')
                        : (theme?.button_text_color || '#ffffff'),
                      fill: theme?.button_fill === 'glass' 
                        ? (theme?.primary_color || '#ff0000')
                        : (theme?.button_text_color || '#ffffff')
                    }}
                  />
                </div>
              </div>
            </div>
            {/* YouTube logo */}
            <div className="absolute top-3 right-3">
              <IconBrandYoutube 
                size={24} 
                className="drop-shadow-lg transition-colors" 
                style={{
                  color: theme?.text_color || theme?.primary_color || '#ffffff',
                  filter: `drop-shadow(0px 1px 1px rgba(0,0,0,0.5))`,
                }}
              />
            </div>
            {/* Title overlay if exists */}
            {data.title && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                <p 
                  className="font-medium" 
                  style={{
                    color: theme?.text_color || theme?.primary_color || '#ffffff',
                    fontFamily: theme?.font_family === 'serif' ? 'serif' :
                               theme?.font_family === 'mono' ? 'monospace' : 'sans-serif'
                  }}
                >
                  {data.title}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* YouTube embed when playing */
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=${data.show_controls ? '1' : '0'}`}
            title={data.title || 'YouTube video'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}