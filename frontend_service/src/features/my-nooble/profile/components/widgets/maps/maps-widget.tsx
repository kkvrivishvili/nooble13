// src/features/my-nooble/profile/components/widgets/maps/maps-widget.tsx
import { IconMap, IconExternalLink } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { MapsWidgetData, WidgetComponentProps } from '@/types/widget';
import { Button } from '@/components/ui/button';

export function MapsWidget({
  widget,
  data,
  isEditing,
  onEdit,
  onDelete,
}: WidgetComponentProps<MapsWidgetData>) {
  // Generate Google Maps URL
  const getMapsUrl = () => {
    if (data.latitude && data.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`;
  };

  const handleOpenInMaps = () => {
    if (!isEditing) {
      window.open(getMapsUrl(), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <SortableWidget widget={widget} isDraggingDisabled={isEditing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconMap size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">Ubicación</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={isEditing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Map display */}
      <div className="p-4 pt-3">
        {/* Static map image */}
        <div className="relative aspect-[16/9] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-3">
          <img
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${
              data.latitude && data.longitude 
                ? `${data.latitude},${data.longitude}` 
                : encodeURIComponent(data.address)
            }&zoom=${data.zoomLevel}&size=600x400&maptype=${data.mapStyle}&markers=${
              data.latitude && data.longitude 
                ? `${data.latitude},${data.longitude}` 
                : encodeURIComponent(data.address)
            }&key=YOUR_GOOGLE_MAPS_API_KEY`}
            alt="Mapa de ubicación"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to placeholder if API key is missing
              e.currentTarget.src = 'https://via.placeholder.com/600x400?text=Mapa+no+disponible';
            }}
          />
          
          {/* Overlay for click */}
          <button
            onClick={handleOpenInMaps}
            className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors duration-200 cursor-pointer group"
            disabled={isEditing}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg">
                <IconExternalLink size={24} className="text-gray-700 dark:text-gray-300" />
              </div>
            </div>
          </button>
        </div>
        
        {/* Address and action */}
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {data.address}
          </p>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInMaps}
            disabled={isEditing}
            className="w-full"
          >
            <IconExternalLink size={16} className="mr-2" />
            Ver en Google Maps
          </Button>
        </div>
        
        {/* Note about API key */}
        <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Nota:</strong> Para mostrar el mapa, configura tu API key de Google Maps.
          </p>
        </div>
      </div>
    </SortableWidget>
  );
}