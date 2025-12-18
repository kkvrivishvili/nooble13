// src/features/my-nooble/profile/components/widgets/link/link-widget.tsx
import { IconLink, IconExternalLink } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { LinkWidgetData, WidgetComponentProps } from '@/types/widget';

export function LinkWidget({
  widget,
  data,
  isEditing,
  onEdit,
  onDelete,
}: WidgetComponentProps<LinkWidgetData>) {
  const handleExternalClick = () => {
    if (!isEditing) {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <SortableWidget widget={widget} isDraggingDisabled={isEditing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconLink size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">{data.title}</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          onView={handleExternalClick}
          showView={true}
          disabled={isEditing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* URL Preview - Mantiene el mismo estilo que antes */}
      {(data.description || data.url) && (
        <div 
          className="widget-link-preview group/link"
          onClick={handleExternalClick}
        >
          {data.description && (
            <p className="widget-description">
              {data.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-500 truncate flex-1">
              {data.url}
            </p>
            <IconExternalLink 
              size={14} 
              className="text-gray-400 group-hover/link:text-gray-600 dark:group-hover/link:text-gray-300 transition-colors flex-shrink-0"
            />
          </div>
        </div>
      )}
    </SortableWidget>
  );
}