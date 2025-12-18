// src/features/my-nooble/profile/components/widgets/gallery/gallery-config.ts
import { IconPhoto } from '@tabler/icons-react';
import { GalleryWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateGalleryData(data: GalleryWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate title (optional)
  if (data.title && data.title.length > 100) {
    errors.title = 'El título no puede tener más de 100 caracteres';
  }
  
  // Validate products
  if (!data.products || data.products.length === 0) {
    errors.products = 'Debes seleccionar al menos un producto';
  } else if (data.products.length > 20) {
    errors.products = 'No puedes seleccionar más de 20 productos';
  }
  
  // Validate columns
  if (data.columns < 1 || data.columns > 4) {
    errors.columns = 'Las columnas deben ser entre 1 y 4';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const galleryWidgetConfig: WidgetConfig<GalleryWidgetData> = {
  type: WidgetType.Gallery,
  label: 'Galería',
  description: 'Muestra una galería de productos o imágenes',
  icon: IconPhoto,
  defaultData: {
    title: '',
    products: [],
    show_price: true,
    show_description: true,
    columns: 3
  },
  validator: validateGalleryData
};