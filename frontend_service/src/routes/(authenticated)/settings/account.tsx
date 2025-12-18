import { createFileRoute } from '@tanstack/react-router'
import SettingsAccount from '@/features/settings/account'

export const Route = createFileRoute('/(authenticated)/settings/account')({
  component: SettingsAccount,
})
