import { useEffect } from 'react';
import { useLocation, Navigate } from '@tanstack/react-router';
import { usePageContext } from '@/context/page-context';

export default function ShopPage() {
  const { setTitle, setSubPages } = usePageContext();
  const location = useLocation();

  useEffect(() => {
    setTitle('Shop');
    const currentPath = location.pathname;

    const subPages = [
      {
        title: 'Edit',
        href: '/my-nooble/shop/edit',
        isActive: currentPath === '/my-nooble/shop/edit'
      },
      {
        title: 'My Products',
        href: '/my-nooble/shop/my-products',
        isActive: currentPath === '/my-nooble/shop/my-products'
      },
      {
        title: 'Orders',
        href: '/my-nooble/shop/orders',
        isActive: currentPath === '/my-nooble/shop/orders'
      }
    ];

    setSubPages(subPages);

    // Cleanup
    return () => {
      setSubPages([]);
    };
  }, [setTitle, setSubPages, location.pathname]);

    // Redirigir a edit por defecto si estamos en /my-nooble/shop
    if (location.pathname === '/my-nooble/shop' || location.pathname.endsWith('/')) {
      return <Navigate to="/my-nooble/shop/edit" replace />
    }
    
    // Renderizar contenido de la sub-página actual
    return null // El Outlet del layout manejará la sub-página
  }