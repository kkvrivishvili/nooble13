import { createFileRoute } from '@tanstack/react-router'
import AgentsToolsPage from '@/features/my-nooble/agents/tools'

export const Route = createFileRoute('/(authenticated)/my-nooble/agents/tools/')({
  component: AgentsToolsPage,
})
