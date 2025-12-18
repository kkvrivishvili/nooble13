import { createFileRoute } from '@tanstack/react-router'
import ShopPage from '@/features/my-nooble/shop'

export const Route = createFileRoute('/(authenticated)/my-nooble/shop/')({
  component: ShopPage,
})
