// src/features/my-nooble/profile/components/widgets/common/sortable-widget.tsx

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { BaseWidget } from '@/types/widget';

interface SortableWidgetProps {
  widget: BaseWidget;
  children: React.ReactNode;
  isDraggingDisabled?: boolean;
  className?: string;
}

export function SortableWidget({ 
  widget, 
  children, 
  isDraggingDisabled = false,
  className
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: widget.id,
    disabled: isDraggingDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 999 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "mb-4 rounded-xl",
        isDragging && "opacity-50 cursor-grabbing",
        className
      )}
    >
      <div className={cn(
        "relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700",
        "transition-shadow duration-200",
        !isDragging && "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
        "group"
      )}>
        {/* Drag handle */}
        <div className="absolute left-4 top-4 z-10">
          <button
            ref={setActivatorNodeRef}
            className={cn(
              "touch-none p-1 rounded",
              "hover:bg-gray-100 dark:hover:bg-gray-700",
              "focus:outline-none focus:ring-2 focus:ring-primary",
              "cursor-grab active:cursor-grabbing",
              isDraggingDisabled && "opacity-50 cursor-not-allowed",
              isDragging && "cursor-grabbing"
            )}
            {...attributes}
            {...listeners}
            disabled={isDraggingDisabled}
            aria-label="Arrastrar para reordenar"
          >
            <IconGripVertical size={18} className="text-gray-400" />
          </button>
        </div>
        
        {/* Widget content */}
        <div className="pl-12">
          {children}
        </div>
      </div>
    </div>
  );
}