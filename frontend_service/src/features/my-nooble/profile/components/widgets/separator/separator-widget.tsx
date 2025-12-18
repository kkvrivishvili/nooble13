// src/features/my-nooble/profile/components/widgets/separator/separator-widget.tsx
import { IconMinus } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { SeparatorWidgetData, WidgetComponentProps } from '@/types/widget';

export function SeparatorWidget({
  widget,
  data,
  is_editing,
  onEdit,
  onDelete,
}: WidgetComponentProps<SeparatorWidgetData>) {
  return (
    <SortableWidget widget={widget} isDraggingDisabled={is_editing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconMinus size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">Separador</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={is_editing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Separator line */}
      <div className="px-4">
        <div
          style={{
            borderTop: `${data.thickness}px ${data.style} ${data.color}`,
            marginTop: `${data.margin_top}px`,
            marginBottom: `${data.margin_bottom}px`,
          }}
        />
      </div>
    </SortableWidget>
  );
}