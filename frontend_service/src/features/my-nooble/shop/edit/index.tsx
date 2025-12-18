import { useEffect, useCallback } from 'react';
import { useLocation } from '@tanstack/react-router';
import { usePageContext } from '@/context/page-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ShopEditPage() {
  const { setSubPages } = usePageContext();
  const location = useLocation();
  
  const updateSubPages = useCallback(() => {
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
  }, [location.pathname, setSubPages]);

  useEffect(() => {
    updateSubPages();

    return () => {
      setSubPages([]);
    };
  }, [updateSubPages, setSubPages]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Edit Shop</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Edit your shop settings and configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}