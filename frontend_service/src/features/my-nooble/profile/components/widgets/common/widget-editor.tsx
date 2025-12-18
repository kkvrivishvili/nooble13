// src/features/my-nooble/profile/components/widgets/common/widget-editor.tsx

import { Button } from '@/components/ui/button';
import { IconCheck, IconX, IconAlertCircle } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { IconComponent } from '@/types/profile';

interface WidgetEditorProps {
  title: string;
  icon: IconComponent;
  onSave: () => Promise<void>;
  onCancel: () => void;
  is_loading?: boolean;
  is_saving?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function WidgetEditor({
  title,
  icon: Icon,
  onSave,
  onCancel,
  is_loading = false,
  is_saving = false,
  error,
  children,
  className
}: WidgetEditorProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      onSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className={cn(
        "p-4 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg space-y-4",
        className
      )}
      onKeyDown={handleKeyPress}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon size={20} className="text-blue-600 dark:text-blue-400" />
        <h4 className="font-medium text-blue-900 dark:text-blue-100">
          {title}
        </h4>
      </div>

      {/* Form content */}
      <div className="space-y-4">
        {children}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <IconAlertCircle size={16} className="text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={onSave}
          disabled={is_saving || is_loading}
          className="flex-1"
        >
          <IconCheck size={16} className="mr-1" />
          {is_saving ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          disabled={is_saving || is_loading}
          className="flex-1"
        >
          <IconX size={16} className="mr-1" />
          Cancelar
        </Button>
      </div>
      
      <p className="text-xs text-gray-500 text-center">
        <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl+Enter</kbd> para guardar
        {' • '}
        <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Esc</kbd> para cancelar
      </p>
    </div>
  );
}