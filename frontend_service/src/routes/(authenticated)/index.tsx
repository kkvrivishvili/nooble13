import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/(authenticated)/')({
  component: () => <Navigate to="/my-nooble/profile" replace />,
})