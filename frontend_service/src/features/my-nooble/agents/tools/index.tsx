import { useEffect, useCallback } from 'react';
import { useLocation } from '@tanstack/react-router';
import { usePageContext } from '@/context/page-context';
import { ToolsManagement } from './components/tools-management';

export default function AgentsToolsPage() {
  const { setSubPages } = usePageContext();
  const location = useLocation();

  const updateSubPages = useCallback(() => {
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
  }, [location.pathname, setSubPages]);

  useEffect(() => {
    updateSubPages();
    return () => {
      setSubPages([]);
    };
  }, [updateSubPages, setSubPages]);

  return <ToolsManagement />;
}