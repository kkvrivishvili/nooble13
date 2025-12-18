// src/features/my-nooble/profile/components/widgets/calendar/calendar-widget.tsx
import { IconCalendar, IconExternalLink } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { CalendarWidgetData, WidgetComponentProps } from '@/types/widget';
import { Button } from '@/components/ui/button';

export function CalendarWidget({
  widget,
  data,
  isEditing,
  onEdit,
  onDelete,
}: WidgetComponentProps<CalendarWidgetData>) {
  const handleOpenCalendly = () => {
    if (!isEditing) {
      window.open(data.calendlyUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <SortableWidget widget={widget} isDraggingDisabled={isEditing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconCalendar size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">{data.title}</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={isEditing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Calendly embed */}
      <div className="p-4 pt-3">
        <div className="relative">
          {/* Calendly inline widget */}
          <div className="calendly-inline-widget" style={{ minHeight: '320px', position: 'relative' }}>
            <iframe
              src={`${data.calendlyUrl}?embed_domain=${window.location.hostname}&embed_type=Inline&hide_event_type_details=${data.hideEventDetails ? '1' : '0'}&hide_gdpr_banner=${data.hideCookieBanner ? '1' : '0'}`}
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ minHeight: '320px' }}
              title={data.title}
            />
          </div>
          
          {/* External link button */}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCalendly}
              disabled={isEditing}
              className="w-full"
            >
              <IconExternalLink size={16} className="mr-2" />
              Abrir en Calendly
            </Button>
          </div>
        </div>
      </div>
    </SortableWidget>
  );
}