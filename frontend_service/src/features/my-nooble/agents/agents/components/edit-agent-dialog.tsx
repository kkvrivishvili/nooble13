import { useState, useEffect } from 'react';
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
  FormDescription,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutation } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents-api';
import { Agent } from '@/types/profile';
import { toast } from 'sonner';

const editAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(50, 'Name too long'),
  description: z.string().optional(),
  icon: z.string().min(1, 'Please select an icon'),
  system_prompt_override: z.string().optional(),
  is_public: z.boolean(),
  // Config schemas - usando snake_case para compatibilidad con DB
  query_config: z.object({
    model: z.string(),
    temperature: z.number().min(0).max(2),
    max_tokens: z.number().min(1).max(32000),
    top_p: z.number().min(0).max(1),
    frequency_penalty: z.number().min(-2).max(2),
    presence_penalty: z.number().min(-2).max(2),
    stream: z.boolean()
  }),
  rag_config: z.object({
    embedding_model: z.string(),
    embedding_dimensions: z.number().min(1).max(4096),
    chunk_size: z.number().min(100).max(2000),
    chunk_overlap: z.number().min(0).max(500),
    top_k: z.number().min(1).max(100),
    similarity_threshold: z.number().min(0).max(1),
    hybrid_search: z.boolean(),
    rerank: z.boolean()
  }),
  execution_config: z.object({
    history_enabled: z.boolean(),
    history_window: z.number().min(0).max(50),
    history_ttl: z.number().min(300).max(86400), // 5 min to 24 hours
    max_iterations: z.number().min(1).max(20),
    timeout_seconds: z.number().min(10).max(300)
  })
});

type EditAgentFormData = z.infer<typeof editAgentSchema>;

interface EditAgentDialogProps {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const emojiOptions = [
  '🤖', '👨‍💼', '👩‍💼', '🎯', '💡', '🚀', '⚡', '🔥', '💎', '🎨',
  '📚', '🔧', '💬', '📊', '🏆', '🌟', '🎵', '🎬', '📷', '🍕',
  '☕', '🌱', '🏃‍♂️', '🧠', '💪', '🎪', '🎲', '🎭', '🎸', '🎤'
];

const modelOptions = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Versatile)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
];

export function EditAgentDialog({ agent, open, onOpenChange, onSuccess }: EditAgentDialogProps)  {
  const [activeTab, setActiveTab] = useState('general');

  const form = useForm<EditAgentFormData>({
    resolver: zodResolver(editAgentSchema),
    defaultValues: {
      name: agent.name,
      description: agent.description || '',
      icon: agent.icon,
      system_prompt_override: agent.system_prompt_override || '',
      is_public: agent.is_public,
      query_config: agent.query_config,
      rag_config: agent.rag_config,
      execution_config: agent.execution_config
    },
  });

  // Reset form when agent changes
  useEffect(() => {
    form.reset({
      name: agent.name,
      description: agent.description || '',
      icon: agent.icon,
      system_prompt_override: agent.system_prompt_override || '',
      is_public: agent.is_public,
      query_config: agent.query_config,
      rag_config: agent.rag_config,
      execution_config: agent.execution_config
    });
  }, [agent, form]);

  // Update agent mutation
  const updateMutation = useMutation({
    mutationFn: async (data: EditAgentFormData) => {
      // Update basic info
      await agentsApi.updateAgent(agent.id, {
        name: data.name,
        description: data.description,
        icon: data.icon,
        system_prompt_override: data.system_prompt_override,
        is_public: data.is_public,
      });

      // Update configs
      await agentsApi.updateAgentConfig(agent.id, {
        query_config: data.query_config,
        rag_config: data.rag_config,
        execution_config: data.execution_config,
      });
    },
    onSuccess: () => {
      toast.success('Agent updated successfully!');
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Failed to update agent: ' + error.message);
    },
  });

  const handleSubmit = (data: EditAgentFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Modify your agent's settings and configurations.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="query">Query</TabsTrigger>
                <TabsTrigger value="rag">RAG</TabsTrigger>
                <TabsTrigger value="execution">Execution</TabsTrigger>
              </TabsList>

              {/* General Tab */}
              <TabsContent value="general" className="space-y-4 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agent Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="My Agent" />
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Brief description of what this agent does" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="system_prompt_override"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Add custom instructions to modify the agent's behavior..."
                          className="min-h-[100px] resize-none"
                        />
                      </FormControl>
                      <FormDescription>
                        These instructions will be appended to the agent's base prompt.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_public"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <Label>Public Access</Label>
                        <p className="text-sm text-muted-foreground">
                          Allow visitors to chat with this agent
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
              </TabsContent>

              {/* Query Config Tab */}
              <TabsContent value="query" className="space-y-4 mt-6">
                <FormField
                  control={form.control}
                  name="query_config.model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modelOptions.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="query_config.temperature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Temperature: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={0}
                            max={2}
                            step={0.1}
                          />
                        </FormControl>
                        <FormDescription>
                          Controls randomness (0 = focused, 2 = creative)
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="query_config.max_tokens"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Tokens</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum response length
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="query_config.top_p"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Top P: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={0}
                            max={1}
                            step={0.05}
                          />
                        </FormControl>
                        <FormDescription>
                          Nucleus sampling threshold
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="query_config.stream"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <Label>Stream Responses</Label>
                          <p className="text-sm text-muted-foreground">
                            Show responses as they're generated
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
                </div>
              </TabsContent>

              {/* RAG Config Tab */}
              <TabsContent value="rag" className="space-y-4 mt-6">
                <FormField
                  control={form.control}
                  name="rag_config.top_k"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Top K Results: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([value]) => field.onChange(value)}
                          min={1}
                          max={50}
                          step={1}
                        />
                      </FormControl>
                      <FormDescription>
                        Number of relevant documents to retrieve
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rag_config.similarity_threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Similarity Threshold: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([value]) => field.onChange(value)}
                          min={0}
                          max={1}
                          step={0.05}
                        />
                      </FormControl>
                      <FormDescription>
                        Minimum similarity score for retrieved documents
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="rag_config.hybrid_search"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <Label>Hybrid Search</Label>
                          <p className="text-sm text-muted-foreground">
                            Combine semantic and keyword search
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

                  <FormField
                    control={form.control}
                    name="rag_config.rerank"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <Label>Reranking</Label>
                          <p className="text-sm text-muted-foreground">
                            Use AI to rerank search results
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
                </div>
              </TabsContent>

              {/* Execution Config Tab */}
              <TabsContent value="execution" className="space-y-4 mt-6">
                <FormField
                  control={form.control}
                  name="execution_config.history_enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <Label>Conversation History</Label>
                        <p className="text-sm text-muted-foreground">
                          Remember previous messages in the conversation
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

                {form.watch('execution_config.history_enabled') && (
                  <FormField
                    control={form.control}
                    name="execution_config.history_window"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>History Window: {field.value} messages</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={([value]) => field.onChange(value)}
                            min={1}
                            max={50}
                            step={1}
                          />
                        </FormControl>
                        <FormDescription>
                          Number of previous messages to include
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="execution_config.max_iterations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Iterations: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([value]) => field.onChange(value)}
                          min={1}
                          max={20}
                          step={1}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum number of tool calls per message
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="execution_config.timeout_seconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeout: {field.value}s</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={([value]) => field.onChange(value)}
                          min={10}
                          max={300}
                          step={10}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum execution time per request
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-6">
              <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}