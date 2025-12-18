// src/features/my-nooble/profile/components/widgets/agents/agents-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconUsers, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { WidgetEditor } from '../common/widget-editor';
import { AgentsWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateAgentsData } from './agents-config';
import { useProfile } from '@/context/profile-context';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function AgentsEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<AgentsWidgetData>) {
  const { profile } = useProfile();
  const [formData, setFormData] = useState<AgentsWidgetData>({
    title: initialData?.title || 'Mis Agentes',
    agent_ids: initialData?.agent_ids || [],
    display_style: initialData?.display_style || 'card',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  // Get available agents
  const availableAgents = profile?.agentDetails.filter(agent => agent.is_active) || [];

  const handleSave = async () => {
    const validation = validateAgentsData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar el widget' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAgentToggle = (agentId: string) => {
    setFormData(prev => ({
      ...prev,
      agent_ids: prev.agent_ids.includes(agentId)
        ? prev.agent_ids.filter(id => id !== agentId)
        : [...prev.agent_ids, agentId]
    }));
    // Clear agent_ids error
    if (errors.agent_ids) {
      const newErrors = { ...errors };
      delete newErrors.agent_ids;
      setErrors(newErrors);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar widget de agentes' : 'Nuevo widget de agentes'}
      icon={IconUsers}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Title input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Título *
        </label>
        <Input
          placeholder="Ej: Habla con nuestro equipo"
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value });
            if (errors.title) {
              const newErrors = { ...errors };
              delete newErrors.title;
              setErrors(newErrors);
            }
          }}
          className={errors.title ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
          maxLength={100}
        />
        <div className="flex justify-between">
          {errors.title && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <IconAlertCircle size={12} />
              {errors.title}
            </p>
          )}
          <span className="text-xs text-gray-500 ml-auto">
            {formData.title.length}/100
          </span>
        </div>
      </div>

      {/* Agent selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Selecciona agentes *
        </label>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {availableAgents.length > 0 ? (
            availableAgents.map(agent => (
              <div
                key={agent.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  formData.agent_ids.includes(agent.id)
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
                onClick={() => handleAgentToggle(agent.id)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{agent.icon}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-sm">{agent.name}</p>
                  {agent.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {agent.description}
                    </p>
                  )}
                </div>
                {formData.agent_ids.includes(agent.id) && (
                  <IconCheck size={16} className="text-primary" />
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No tienes agentes disponibles. Crea algunos primero.
            </p>
          )}
        </div>
        {errors.agent_ids && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.agent_ids}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Seleccionados: {formData.agent_ids.length} de {availableAgents.length}
        </p>
      </div>

      {/* Display style */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Estilo de visualización
        </label>
        <RadioGroup
          value={formData.display_style}
          onValueChange={(value: any) => 
            setFormData({ ...formData, display_style: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="card" id="card" />
            <Label htmlFor="card" className="font-normal cursor-pointer">
              Tarjetas - Muestra detalles completos
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="list" id="list" />
            <Label htmlFor="list" className="font-normal cursor-pointer">
              Lista - Vista compacta
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="bubble" id="bubble" />
            <Label htmlFor="bubble" className="font-normal cursor-pointer">
              Burbujas - Botones redondeados
            </Label>
          </div>
        </RadioGroup>
      </div>
    </WidgetEditor>
  );
}