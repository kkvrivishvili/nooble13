import { createFileRoute, Outlet } from '@tanstack/react-router'
import Insights from '@/features/insights'

export const Route = createFileRoute('/(authenticated)/insights')({
  component: () => (
    <>
      <Insights /> {/* Configura título y sub-páginas */}
      <Outlet />    {/* Renderiza la sub-página actual */}
    </>
  ),
})