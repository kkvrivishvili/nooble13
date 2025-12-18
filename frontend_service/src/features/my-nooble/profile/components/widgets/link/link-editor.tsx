// src/features/my-nooble/profile/components/widgets/link/link-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconLink, IconAlertCircle } from '@tabler/icons-react';
import { WidgetEditor } from '../common/widget-editor';
import { LinkWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateLinkData } from './link-config';

export function LinkEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<LinkWidgetData>) {
  const [formData, setFormData] = useState<LinkWidgetData>({
    title: initialData?.title || '',
    url: initialData?.url || '',
    description: initialData?.description || '',
    icon: initialData?.icon || '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = validateLinkData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      // Normalizar URL si es necesario
      const normalizedData = { ...formData };
      if (normalizedData.url && !normalizedData.url.match(/^https?:\/\//)) {
        normalizedData.url = `https://${normalizedData.url}`;
      }
      
      await onSave(normalizedData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el enlace' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar enlace' : 'Nuevo enlace'}
      icon={IconLink}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Title input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Título *
        </label>
        <Input
          placeholder="Ej: Mi increíble proyecto"
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value });
            if (errors.title) {
              const newErrors = { ...errors };
              delete newErrors.title;
              setErrors(newErrors);
            }
          }}
          className={errors.title ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
          maxLength={100}
        />
        <div className="flex justify-between">
          {errors.title && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <IconAlertCircle size={12} />
              {errors.title}
            </p>
          )}
          <span className="text-xs text-gray-500 ml-auto">
            {formData.title.length}/100
          </span>
        </div>
      </div>

      {/* URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL *
        </label>
        <Input
          type="url"
          placeholder="https://ejemplo.com"
          value={formData.url}
          onChange={(e) => {
            setFormData({ ...formData, url: e.target.value });
            if (errors.url) {
              const newErrors = { ...errors };
              delete newErrors.url;
              setErrors(newErrors);
            }
          }}
          className={errors.url ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
        />
        {errors.url && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.url}
          </p>
        )}
      </div>

      {/* Description input (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Descripción (opcional)
        </label>
        <Input
          placeholder="Breve descripción del enlace"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          disabled={is_saving || is_loading}
          maxLength={200}
        />
        <span className="text-xs text-gray-500 ml-auto block text-right">
          {formData.description?.length || 0}/200
        </span>
      </div>
    </WidgetEditor>
  );
}