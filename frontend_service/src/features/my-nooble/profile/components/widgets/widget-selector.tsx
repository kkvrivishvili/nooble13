// src/features/my-nooble/profile/components/widgets/widget-selector.tsx

import { 
  IconLink,
  IconUsers,
  IconPhoto,
  IconBrandYoutube,
  IconMap,
  IconBrandSpotify,
  IconCalendar,
  IconMinus,
  IconLetterT
} from '@tabler/icons-react';
import { WidgetType } from '@/types/widget';
import { cn } from '@/lib/utils';

interface WidgetOption {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ElementType;
  available: boolean;
}

const widgetOptions: WidgetOption[] = [
  {
    type: WidgetType.Link,
    label: 'Enlace',
    description: 'Agrega un enlace a cualquier sitio web',
    icon: IconLink,
    available: true,
  },
  {
    type: WidgetType.Agents,
    label: 'Agentes',
    description: 'Muestra tus agentes de chat',
    icon: IconUsers,
    available: true, // Coming soon
  },
  {
    type: WidgetType.Gallery,
    label: 'Galería',
    description: 'Muestra productos o imágenes',
    icon: IconPhoto,
    available: true,
  },
  {
    type: WidgetType.YouTube,
    label: 'YouTube',
    description: 'Inserta un video de YouTube',
    icon: IconBrandYoutube,
    available: true,
  },
  {
    type: WidgetType.Maps,
    label: 'Mapa',
    description: 'Muestra tu ubicación',
    icon: IconMap,
    available: true,
  },
  {
    type: WidgetType.Spotify,
    label: 'Spotify',
    description: 'Comparte tu música favorita',
    icon: IconBrandSpotify,
    available: true,
  },
  {
    type: WidgetType.Calendar,
    label: 'Calendario',
    description: 'Permite agendar reuniones',
    icon: IconCalendar,
    available: true,
  },
  {
    type: WidgetType.Separator,
    label: 'Separador',
    description: 'Divide secciones visualmente',
    icon: IconMinus,
    available: true,
  },
  {
    type: WidgetType.Title,
    label: 'Título',
    description: 'Agrega un título o encabezado',
    icon: IconLetterT,
    available: true,
  },
];

interface WidgetSelectorProps {
  onSelect: (type: WidgetType) => void;
}

export function WidgetSelector({ onSelect }: WidgetSelectorProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {widgetOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() => option.available && onSelect(option.type)}
              disabled={!option.available}
              className={cn(
                "group relative p-4 rounded-lg border text-left transition-all",
                "hover:shadow-md hover:border-primary/50",
                option.available
                  ? "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  : "border-gray-100 dark:border-gray-800 opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "widget-icon",
                  !option.available && "opacity-50"
                )}>
                  <Icon size={20} className="text-gray-700 dark:text-gray-300" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {option.label}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </div>
              </div>
              
              {!option.available && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-900/5 dark:bg-gray-100/5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded">
                    Próximamente
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Más tipos de widgets estarán disponibles pronto
        </p>
      </div>
    </>
  );
}