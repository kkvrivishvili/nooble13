// src/features/my-nooble/profile/components/widgets/common/widget-actions.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  IconEdit,
  IconTrash,
  IconExternalLink,
  IconEye,
  IconEyeOff
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface WidgetActionsProps {
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
  onToggleVisibility?: () => void;
  onView?: () => void;
  isVisible?: boolean;
  isDeleting?: boolean;
  disabled?: boolean;
  className?: string;
  showView?: boolean;
  showVisibility?: boolean;
}

export function WidgetActions({
  onEdit,
  onDelete,
  onToggleVisibility,
  onView,
  isVisible = true,
  isDeleting: externalIsDeleting,
  disabled = false,
  className,
  showView = false,
  showVisibility = false,
}: WidgetActionsProps) {
  const [internalIsDeleting, setInternalIsDeleting] = useState(false);
  const isDeleting = externalIsDeleting ?? internalIsDeleting;

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setInternalIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setInternalIsDeleting(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {showView && onView && (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onView}
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" 
          disabled={disabled}
          title="Ver contenido"
        >
          <IconExternalLink size={16} />
        </Button>
      )}
      
      {showVisibility && onToggleVisibility && (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onToggleVisibility}
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" 
          disabled={disabled}
          title={isVisible ? "Ocultar" : "Mostrar"}
        >
          {isVisible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </Button>
      )}
      
      {onEdit && (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onEdit}
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" 
          disabled={disabled || isDeleting}
          title="Editar"
        >
          <IconEdit size={16} />
        </Button>
      )}
      
      {onDelete && (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleDelete}
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" 
          disabled={disabled || isDeleting}
          title="Eliminar"
        >
          {isDeleting ? (
            <div className="h-4 w-4 border-2 border-t-transparent border-gray-500 rounded-full animate-spin" />
          ) : (
            <IconTrash size={16} className="text-red-500" />
          )}
        </Button>
      )}
    </div>
  );
}