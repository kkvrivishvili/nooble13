// src/features/public-profile/widgets/public-maps-widget.tsx - Refactored with BaseWidget utilities
import { IconMapPin, IconExternalLink } from '@tabler/icons-react';
import { PublicWidgetProps } from './types';
import BaseWidget from './BaseWidget';
import { getBorderRadius, getShadowStyle, getFontFamily } from '@/features/public-profile/utils/theme-styles';

interface PublicMapsWidgetProps extends PublicWidgetProps {
  data: {
    address: string;
    latitude?: number;
    longitude?: number;
    zoomLevel: number;
    mapStyle: string;
  };
}

export function PublicMapsWidget({ data, theme, className }: PublicMapsWidgetProps) {
  // Generate Google Maps URL for click
  const getMapsUrl = () => {
    if (data.latitude && data.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`;
  };

  const handleMapClick = () => {
    window.open(getMapsUrl(), '_blank', 'noopener,noreferrer');
  };

  // Generate static map image URL (using a placeholder since Google Static Maps requires API key)
  const getStaticMapUrl = () => {
    // In production, you'd use Google Static Maps API with your API key
    return `https://via.placeholder.com/600x300/e5e7eb/6b7280?text=${encodeURIComponent('📍 ' + data.address.substring(0, 30))}`;
  };

  const containerStyles = {
    borderRadius: theme ? getBorderRadius(theme) : '1rem',
    overflow: 'hidden',
    boxShadow: theme ? getShadowStyle(theme) : 'none',
  };

  const buttonStyles = {
    backgroundColor: theme?.button_fill === 'glass' 
      ? 'rgba(255, 255, 255, 0.1)'
      : theme?.button_fill === 'outline'
      ? 'transparent'
      : `${theme?.primary_color || '#3b82f6'}20`,
    color: theme?.primary_color || '#3b82f6',
    border: theme?.button_fill === 'outline' 
      ? `1px solid ${theme?.primary_color || '#3b82f6'}`
      : `1px solid ${theme?.primary_color || '#3b82f6'}`,
    borderRadius: theme ? getBorderRadius(theme) : '9999px',
    backdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    WebkitBackdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    fontFamily: theme ? getFontFamily(theme.font_family) : 'sans-serif',
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {/* Static map image */}
        <div 
          className="relative aspect-[2/1] cursor-pointer group"
          onClick={handleMapClick}
          style={containerStyles}
        >
          <img
            src={getStaticMapUrl()}
            alt={`Mapa de ${data.address}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          
          {/* Overlay with map pin */}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center">
            <div 
              className="p-3 rounded-full shadow-lg group-hover:scale-110 transition-transform"
              style={{
                backgroundColor: theme?.button_fill === 'glass'
                  ? 'rgba(255, 255, 255, 0.9)'
                  : 'white',
                backdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
                WebkitBackdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
              }}
            >
              <IconMapPin size={24} style={{ color: theme?.primary_color || '#ef4444' }} />
            </div>
          </div>
          
          {/* External link indicator */}
          <div className="absolute top-3 right-3">
            <div 
              className="p-2 rounded-full"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <IconExternalLink size={16} className="text-white" />
            </div>
          </div>
        </div>
        
        {/* Address and call-to-action */}
        <div className="text-center space-y-2">
          <BaseWidget.Text
            theme={theme}
            variant="primary"
            className="font-medium flex items-center justify-center gap-1"
          >
            <IconMapPin size={16} />
            {data.address}
          </BaseWidget.Text>
          <button
            onClick={handleMapClick}
            className="inline-flex items-center gap-2 px-4 py-2 transition-all hover:scale-105 active:scale-95"
            style={buttonStyles}
            onMouseEnter={(e) => {
              if (theme?.button_fill === 'outline') {
                e.currentTarget.style.backgroundColor = theme?.primary_color || '#3b82f6';
                e.currentTarget.style.color = theme?.button_text_color || '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (theme?.button_fill === 'outline') {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = theme?.primary_color || '#3b82f6';
              }
            }}
          >
            <IconExternalLink size={16} />
            <span className="font-medium text-sm">Ver en Google Maps</span>
          </button>
        </div>
      </div>
    </div>
  );
}