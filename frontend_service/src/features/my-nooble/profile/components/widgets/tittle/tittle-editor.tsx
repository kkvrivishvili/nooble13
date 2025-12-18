// src/features/my-nooble/profile/components/widgets/title/title-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconLetterT, IconAlertCircle } from '@tabler/icons-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { WidgetEditor } from '../common/widget-editor';
import { TitleWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateTitleData } from './tittle-config';
import { cn } from '@/lib/utils';

export function TitleEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<TitleWidgetData>) {
  const [formData, setFormData] = useState<TitleWidgetData>({
    text: initialData?.text || '',
    font_size: initialData?.font_size || 'xl',
    text_align: initialData?.text_align || 'center',
    font_weight: initialData?.font_weight || 'bold',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const validation = validateTitleData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el título' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Get preview classes
  const getPreviewClasses = () => {
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
      sizeClasses[formData.font_size],
      weightClasses[formData.font_weight],
      alignClasses[formData.text_align],
      'text-gray-900 dark:text-gray-100'
    );
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar título' : 'Nuevo título'}
      icon={IconLetterT}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Text input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Texto *
        </label>
        <Input
          placeholder="Ej: Mis servicios"
          value={formData.text}
          onChange={(e) => {
            setFormData({ ...formData, text: e.target.value });
            if (errors.text) {
              const newErrors = { ...errors };
              delete newErrors.text;
              setErrors(newErrors);
            }
          }}
          className={errors.text ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
          maxLength={200}
        />
        <div className="flex justify-between">
          {errors.text && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <IconAlertCircle size={12} />
              {errors.text}
            </p>
          )}
          <span className="text-xs text-gray-500 ml-auto">
            {formData.text.length}/200
          </span>
        </div>
      </div>

      {/* Font size */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Tamaño de fuente
        </label>
        <Select
          value={formData.font_size}
          onValueChange={(value: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl') => 
            setFormData({ ...formData, font_size: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Pequeño</SelectItem>
            <SelectItem value="md">Mediano</SelectItem>
            <SelectItem value="lg">Grande</SelectItem>
            <SelectItem value="xl">Extra grande</SelectItem>
            <SelectItem value="2xl">2X grande</SelectItem>
            <SelectItem value="3xl">3X grande</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Text alignment */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Alineación</Label>
        <RadioGroup
          value={formData.text_align}
          onValueChange={(value: 'left' | 'center' | 'right') => 
            setFormData({ ...formData, text_align: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="left" id="left" />
            <Label htmlFor="left" className="font-normal cursor-pointer">
              Izquierda
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="center" id="center" />
            <Label htmlFor="center" className="font-normal cursor-pointer">
              Centro
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="right" id="right" />
            <Label htmlFor="right" className="font-normal cursor-pointer">
              Derecha
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Font weight */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Peso de fuente
        </label>
        <Select
          value={formData.font_weight}
          onValueChange={(value: 'normal' | 'medium' | 'semibold' | 'bold') => 
            setFormData({ ...formData, font_weight: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="medium">Medio</SelectItem>
            <SelectItem value="semibold">Semi-negrita</SelectItem>
            <SelectItem value="bold">Negrita</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      {formData.text && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Vista previa</Label>
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className={getPreviewClasses()}>
              {formData.text}
            </p>
          </div>
        </div>
      )}
    </WidgetEditor>
  );
}