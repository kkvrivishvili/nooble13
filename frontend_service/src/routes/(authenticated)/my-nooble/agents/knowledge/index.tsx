import { createFileRoute } from '@tanstack/react-router'
import AgentsKnowledgePage from '@/features/my-nooble/agents/knowledge'

export const Route = createFileRoute('/(authenticated)/my-nooble/agents/knowledge/')({
  component: AgentsKnowledgePage,
})
