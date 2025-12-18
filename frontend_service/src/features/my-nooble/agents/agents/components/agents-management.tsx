// src/features/my-nooble/agents/agents/components/agents-management.tsx
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  IconPlus, 
  IconSearch, 
  IconDotsVertical,
  IconEdit,
  IconCopy,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconMessage,
  IconSettings
} from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents-api';
import { Agent } from '@/types/profile';
import { toast } from 'sonner';
import { CreateAgentDialog } from './create-agent-dialog';
import { EditAgentDialog } from './edit-agent-dialog.tsx';

export function AgentsManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<Agent | null>(null);
  
  const queryClient = useQueryClient();

  // Get user's agents
  const { data: agents = [], isLoading, error } = useQuery({
    queryKey: ['user-agents'],
    queryFn: () => agentsApi.getUserAgents(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Delete agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.deleteAgent(agentId),
    onSuccess: () => {
      toast.success('Agent deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['user-agents'] });
      setDeleteConfirmAgent(null);
    },
    onError: (error) => {
      toast.error('Failed to delete agent: ' + error.message);
    },
  });

  // Toggle visibility mutation
  const toggleVisibilityMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.toggleAgentVisibility(agentId),
    onSuccess: () => {
      toast.success('Agent visibility updated');
      queryClient.invalidateQueries({ queryKey: ['user-agents'] });
    },
    onError: (error) => {
      toast.error('Failed to update visibility: ' + error.message);
    },
  });

  // Duplicate agent mutation
  const duplicateAgentMutation = useMutation({
    mutationFn: ({ agentId, newName }: { agentId: string; newName?: string }) => 
      agentsApi.duplicateAgent(agentId, newName),
    onSuccess: () => {
      toast.success('Agent duplicated successfully');
      queryClient.invalidateQueries({ queryKey: ['user-agents'] });
    },
    onError: (error) => {
      toast.error('Failed to duplicate agent: ' + error.message);
    },
  });

  // Filter agents based on search
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsEditDialogOpen(true);
  };

  const handleDuplicateAgent = (agent: Agent) => {
    duplicateAgentMutation.mutate({ 
      agentId: agent.id, 
      newName: `${agent.name} (Copy)` 
    });
  };

  const handleToggleVisibility = (agent: Agent) => {
    toggleVisibilityMutation.mutate(agent.id);
  };

  const handleDeleteAgent = (agent: Agent) => {
    setDeleteConfirmAgent(agent);
  };

  const confirmDelete = () => {
    if (deleteConfirmAgent) {
      deleteAgentMutation.mutate(deleteConfirmAgent.id);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-red-600">
            Error loading agents: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">My Agents</h2>
          <p className="text-muted-foreground">
            Create and manage your AI agents
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <IconPlus size={16} className="mr-2" />
          Create Agent
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
        <Input
          placeholder="Search agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-muted rounded-full"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold mb-2">No agents found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No agents match your search criteria.' : 'Create your first agent to get started.'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <IconPlus size={16} className="mr-2" />
                  Create Your First Agent
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Agent Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="text-lg">
                          {agent.icon}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{agent.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={agent.is_public ? "default" : "secondary"} className="text-xs">
                            {agent.is_public ? (
                              <>
                                <IconEye size={10} className="mr-1" />
                                Public
                              </>
                            ) : (
                              <>
                                <IconEyeOff size={10} className="mr-1" />
                                Private
                              </>
                            )}
                          </Badge>
                          {!agent.is_active && (
                            <Badge variant="outline" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <IconDotsVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditAgent(agent)}>
                          <IconEdit size={16} className="mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateAgent(agent)}>
                          <IconCopy size={16} className="mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleVisibility(agent)}>
                          {agent.is_public ? (
                            <>
                              <IconEyeOff size={16} className="mr-2" />
                              Make Private
                            </>
                          ) : (
                            <>
                              <IconEye size={16} className="mr-2" />
                              Make Public
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-600"
                          onClick={() => handleDeleteAgent(agent)}
                        >
                          <IconTrash size={16} className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Agent Description */}
                  {agent.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {agent.description}
                    </p>
                  )}

                  {/* Agent Stats */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Created {new Date(agent.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1">
                      <IconMessage size={12} />
                      <span>0 chats</span> {/* TODO: Get real stats */}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      <IconMessage size={14} className="mr-1" />
                      Test Chat
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditAgent(agent)}
                    >
                      <IconSettings size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['user-agents'] });
          setIsCreateDialogOpen(false);
        }}
      />

      {/* Edit Agent Dialog */}
      {selectedAgent && (
        <EditAgentDialog
          agent={selectedAgent}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['user-agents'] });
            setIsEditDialogOpen(false);
            setSelectedAgent(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmAgent} onOpenChange={() => setDeleteConfirmAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmAgent?.name}"? 
              This action cannot be undone and will also delete all conversations with this agent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}