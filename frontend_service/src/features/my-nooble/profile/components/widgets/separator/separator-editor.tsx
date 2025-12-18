// src/features/my-nooble/profile/components/widgets/separator/separator-editor.tsx
import { useState } from 'react';
import { IconMinus, IconAlertCircle } from '@tabler/icons-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { WidgetEditor } from '../common/widget-editor';
import { SeparatorWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateSeparatorData } from './separator-config';

export function SeparatorEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<SeparatorWidgetData>) {
  const [formData, setFormData] = useState<SeparatorWidgetData>({
    style: initialData?.style || 'solid',
    thickness: initialData?.thickness || 1,
    color: initialData?.color || '#cccccc',
    margin_top: initialData?.margin_top || 20,
    margin_bottom: initialData?.margin_bottom || 20,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = validateSeparatorData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el separador' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar separador' : 'Nuevo separador'}
      icon={IconMinus}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Style selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Estilo de línea
        </label>
        <Select
          value={formData.style}
          onValueChange={(value: 'solid' | 'dashed' | 'dotted') => 
            setFormData({ ...formData, style: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Sólida ———</SelectItem>
            <SelectItem value="dashed">Guiones - - -</SelectItem>
            <SelectItem value="dotted">Puntos · · ·</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Thickness */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Grosor: {formData.thickness}px
        </Label>
        <Slider
          value={[formData.thickness]}
          onValueChange={([value]) => setFormData({ ...formData, thickness: value })}
          min={1}
          max={5}
          step={1}
          className="w-full"
          disabled={is_saving || is_loading}
        />
      </div>

      {/* Color */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Color
        </label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            className="w-16 h-10 p-1 cursor-pointer"
            disabled={is_saving || is_loading}
          />
          <Input
            type="text"
            value={formData.color}
            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            placeholder="#cccccc"
            className="flex-1"
            disabled={is_saving || is_loading}
          />
        </div>
        {errors.color && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.color}
          </p>
        )}
      </div>

      {/* Margins */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Margen superior: {formData.margin_top}px
          </Label>
          <Slider
            value={[formData.margin_top]}
            onValueChange={([value]) => setFormData({ ...formData, margin_top: value })}
            min={0}
            max={100}
            step={5}
            className="w-full"
            disabled={is_saving || is_loading}
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Margen inferior: {formData.margin_bottom}px
          </Label>
          <Slider
            value={[formData.margin_bottom]}
            onValueChange={([value]) => setFormData({ ...formData, margin_bottom: value })}
            min={0}
            max={100}
            step={5}
            className="w-full"
            disabled={is_saving || is_loading}
          />
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Vista previa</Label>
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div
            style={{
              borderTop: `${formData.thickness}px ${formData.style} ${formData.color}`,
              marginTop: `${formData.margin_top}px`,
              marginBottom: `${formData.margin_bottom}px`,
            }}
          />
        </div>
      </div>
    </WidgetEditor>
  );
}