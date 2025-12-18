import { createFileRoute } from '@tanstack/react-router'
import InsightsConversationFlow from '@/features/insights/conversation-flow'

export const Route = createFileRoute('/(authenticated)/insights/conversation-flow/')({
  component: InsightsConversationFlow,
})