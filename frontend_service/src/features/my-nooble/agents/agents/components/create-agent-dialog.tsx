// src/features/my-nooble/agents/agents/components/create-agent-dialog.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { IconSparkles} from '@tabler/icons-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents-api';
import { AgentTemplate } from '@/types/profile';
import { toast } from 'sonner';

const createAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(50, 'Name too long'),
  description: z.string().optional(),
  icon: z.string().min(1, 'Please select an icon'),
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  isPublic: z.boolean(),
});

type CreateAgentFormData = z.infer<typeof createAgentSchema>;

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const emojiOptions = [
  '🤖', '👨‍💼', '👩‍💼', '🎯', '💡', '🚀', '⚡', '🔥', '💎', '🎨',
  '📚', '🔧', '💬', '📊', '🏆', '🌟', '🎵', '🎬', '📷', '🍕',
  '☕', '🌱', '🏃‍♂️', '🧠', '💪', '🎪', '🎲', '🎭', '🎸', '🎤'
];

export function CreateAgentDialog({ open, onOpenChange, onSuccess }: CreateAgentDialogProps) {
  const [activeTab, setActiveTab] = useState<'template' | 'custom'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);

  const form = useForm<CreateAgentFormData>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      name: '',
      description: '',
      icon: '🤖',
      systemPrompt: '',
      isPublic: true,
    },
  });

  // Get agent templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['agent-templates'],
    queryFn: () => agentsApi.getAgentTemplates(),
    enabled: open, // Only fetch when dialog is open
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  // Create agent from template mutation
  const createFromTemplateMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name?: string }) =>
      agentsApi.createAgentFromTemplate(templateId, name),
    onSuccess: () => {
      toast.success('Agent created successfully!');
      onSuccess();
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create agent: ' + error.message);
    },
  });

  // Create custom agent mutation
  const createCustomMutation = useMutation({
    mutationFn: (data: CreateAgentFormData) =>
      agentsApi.createCustomAgent({
        name: data.name,
        description: data.description,
        icon: data.icon,
        systemPrompt: data.systemPrompt,
        isPublic: data.isPublic,
      }),
    onSuccess: () => {
      toast.success('Custom agent created successfully!');
      onSuccess();
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create agent: ' + error.message);
    },
  });

  const resetForm = () => {
    form.reset();
    setSelectedTemplate(null);
    setActiveTab('template');
  };

  const handleTemplateSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    // Pre-fill form with template data
    form.setValue('name', template.name);
    form.setValue('description', template.description);
    form.setValue('icon', template.icon);
    form.setValue('systemPrompt', template.system_prompt_template);
  };

  const handleCreateFromTemplate = () => {
    if (!selectedTemplate) return;
    
    const formData = form.getValues();
    createFromTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      name: formData.name !== selectedTemplate.name ? formData.name : undefined,
    });
  };

  const handleCreateCustom = (data: CreateAgentFormData) => {
    createCustomMutation.mutate(data);
  };

  const isLoading = createFromTemplateMutation.isPending || createCustomMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconSparkles size={20} />
            Create New Agent
          </DialogTitle>
          <DialogDescription>
            Create an AI agent from a template or build a custom one from scratch.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'template' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">From Template</TabsTrigger>
            <TabsTrigger value="custom">Custom Agent</TabsTrigger>
          </TabsList>

          {/* Template Tab */}
          <TabsContent value="template" className="space-y-4 mt-6">
            {templatesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="border rounded-lg p-4 animate-pulse">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-muted rounded-full"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={`border rounded-lg p-4 text-left transition-all hover:shadow-md ${
                        selectedTemplate?.id === template.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="text-lg">
                            {template.icon}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{template.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {template.description}
                          </p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {template.category}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedTemplate && (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-medium mb-2">Template Preview</h4>
                    <div className="space-y-2 text-sm">
                      <p><strong>Name:</strong> {selectedTemplate.name}</p>
                      <p><strong>Description:</strong> {selectedTemplate.description}</p>
                      <div>
                        <strong>System Prompt:</strong>
                        <div className="mt-1 p-2 bg-background rounded text-xs max-h-32 overflow-y-auto">
                          {selectedTemplate.system_prompt_template}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTemplate && (
                  <Form {...form}>
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agent Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter agent name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleCreateFromTemplate} disabled={isLoading}>
                          {isLoading ? 'Creating...' : 'Create Agent'}
                        </Button>
                      </div>
                    </div>
                  </Form>
                )}
              </>
            )}
          </TabsContent>

          {/* Custom Tab */}
          <TabsContent value="custom" className="space-y-4 mt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateCustom)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="My Custom Agent" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Icon</FormLabel>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback>{field.value}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground">Selected icon</span>
                          </div>
                          <div className="grid grid-cols-10 gap-1 max-h-24 overflow-y-auto">
                            {emojiOptions.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => field.onChange(emoji)}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-muted transition-colors ${
                                  field.value === emoji ? 'bg-primary/20 ring-1 ring-primary' : ''
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Brief description of what this agent does" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="systemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Define how your agent should behave, its role, and capabilities..."
                          className="min-h-[120px] resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <Label>Make this agent publicly accessible</Label>
                        <p className="text-sm text-muted-foreground">
                          Visitors to your profile will be able to chat with this agent
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Custom Agent'}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}