import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '@/features/my-nooble/profile'

export const Route = createFileRoute('/(authenticated)/my-nooble/profile/')({
  component: ProfilePage,
})
