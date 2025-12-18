import { createFileRoute } from '@tanstack/react-router'
import Conversations from '@/features/conversations/index'

export const Route = createFileRoute('/(authenticated)/conversations')({
  component: Conversations,
})
