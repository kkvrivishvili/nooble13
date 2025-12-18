import { useState } from 'react'
import { useProfileTheme } from '@/context/profile-theme-context'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconSend } from '@tabler/icons-react'

interface ChatInputProps {
  onSendMessage: (message: string) => void
}

export default function ChatInput({ onSendMessage }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const { theme } = useProfileTheme()

  const borderRadius = theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '9999px'
  const gradientBase = theme.background_color || '#f9fafb'
  const textColor = theme.text_color || '#111827'

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="w-full" style={{ background: `linear-gradient(to top, ${gradientBase}33, transparent)` }}>
      <div className="px-4 pb-4 pt-8">
        <div className="max-w-xl mx-auto">
          <div
            className="flex gap-2 items-center shadow-xl border px-2 py-1"
            style={{
              backgroundColor: '#fff',
              borderColor: `${theme.primary_color}33`,
              borderRadius,
            }}
          >
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe para comenzar una conversación..."
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent px-4 py-3"
              style={{ color: textColor, fontFamily: 'inherit' }}
            />
            <Button
              onClick={handleSend}
              size="icon"
              className="h-10 w-10 shrink-0"
              style={{ backgroundColor: theme.primary_color, color: theme.button_text_color, borderRadius }}
            >
              <IconSend size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}