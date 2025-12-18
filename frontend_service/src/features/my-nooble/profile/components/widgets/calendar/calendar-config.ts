// src/features/my-nooble/profile/components/widgets/calendar/calendar-config.ts
import { IconCalendar } from '@tabler/icons-react';
import { CalendarWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateCalendarData(data: CalendarWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate Calendly URL
  if (!data.calendly_url?.trim()) {
    errors.calendly_url = 'La URL de Calendly es requerida';
  } else {
    // Basic Calendly URL validation
    const calendlyRegex = /^(https?:\/\/)?(www\.)?calendly\.com\/[a-zA-Z0-9-_]+/;
    if (!calendlyRegex.test(data.calendly_url)) {
      errors.calendly_url = 'URL de Calendly inválida';
    }
  }
  
  // Validate title
  if (!data.title?.trim()) {
    errors.title = 'El título es requerido';
  } else if (data.title.length > 100) {
    errors.title = 'El título no puede tener más de 100 caracteres';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const calendarWidgetConfig: WidgetConfig<CalendarWidgetData> = {
  type: WidgetType.Calendar,
  label: 'Calendario',
  description: 'Permite a los visitantes agendar reuniones contigo',
  icon: IconCalendar,
  defaultData: {
    calendly_url: '',
    title: 'Agenda una reunión',
    hide_event_details: false,
    hide_cookie_banner: true
  },
  validator: validateCalendarData
};