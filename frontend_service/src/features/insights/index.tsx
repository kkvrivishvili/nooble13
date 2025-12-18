import { useEffect } from 'react'
import { useLocation, Navigate } from '@tanstack/react-router'
import { usePageContext } from '@/context/page-context'

export default function Insights() {
  const { setTitle, setSubPages } = usePageContext()
  const location = useLocation()
  
  useEffect(() => {
    // Establecer título principal
    setTitle('Insights')
    
    // Configurar sub-páginas
    const currentPath = location.pathname
    
    const subPages = [
      {
        title: 'Overview',
        href: '/insights/overview',
        isActive: currentPath === '/insights/overview'
      },
      {
        title: 'Profile Analytics', 
        href: '/insights/profile-analytics',
        isActive: currentPath === '/insights/profile-analytics',
        disabled:  false 
      },
      {
        title: 'Conversation Flow',
        href: '/insights/conversation-flow', 
        isActive: currentPath === '/insights/conversation-flow',
        disabled: false
      },
    ]
    
    setSubPages(subPages)
    
    // Cleanup: limpiar sub-páginas cuando se desmonte
    return () => {
      setSubPages([])
    }
  }, [setTitle, setSubPages, location.pathname])
  
  // Redirigir a overview por defecto si estamos en /dashboard
  if (location.pathname === '/insights') {
    return <Navigate to="/insights/overview" replace />
  }
  
  // Renderizar contenido de la sub-página actual
  return null // El Outlet del layout manejará la sub-página
}