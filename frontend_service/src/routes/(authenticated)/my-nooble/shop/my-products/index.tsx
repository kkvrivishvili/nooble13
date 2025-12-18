import { createFileRoute } from '@tanstack/react-router'
import MyProductsPage from '@/features/my-nooble/shop/my-products'

export const Route = createFileRoute('/(authenticated)/my-nooble/shop/my-products/')({
  component: MyProductsPage,
})
