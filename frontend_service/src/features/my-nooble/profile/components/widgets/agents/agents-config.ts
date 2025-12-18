// src/features/my-nooble/profile/components/widgets/agents/agents-config.ts
import { IconUsers } from '@tabler/icons-react';
import { AgentsWidgetData, WidgetConfig, ValidationResult, WidgetType } from '@/types/widget';

export function validateAgentsData(data: AgentsWidgetData): ValidationResult {
  const errors: Record<string, string> = {};
  
  // Validate title
  if (!data.title?.trim()) {
    errors.title = 'El título es requerido';
  } else if (data.title.length > 100) {
    errors.title = 'El título no puede tener más de 100 caracteres';
  }
  
  // Validate agent_ids
  if (!data.agent_ids || data.agent_ids.length === 0) {
    errors.agent_ids = 'Debes seleccionar al menos un agente';
  } else if (data.agent_ids.length > 10) {
    errors.agent_ids = 'No puedes seleccionar más de 10 agentes';
  }
  
  // Validate display_style
  if (!['card', 'list', 'bubble'].includes(data.display_style)) {
    errors.display_style = 'Estilo de visualización inválido';
  }
  
  return {
    is_valid: Object.keys(errors).length === 0,
    errors
  };
}

export const agentsWidgetConfig: WidgetConfig<AgentsWidgetData> = {
  type: WidgetType.Agents,
  label: 'Agentes',
  description: 'Muestra tus agentes de chat para que los visitantes puedan interactuar',
  icon: IconUsers,
  defaultData: {
    title: 'Mis Agentes',
    agent_ids: [],
    display_style: 'card'
  },
  validator: validateAgentsData
};