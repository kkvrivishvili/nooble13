// src/features/my-nooble/profile/components/widgets/common/widget-overlay.tsx
import { IconGripVertical } from '@tabler/icons-react';
import { BaseWidget, LinkWidgetData, AgentsWidgetData, GalleryWidgetData, WidgetType } from '@/types/widget';
import { linkWidgetConfig } from '../link/link-config';
import { agentsWidgetConfig } from '../agents/agents-config';
import { galleryWidgetConfig } from '../gallery/gallery-config';

interface WidgetOverlayProps {
  widget: BaseWidget;
  data: any;
}

export function WidgetOverlay({ widget, data }: WidgetOverlayProps) {
  const renderContent = () => {
    switch (widget.type) {
      case WidgetType.Link: {
        const linkData = data as LinkWidgetData;
        const Icon = linkWidgetConfig.icon;
        
        return (
          <>
            <div className="flex items-center justify-between p-4 rounded-t-xl">
              <div className="flex items-center gap-2">
                <IconGripVertical size={18} className="text-gray-400" />
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700">
                  <Icon size={16} className="text-gray-700 dark:text-gray-300" />
                </div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{linkData.title}</p>
              </div>
            </div>
            
            {(linkData.description || linkData.url) && (
              <div className="p-4 pt-0 rounded-b-xl">
                {linkData.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {linkData.description}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
                  {linkData.url}
                </p>
              </div>
            )}
          </>
        );
      }
      
      case WidgetType.Agents: {
        const agentsData = data as AgentsWidgetData;
        const Icon = agentsWidgetConfig.icon;
        
        return (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <IconGripVertical size={18} className="text-gray-400" />
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700">
                <Icon size={16} className="text-gray-700 dark:text-gray-300" />
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{agentsData.title}</p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-10">
              {agentsData.agent_ids?.length || 0} agente{(agentsData.agent_ids?.length || 0) !== 1 ? 's' : ''} - Estilo: {agentsData.display_style}
            </p>
          </div>
        );
      }
      
      case WidgetType.Gallery: {
        const galleryData = data as GalleryWidgetData;
        const Icon = galleryWidgetConfig.icon;
        
        return (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <IconGripVertical size={18} className="text-gray-400" />
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700">
                <Icon size={16} className="text-gray-700 dark:text-gray-300" />
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {galleryData.title || 'Galería de productos'}
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-10">
              {galleryData.products.length} producto{galleryData.products.length !== 1 ? 's' : ''} - {galleryData.columns} columna{galleryData.columns !== 1 ? 's' : ''}
            </p>
          </div>
        );
      }
        
      default:
        return (
          <div className="p-4">
            <div className="flex items-center gap-2">
              <IconGripVertical size={18} className="text-gray-400" />
              <p className="font-medium text-gray-900 dark:text-gray-100">Widget</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="widget-drag-overlay">
      {renderContent()}
    </div>
  );
}