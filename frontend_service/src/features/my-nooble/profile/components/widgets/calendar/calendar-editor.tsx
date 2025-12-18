// src/features/my-nooble/profile/components/widgets/calendar/calendar-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { WidgetEditor } from '../common/widget-editor';
import { CalendarWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateCalendarData } from './calendar-config';

export function CalendarEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<CalendarWidgetData>) {
  const [formData, setFormData] = useState<CalendarWidgetData>({
    calendly_url: initialData?.calendly_url || '',
    title: initialData?.title || 'Agenda una reunión',
    hide_event_details: initialData?.hide_event_details ?? false,
    hide_cookie_banner: initialData?.hide_cookie_banner ?? true,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = validateCalendarData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el calendario' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar calendario' : 'Nuevo calendario'}
      icon={IconCalendar}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Calendly URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          URL de Calendly *
        </label>
        <Input
          type="url"
          placeholder="https://calendly.com/tu-usuario"
          value={formData.calendly_url}
          onChange={(e) => {
            setFormData({ ...formData, calendly_url: e.target.value });
            if (errors.calendly_url) {
              const newErrors = { ...errors };
              delete newErrors.calendly_url;
              setErrors(newErrors);
            }
          }}
          className={errors.calendly_url ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
        />
        {errors.calendly_url && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.calendly_url}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Ingresa tu enlace público de Calendly
        </p>
      </div>

      {/* Title input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Título *
        </label>
        <Input
          placeholder="Ej: Agenda una llamada conmigo"
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

      {/* Options */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="hide-details" className="text-sm font-medium">
              Ocultar detalles del evento
            </Label>
            <p className="text-xs text-gray-500">
              No muestra la descripción del tipo de evento
            </p>
          </div>
          <Switch
            id="hide-details"
            checked={formData.hide_event_details}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, hide_event_details: checked })
            }
            disabled={is_saving || is_loading}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="hide-cookie" className="text-sm font-medium">
              Ocultar aviso de cookies
            </Label>
            <p className="text-xs text-gray-500">
              Oculta el banner de cookies de Calendly
            </p>
          </div>
          <Switch
            id="hide-cookie"
            checked={formData.hide_cookie_banner}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, hide_cookie_banner: checked })
            }
            disabled={is_saving || is_loading}
          />
        </div>
      </div>

      {/* Help text */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Nota:</strong> Asegúrate de que tu evento en Calendly esté configurado como público 
          para que los visitantes puedan agendar reuniones.
        </p>
      </div>
    </WidgetEditor>
  );
}