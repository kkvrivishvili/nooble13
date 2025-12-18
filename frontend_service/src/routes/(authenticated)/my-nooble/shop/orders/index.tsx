import { createFileRoute } from '@tanstack/react-router'
import OrdersPage from '@/features/my-nooble/shop/orders'

export const Route = createFileRoute('/(authenticated)/my-nooble/shop/orders/')({
  component: OrdersPage,
})
