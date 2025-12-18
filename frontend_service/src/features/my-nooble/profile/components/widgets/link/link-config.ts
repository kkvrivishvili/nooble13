// src/features/my-nooble/profile/components/widgets/link/link-config.ts
import { IconLink } from '@tabler/icons-react';
import { LinkWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateLinkData(data: LinkWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate title
  if (!data.title?.trim()) {
    errors.title = 'El título es requerido';
  } else if (data.title.length > 100) {
    errors.title = 'El título no puede tener más de 100 caracteres';
  }
  
  // Validate URL
  if (!data.url?.trim()) {
    errors.url = 'La URL es requerida';
  } else {
    // Basic URL validation
    try {
      new URL(data.url);
    } catch {
      // Try adding https:// if missing
      try {
        new URL(`https://${data.url}`);
      } catch {
        errors.url = 'URL inválida';
      }
    }
  }
  
  // Validate description
  if (data.description && data.description.length > 200) {
    errors.description = 'La descripción no puede tener más de 200 caracteres';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const linkWidgetConfig: WidgetConfig<LinkWidgetData> = {
  type: WidgetType.Link,
  label: 'Enlace',
  description: 'Agrega un enlace a cualquier sitio web o recurso',
  icon: IconLink,
  defaultData: {
    title: '',
    url: '',
    description: '',
    icon: ''
  },
  validator: validateLinkData
};