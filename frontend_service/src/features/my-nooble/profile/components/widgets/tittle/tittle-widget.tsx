// src/features/my-nooble/profile/components/widgets/title/title-widget.tsx
import { IconLetterT } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { TitleWidgetData, WidgetComponentProps } from '@/types/widget';
import { cn } from '@/lib/utils';

export function TitleWidget({
  widget,
  data,
  is_editing,
  onEdit,
  onDelete,
}: WidgetComponentProps<TitleWidgetData>) {
  // Get text classes
  const getTextClasses = () => {
    const sizeClasses = {
      'sm': 'text-sm',
      'md': 'text-base',
      'lg': 'text-lg',
      'xl': 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
    };
    
    const weightClasses = {
      'normal': 'font-normal',
      'medium': 'font-medium',
      'semibold': 'font-semibold',
      'bold': 'font-bold',
    };
    
    const alignClasses = {
      'left': 'text-left',
      'center': 'text-center',
      'right': 'text-right',
    };
    
    return cn(
      sizeClasses[data.font_size],
      weightClasses[data.font_weight],
      alignClasses[data.text_align],
      'text-gray-900 dark:text-gray-100'
    );
  };

  return (
    <SortableWidget widget={widget} isDraggingDisabled={is_editing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconLetterT size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">Título</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={is_editing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Title text */}
      <div className="p-4 pt-3">
        <p className={getTextClasses()}>
          {data.text}
        </p>
      </div>
    </SortableWidget>
  );
}