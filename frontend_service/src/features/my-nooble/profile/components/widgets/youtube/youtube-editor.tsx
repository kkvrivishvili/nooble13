// src/features/my-nooble/profile/components/widgets/youtube/youtube-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconBrandYoutube, IconAlertCircle } from '@tabler/icons-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { WidgetEditor } from '../common/widget-editor';
import { YouTubeWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateYouTubeData } from './youtube-config';

export function YouTubeEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<YouTubeWidgetData>) {
  const [formData, setFormData] = useState<YouTubeWidgetData>({
    video_url: initialData?.video_url || '',
    title: initialData?.title || '',
    autoplay: initialData?.autoplay ?? false,
    show_controls: initialData?.show_controls ?? true,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = validateYouTubeData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el widget' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar video de YouTube' : 'Nuevo video de YouTube'}
      icon={IconBrandYoutube}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Video URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL del video *
        </label>
        <Input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={formData.video_url}
          onChange={(e) => {
            setFormData({ ...formData, video_url: e.target.value });
            if (errors.video_url) {
              const newErrors = { ...errors };
              delete newErrors.video_url;
              setErrors(newErrors);
            }
          }}
          className={errors.video_url ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
        />
        {errors.video_url && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.video_url}
          </p>
        )}
      </div>

      {/* Title input (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Título (opcional)
        </label>
        <Input
          placeholder="Ej: Mi último video"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          disabled={is_saving || is_loading}
          maxLength={100}
        />
      </div>

      {/* Options */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="autoplay" className="text-sm font-medium">
            Reproducir automáticamente
          </Label>
          <Switch
            id="autoplay"
            checked={formData.autoplay}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, autoplay: checked })
            }
            disabled={is_saving || is_loading}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="show-controls" className="text-sm font-medium">
            Mostrar controles del video
          </Label>
          <Switch
            id="show-controls"
            checked={formData.show_controls}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, show_controls: checked })
            }
            disabled={is_saving || is_loading}
          />
        </div>
      </div>
    </WidgetEditor>
  );
}