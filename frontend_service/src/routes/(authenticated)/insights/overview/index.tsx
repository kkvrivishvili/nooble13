import { createFileRoute } from '@tanstack/react-router'
import InsightsOverview from '@/features/insights/overview'

export const Route = createFileRoute('/(authenticated)/insights/overview/')({
  component: InsightsOverview,
})