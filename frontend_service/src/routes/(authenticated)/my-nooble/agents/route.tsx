import { createFileRoute, Outlet } from '@tanstack/react-router'
import AgentsPage from '@/features/my-nooble/agents'

export const Route = createFileRoute('/(authenticated)/my-nooble/agents')({
  component: () => (
    <>
      <AgentsPage />
      <Outlet />
    </>
  ),
})
