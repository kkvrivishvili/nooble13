// src/features/my-nooble/profile/components/widgets/separator/separator-config.ts
import { IconMinus } from '@tabler/icons-react';
import { SeparatorWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateSeparatorData(data: SeparatorWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate style
  if (!['solid', 'dashed', 'dotted'].includes(data.style)) {
    errors.style = 'Estilo inválido';
  }
  
  // Validate thickness
  if (data.thickness < 1 || data.thickness > 5) {
    errors.thickness = 'El grosor debe estar entre 1 y 5';
  }
  
  // Validate color
  if (!data.color || !/^#[0-9A-F]{6}$/i.test(data.color)) {
    errors.color = 'Color inválido (debe ser hexadecimal)';
  }
  
  // Validate margins
  if (data.margin_top < 0 || data.margin_top > 100) {
    errors.margin_top = 'El margen superior debe estar entre 0 y 100';
  }
  
  if (data.margin_bottom < 0 || data.margin_bottom > 100) {
    errors.margin_bottom = 'El margen inferior debe estar entre 0 y 100';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const separatorWidgetConfig: WidgetConfig<SeparatorWidgetData> = {
  type: WidgetType.Separator,
  label: 'Separador',
  description: 'Divide secciones visualmente con una línea',
  icon: IconMinus,
  defaultData: {
    style: 'solid',
    thickness: 1,
    color: '#cccccc',
    margin_top: 20,
    margin_bottom: 20
  },
  validator: validateSeparatorData
};