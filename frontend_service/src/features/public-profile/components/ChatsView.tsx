import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useProfileTheme } from '@/context/profile-theme-context'
import { Agent, ProfileWithAgents } from '@/types/profile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import MarkdownRenderer from './MarkdownRenderer'

interface ChatsViewProps {
  profile: ProfileWithAgents
  currentAgentId?: string
  onAgentChange?: (agentId: string) => void
  messagesByAgent: Record<string, ChatMessage[]>
  onSendMessage?: (message: string, agentId?: string) => void
  thinking?: boolean
  connection?: 'connecting' | 'open' | 'closed' | 'error'
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export default function ChatsView({ profile, currentAgentId, onAgentChange, messagesByAgent, onSendMessage, thinking, connection }: ChatsViewProps) {
  const { theme, layout } = useProfileTheme()
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(currentAgentId)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedAgentId && profile?.agentDetails?.length) {
      setSelectedAgentId(profile.agentDetails[0].id)
    }
  }, [profile?.agentDetails, selectedAgentId])

  useEffect(() => {
    if (currentAgentId) {
      setSelectedAgentId(currentAgentId)
    }
  }, [currentAgentId])

  const selectedAgent: Agent | undefined = useMemo(
    () => profile?.agentDetails?.find(a => a.id === selectedAgentId),
    [profile?.agentDetails, selectedAgentId]
  )

  // No seed de mensajes: se mostrarán sugerencias hasta que el usuario envíe el primero

  useEffect(() => {
    // Auto scroll al fondo cuando cambian mensajes
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesByAgent, selectedAgentId])

  const getBubbleStyles = (role: ChatMessage['role']) => ({
    backgroundColor:
      role === 'user'
        ? theme.primary_color
        : `${theme.primary_color || '#000'}10`,
    color: role === 'user' ? (theme.button_text_color || '#fff') : (theme.text_color || '#111827'),
    borderRadius:
      theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '1.25rem',
    border: role === 'assistant' ? `1px solid ${theme.primary_color || '#e5e7eb'}` : 'none',
  })

  const getAgentSuggestions = (agent: Agent): string[] => {
    return [
      `¿Qué puedes hacer por mí, ${agent.name}?`,
      'Dame un ejemplo de cómo trabajas',
      'Ayúdame con una tarea concreta',
    ]
  }

  const startConversation = (agent: Agent, prompt: string) => {
    setSelectedAgentId(agent.id)
    onAgentChange?.(agent.id)
    onSendMessage?.(prompt, agent.id)
  }

  return (
    <div
      className={cn(
        'w-full mx-auto px-4 pb-28',
        layout.content_width === 'narrow' && 'max-w-md',
        layout.content_width === 'normal' && 'max-w-xl',
        layout.content_width === 'wide' && 'max-w-3xl'
      )}
    >
      {/* Estado de conexión */}
      {connection && connection !== 'open' && (
        <div className="mt-2 text-center text-xs">
          {connection === 'connecting' && <span>Conectando…</span>}
          {connection === 'error' && <span className="text-red-600">Error de conexión</span>}
          {connection === 'closed' && <span className="text-gray-500">Desconectado</span>}
        </div>
      )}
      {/* Sugerencias iniciales por agente (se ocultan al primer mensaje) */}
      {(!selectedAgentId || (messagesByAgent[selectedAgentId]?.length ?? 0) === 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {profile.agentDetails?.map(agent => (
            <div
              key={agent.id}
              className="rounded-xl border bg-white/90 backdrop-blur p-3 shadow-sm"
              style={{
                borderColor: `${theme.primary_color}33`,
                borderRadius: theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '1.25rem',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="h-8 w-8"><AvatarFallback>{agent.name?.[0] || 'A'}</AvatarFallback></Avatar>
                <div className="text-sm font-medium" style={{ color: theme.text_color }}>{agent.name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {getAgentSuggestions(agent).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => startConversation(agent, s)}
                    className="px-3 py-2 text-sm border bg-white hover:bg-gray-50 transition-colors"
                    style={{
                      borderColor: `${theme.primary_color}33`,
                      borderRadius: theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '1.25rem',
                      color: theme.text_color,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mensajes */}
      <div className="mt-3 space-y-3 pr-1">
        {(selectedAgentId ? (messagesByAgent[selectedAgentId] || []) : []).map((msg: ChatMessage) => (
          <div key={msg.id} className={cn('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <Avatar className="h-6 w-6">
                <AvatarFallback>{selectedAgent?.name?.[0] || 'A'}</AvatarFallback>
              </Avatar>
            )}
            <div className="max-w-[75%] px-3 py-2 text-sm" style={getBubbleStyles(msg.role)}>
              {msg.role === 'assistant' ? (
                <MarkdownRenderer 
                  content={msg.content} 
                  textColor={theme.text_color || '#111827'}
                />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {/* Indicador de "pensando" */}
        {thinking && (
          <div className="flex items-start gap-2 justify-start">
            <Avatar className="h-6 w-6">
              <AvatarFallback>{selectedAgent?.name?.[0] || 'A'}</AvatarFallback>
            </Avatar>
            <div className="max-w-[75%] px-3 py-2 text-sm border" style={{
              backgroundColor: `${theme.primary_color || '#000'}10`,
              borderColor: `${theme.primary_color || '#e5e7eb'}`,
              borderRadius: theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '1.25rem',
              color: theme.text_color || '#111827',
            }}>
              <span>Pensando</span>
              <span className="inline-block ml-1 animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
              <span className="inline-block ml-0.5 animate-bounce" style={{ animationDelay: '100ms' }}>.</span>
              <span className="inline-block ml-0.5 animate-bounce" style={{ animationDelay: '200ms' }}>.</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

    </div>
  )
}
