import { useEffect } from 'react';
import { useLocation, Navigate } from '@tanstack/react-router';
import { usePageContext } from '@/context/page-context';

export default function AgentsPage() {
  const { setTitle, setSubPages } = usePageContext();
  const location = useLocation();

  useEffect(() => {
    setTitle('Agents');
    const currentPath = location.pathname;

    const subPages = [
      {
        title: 'My Agents',
        href: '/my-nooble/agents/agents',
        isActive: currentPath === '/my-nooble/agents/agents'
      },
      {
        title: 'Knowledge',
        href: '/my-nooble/agents/knowledge',
        isActive: currentPath === '/my-nooble/agents/knowledge'
      },
      {
        title: 'Tools',
        href: '/my-nooble/agents/tools',
        isActive: currentPath === '/my-nooble/agents/tools'
      }
    ];

    setSubPages(subPages);

    // Cleanup
    return () => {
      setSubPages([]);
    };
  }, [setTitle, setSubPages, location.pathname]);

  // Redirigir a Agents por defecto si estamos en /my-nooble/agents
  if (location.pathname === '/my-nooble/agents' || location.pathname === '/my-nooble/agents/') {
    return <Navigate to="/my-nooble/agents/agents" replace />
  }
  
  // Renderizar contenido de la sub-página actual
  return null; // El Outlet del layout manejará la sub-página
}