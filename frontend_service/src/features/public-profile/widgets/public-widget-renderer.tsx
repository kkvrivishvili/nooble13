import React from 'react';
import { Widget } from '@/types/profile';
import { ProfileTheme } from '@/types/profile';
import {
  PublicLinkWidget,
  PublicAgentsWidget,  
  PublicSeparatorWidget,
  PublicTitleWidget,
  PublicYouTubeWidget,
  PublicMapsWidget,
  PublicSpotifyWidget,
  PublicCalendarWidget,
  PublicGalleryWidget
} from './index';

interface PublicWidgetRendererProps {
  widget: Widget;
  data: any;
  theme: ProfileTheme;
  className?: string;
  onAgentClick?: (agentId: string) => void;
  productsData?: any[]; // For gallery widget
}

export function PublicWidgetRenderer({ 
  widget, 
  data, 
  theme, 
  className,
  onAgentClick,
  productsData
}: PublicWidgetRendererProps) {
  const baseProps = {
    id: widget.id,
    theme,
    className
  };

  switch (widget.type) {
    case 'link':
      return <PublicLinkWidget {...baseProps} data={data} />;
      
    case 'agents':
      return (
        <PublicAgentsWidget 
          {...baseProps} 
          data={{
            ...data,
            onAgentClick
          }} 
        />
      );
      
    case 'separator':
      return <PublicSeparatorWidget {...baseProps} data={data} />;
      
    case 'title':
      return <PublicTitleWidget {...baseProps} data={data} />;
      
    case 'youtube':
      return <PublicYouTubeWidget {...baseProps} data={data} />;
      
    case 'maps':
      return <PublicMapsWidget {...baseProps} data={data} />;
      
    case 'spotify':
      return <PublicSpotifyWidget {...baseProps} data={data} />;
      
    case 'calendar':
      return <PublicCalendarWidget {...baseProps} data={data} />;
      
    case 'gallery':
      return <PublicGalleryWidget {...baseProps} data={data} productsData={productsData} />;
      
    default:
      return null;
  }
}