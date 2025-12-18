import { createFileRoute } from '@tanstack/react-router'
import AgentsAgentsPage from '@/features/my-nooble/agents/agents'

export const Route = createFileRoute('/(authenticated)/my-nooble/agents/agents/')({
  component: AgentsAgentsPage,
})
