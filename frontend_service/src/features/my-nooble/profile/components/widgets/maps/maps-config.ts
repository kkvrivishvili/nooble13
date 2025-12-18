// src/features/my-nooble/profile/components/widgets/maps/maps-config.ts
import { IconMap } from '@tabler/icons-react';
import { MapsWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateMapsData(data: MapsWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate address
  if (!data.address?.trim()) {
    errors.address = 'La dirección es requerida';
  } else if (data.address.length > 500) {
    errors.address = 'La dirección no puede tener más de 500 caracteres';
  }
  
  // Validate coordinates if provided
  if (data.latitude !== undefined && data.latitude !== null) {
    if (data.latitude < -90 || data.latitude > 90) {
      errors.latitude = 'La latitud debe estar entre -90 y 90';
    }
  }
  
  if (data.longitude !== undefined && data.longitude !== null) {
    if (data.longitude < -180 || data.longitude > 180) {
      errors.longitude = 'La longitud debe estar entre -180 y 180';
    }
  }
  
  // Validate zoom level
  if (data.zoom_level < 1 || data.zoom_level > 20) {
    errors.zoom_level = 'El nivel de zoom debe estar entre 1 y 20';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const mapsWidgetConfig: WidgetConfig<MapsWidgetData> = {
  type: WidgetType.Maps,
  label: 'Mapa',
  description: 'Muestra tu ubicación en un mapa',
  icon: IconMap,
  defaultData: {
    address: '',
    latitude: undefined,
    longitude: undefined,
    zoom_level: 15,
    map_style: 'roadmap'
  },
  validator: validateMapsData
};