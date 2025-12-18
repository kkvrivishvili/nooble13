import { createFileRoute } from '@tanstack/react-router'
import InsightsProfileAnalytics from '@/features/insights/profile-analytics'

export const Route = createFileRoute('/(authenticated)/insights/profile-analytics/')({
  component: InsightsProfileAnalytics,
})