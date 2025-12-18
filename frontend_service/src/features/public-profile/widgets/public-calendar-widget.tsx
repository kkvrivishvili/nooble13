// src/features/public-profile/widgets/public-calendar-widget.tsx - Refactored with BaseWidget utilities
import { IconCalendar, IconClock, IconExternalLink } from '@tabler/icons-react';
import { PublicWidgetProps } from './types';
import BaseWidget from './BaseWidget';
import { getBorderRadius, getShadowStyle, getFontFamily } from '@/features/public-profile/utils/theme-styles';

interface PublicCalendarWidgetProps extends PublicWidgetProps {
  data: {
    calendly_url: string;
    title: string;
    hide_event_details: boolean;
    hide_cookie_banner: boolean;
  };
}

export function PublicCalendarWidget({ data, theme, className }: PublicCalendarWidgetProps) {
  const handleCalendlyClick = () => {
    window.open(data.calendly_url, '_blank', 'noopener,noreferrer');
  };

  // Extract username from Calendly URL for display
  const getCalendlyUsername = () => {
    const match = data.calendly_url.match(/calendly\.com\/([^/?]+)/);
    return match ? match[1] : 'usuario';
  };

  const containerStyles = {
    borderRadius: theme ? getBorderRadius(theme) : '1rem',
    borderColor: theme?.primary_color || '#e5e7eb',
    backgroundColor: theme?.button_fill === 'glass'
      ? 'rgba(255, 255, 255, 0.05)'
      : `${theme?.primary_color || '#f3f4f6'}05`,
    backdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    WebkitBackdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    fontFamily: theme ? getFontFamily(theme.font_family) : 'sans-serif',
  };

  const buttonStyles = {
    backgroundColor: theme?.button_fill === 'glass'
      ? 'rgba(255, 255, 255, 0.1)'
      : theme?.button_fill === 'outline'
      ? 'transparent'
      : theme?.primary_color || '#3b82f6',
    color: theme?.button_fill === 'outline'
      ? theme?.primary_color || '#3b82f6'
      : theme?.button_text_color || '#ffffff',
    border: theme?.button_fill === 'outline'
      ? `1px solid ${theme?.primary_color || '#3b82f6'}`
      : 'none',
    borderRadius: theme ? getBorderRadius(theme) : '9999px',
    boxShadow: theme ? getShadowStyle(theme) : 'none',
    backdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    WebkitBackdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
  };

  return (
    <div className={className}>
      <div 
        className="p-6 border border-dashed transition-all hover:border-solid hover:shadow-md"
        style={containerStyles}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div 
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
            style={{ 
              backgroundColor: `${theme?.primary_color || '#3b82f6'}20`,
              borderRadius: theme?.border_radius === 'sharp' ? '0.5rem' :
                           theme?.border_radius === 'round' ? '9999px' : '1rem',
            }}
          >
            <IconCalendar size={32} style={{ color: theme?.primary_color || '#3b82f6' }} />
          </div>
          
          <BaseWidget.Text
            theme={theme}
            variant="primary"
            className="text-xl font-semibold mb-2"
            as="h3"
          >
            {data.title}
          </BaseWidget.Text>
          
          <BaseWidget.Text
            theme={theme}
            variant="primary"
            className="text-sm flex items-center justify-center gap-1"
            style={{ opacity: 0.7 }}
          >
            <IconClock size={14} />
            Calendario de {getCalendlyUsername()}
          </BaseWidget.Text>
        </div>

        {/* Features list */}
        <div className="space-y-2 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: theme?.primary_color }}
            ></div>
            <BaseWidget.Text theme={theme} variant="primary" style={{ opacity: 0.8 }}>
              Selecciona fecha y hora disponible
            </BaseWidget.Text>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: theme?.primary_color }}
            ></div>
            <BaseWidget.Text theme={theme} variant="primary" style={{ opacity: 0.8 }}>
              Confirmación automática por email
            </BaseWidget.Text>
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: theme?.primary_color }}
            ></div>
            <BaseWidget.Text theme={theme} variant="primary" style={{ opacity: 0.8 }}>
              Enlace de videollamada incluido
            </BaseWidget.Text>
          </div>
        </div>

        {/* Call to action button */}
        <button
          onClick={handleCalendlyClick}
          className="w-full py-4 px-6 font-semibold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
          style={buttonStyles}
          onMouseEnter={(e) => {
            if (theme?.button_fill === 'outline') {
              e.currentTarget.style.backgroundColor = theme?.primary_color || '#3b82f6';
              e.currentTarget.style.color = theme?.button_text_color || '#ffffff';
            } else if (theme?.button_fill !== 'glass') {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (theme?.button_fill === 'outline') {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = theme?.primary_color || '#3b82f6';
            }
            e.currentTarget.style.transform = '';
          }}
        >
          <IconCalendar size={20} />
          <span>Agendar Reunión</span>
          <IconExternalLink size={16} />
        </button>

        {/* Powered by Calendly */}
        <div className="text-center mt-3">
          <BaseWidget.Text
            theme={theme}
            variant="primary"
            className="text-xs"
            style={{ opacity: 0.5 }}
          >
            Powered by Calendly
          </BaseWidget.Text>
        </div>
      </div>
    </div>
  );
}