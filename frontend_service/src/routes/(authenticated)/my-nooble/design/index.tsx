import { createFileRoute } from '@tanstack/react-router'
import DesignPage from '@/features/my-nooble/design'

export const Route = createFileRoute('/(authenticated)/my-nooble/design/')({
  component: DesignPage,
})
