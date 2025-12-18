// src/features/public-profile/widgets/public-agents-widget.tsx - Fixed for snake_case
import { IconMessage } from '@tabler/icons-react';
import { PublicWidgetProps, PublicAgentsWidgetData } from './types';
import BaseWidget from './BaseWidget';
import { getShadowStyle, getBorderRadius, getFontFamily } from '@/features/public-profile/utils/theme-styles';

interface PublicAgentsWidgetProps extends PublicWidgetProps {
  data: PublicAgentsWidgetData;
}

export function PublicAgentsWidget({ data, theme, className }: PublicAgentsWidgetProps) {
  // Use theme utilities for consistent styling
  const getCardStyles = (isCard: boolean = false) => {
    if (!theme) return {};
    
    const baseStyles = {
      borderRadius: getBorderRadius(theme),
      transition: 'all 0.2s ease',
      fontFamily: getFontFamily(theme.font_family),
    };

    if (isCard) {
      if (theme.button_fill === 'glass') {
        return {
          ...baseStyles,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1px solid rgba(255, 255, 255, 0.2)`,
        };
      }
      return {
        ...baseStyles,
        backgroundColor: theme.background_color || '#ffffff',
        border: `1px solid ${theme.primary_color || '#e5e7eb'}`,
      };
    }
    
    return baseStyles;
  };

  const renderAgentCard = (agent: typeof data.agents[0]) => (
    <button
      key={agent.id}
      onClick={() => data.onAgentClick?.(agent.id)}
      className="w-full p-3 transition-all duration-200 hover:shadow-md active:scale-[0.98]"
      style={{
        ...getCardStyles(true),
        boxShadow: theme ? getShadowStyle(theme) : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl">{agent.icon}</div>
        <div className="flex-1 text-left">
          <h4 
            className="font-medium text-sm"
            style={{ color: theme?.text_color || theme?.primary_color || '#111827' }}
          >
            {agent.name}
          </h4>
          {agent.description && (
            <p 
              className="text-xs mt-1"
              style={{ 
                color: theme?.text_color || theme?.primary_color || '#6b7280',
                opacity: 0.7
              }}
            >
              {agent.description}
            </p>
          )}
        </div>
        <IconMessage 
          size={16} 
          style={{ color: theme?.primary_color || '#6b7280' }}
        />
      </div>
    </button>
  );

  const renderAgentList = (agent: typeof data.agents[0]) => (
    <button
      key={agent.id}
      onClick={() => data.onAgentClick?.(agent.id)}
      className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors"
      style={{
        backgroundColor: 'transparent',
        fontFamily: theme ? getFontFamily(theme.font_family) : 'sans-serif',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${theme?.primary_color || '#000'}10`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div className="text-xl">{agent.icon}</div>
      <span 
        className="flex-1 text-left font-medium text-sm"
        style={{ color: theme?.text_color || theme?.primary_color || '#111827' }}
      >
        {agent.name}
      </span>
    </button>
  );

  const renderAgentBubble = (agent: typeof data.agents[0]) => {
    const bubbleStyles = {
      backgroundColor: `${theme?.primary_color || '#f3f4f6'}20`,
      color: theme?.primary_color || '#374151',
      border: `1px solid ${theme?.primary_color || '#e5e7eb'}`,
      borderRadius: theme?.border_radius === 'sharp' ? '0.5rem' :
                   theme?.border_radius === 'curved' ? '1rem' : '9999px', // Bubble keeps its unique radius logic
      fontFamily: theme ? getFontFamily(theme.font_family) : 'sans-serif',
    };

    return (
      <button
        key={agent.id}
        onClick={() => data.onAgentClick?.(agent.id)}
        className="inline-flex items-center gap-2 px-3 py-2 transition-all hover:scale-105"
        style={bubbleStyles}
      >
        <span className="text-lg">{agent.icon}</span>
        <span className="font-medium text-sm">{agent.name}</span>
      </button>
    );
  };

  return (
    <div className={className}>
      <BaseWidget.Text
        variant="primary"
        theme={theme}
        className="font-semibold mb-3 text-lg"
      >
        {data.title}
      </BaseWidget.Text>
      
      {data.display_style === 'card' && (
        <div className="space-y-2">
          {data.agents.map(renderAgentCard)}
        </div>
      )}
      
      {data.display_style === 'list' && (
        <div className="space-y-1">
          {data.agents.map(renderAgentList)}
        </div>
      )}
      
      {data.display_style === 'bubble' && (
        <div className="flex flex-wrap gap-2">
          {data.agents.map(renderAgentBubble)}
        </div>
      )}
    </div>
  );
}