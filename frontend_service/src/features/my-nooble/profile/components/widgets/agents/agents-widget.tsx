// src/features/my-nooble/profile/components/widgets/agents/agents-widget.tsx
import { useState } from 'react';
import { IconUsers, IconMessage, IconSend, IconX } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { AgentsWidgetData, WidgetComponentProps } from '@/types/widget';
import { useProfile } from '@/context/profile-context';
import { Agent } from '@/types/profile';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatState {
  agent_id: string;
  messages: Message[];
  is_loading: boolean;
}

export function AgentsWidget({
  widget,
  data,
  is_editing,
  onEdit,
  onDelete,
}: WidgetComponentProps<AgentsWidgetData>) {
  const { profile } = useProfile();
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [chatStates, setChatStates] = useState<Record<string, ChatState>>({});
  const [inputValue, setInputValue] = useState('');
  
  // Get agent details from profile
  const agents = profile?.agentDetails.filter(
    agent => data.agent_ids.includes(agent.id) && agent.is_active
  ) || [];

  const handleAgentClick = (agent: Agent) => {
    if (!is_editing) {
      if (expandedAgentId === agent.id) {
        setExpandedAgentId(null);
      } else {
        setExpandedAgentId(agent.id);
        // Initialize chat state if not exists
        if (!chatStates[agent.id]) {
          setChatStates(prev => ({
            ...prev,
            [agent.id]: {
              agent_id: agent.id,
              messages: [{
                id: `welcome-${Date.now()}`,
                role: 'assistant',
                content: `¡Hola! Soy ${agent.name}. ${agent.description || '¿En qué puedo ayudarte hoy?'}`,
                timestamp: new Date()
              }],
              is_loading: false
            }
          }));
        }
      }
    }
  };

  const handleSendMessage = async (agentId: string) => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    // Add user message
    setChatStates(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        messages: [...prev[agentId].messages, userMessage],
        is_loading: true
      }
    }));

    setInputValue('');

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Gracias por tu mensaje. Esta es una respuesta de demostración. En producción, aquí se mostraría la respuesta real del agente.`,
        timestamp: new Date()
      };

      setChatStates(prev => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          messages: [...prev[agentId].messages, assistantMessage],
          is_loading: false
        }
      }));
    }, 1000);
  };

  const renderAgentCard = (agent: Agent) => {
    const isExpanded = expandedAgentId === agent.id;
    const chatState = chatStates[agent.id];

    return (
      <div key={agent.id} className="space-y-3">
        <div
          className={cn(
            "p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg transition-all cursor-pointer",
            isExpanded ? "ring-2 ring-primary" : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
          )}
          onClick={() => handleAgentClick(agent)}
        >
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback>{agent.icon}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {agent.name}
              </h4>
              {agent.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {agent.description}
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" className="flex-shrink-0">
              {isExpanded ? <IconX size={16} /> : <IconMessage size={16} />}
            </Button>
          </div>
        </div>

        {/* Inline Chat */}
        {isExpanded && chatState && (
          <div className="ml-4 mr-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <ScrollArea className="h-64 pr-4">
              <div className="space-y-3">
                {chatState.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">{agent.icon}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg px-3 py-2",
                        message.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      )}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString('es', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                {chatState.is_loading && (
                  <div className="flex gap-2">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs">{agent.icon}</AvatarFallback>
                    </Avatar>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* Input area */}
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Escribe tu mensaje..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(agent.id);
                  }
                }}
                disabled={chatState.is_loading}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => handleSendMessage(agent.id)}
                disabled={!inputValue.trim() || chatState.is_loading}
              >
                <IconSend size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAgentList = (agent: Agent) => {
    const isExpanded = expandedAgentId === agent.id;
    
    return (
      <div key={agent.id} className="space-y-2">
        <div
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
            isExpanded ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
          )}
          onClick={() => handleAgentClick(agent)}
        >
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs">{agent.icon}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {agent.name}
            </p>
          </div>
          {isExpanded ? (
            <IconX size={16} className="text-gray-400" />
          ) : (
            <IconMessage size={16} className="text-gray-400" />
          )}
        </div>
        
        {/* Inline chat for list view */}
        {isExpanded && chatStates[agent.id] && (
          <div className="ml-3 mr-3">
            {/* Same chat component as card view */}
            <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              {/* ... same chat content as above ... */}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAgentBubble = (agent: Agent) => (
    <button
      key={agent.id}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all",
        expandedAgentId === agent.id
          ? "bg-primary text-primary-foreground"
          : "bg-primary/10 hover:bg-primary/20 text-primary"
      )}
      onClick={() => handleAgentClick(agent)}
    >
      <span className="text-lg">{agent.icon}</span>
      <span className="font-medium text-sm">{agent.name}</span>
    </button>
  );

  return (
    <SortableWidget widget={widget} isDraggingDisabled={is_editing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconUsers size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">{data.title}</h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={is_editing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Agents display */}
      {agents.length > 0 ? (
        <>
          <div className={cn(
            "p-4 pt-3",
            data.display_style === 'bubble' && "flex flex-wrap gap-2"
          )}>
            {data.display_style === 'card' && (
              <div className="space-y-3">
                {agents.map(renderAgentCard)}
              </div>
            )}
            
            {data.display_style === 'list' && (
              <div className="space-y-2">
                {agents.map(renderAgentList)}
              </div>
            )}
            
            {data.display_style === 'bubble' && agents.map(renderAgentBubble)}
          </div>
          
          {/* Bubble view expanded chat */}
          {data.display_style === 'bubble' && expandedAgentId && chatStates[expandedAgentId] && (
            <div className="p-4 pt-0">
              <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                {/* Same chat component */}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-4 pt-3 text-center text-sm text-gray-500 dark:text-gray-400">
          No hay agentes configurados
        </div>
      )}
    </SortableWidget>
  );
}