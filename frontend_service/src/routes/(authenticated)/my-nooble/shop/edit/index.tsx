import { createFileRoute } from '@tanstack/react-router'
import ShopEditPage from '@/features/my-nooble/shop/edit'

export const Route = createFileRoute('/(authenticated)/my-nooble/shop/edit/')({
  component: ShopEditPage,
})
