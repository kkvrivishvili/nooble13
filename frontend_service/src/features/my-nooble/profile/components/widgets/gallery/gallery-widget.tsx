// src/features/my-nooble/profile/components/widgets/gallery/gallery-widget.tsx
import { IconPhoto, IconShoppingCart, IconExternalLink } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { GalleryWidgetData, WidgetComponentProps } from '@/types/widget';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Product type that matches database schema
interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  link: string | null;
  images: string[];
  category: string | null;
  isService: boolean;
}

export function GalleryWidget({
  widget,
  data,
  isEditing,
  onEdit,
  onDelete,
}: WidgetComponentProps<GalleryWidgetData>) {
  // TODO: Get actual products from profile or database
  // For now, create placeholder products based on selected IDs
  const products: Product[] = data.products.map((id, index) => ({
    id,
    name: `Producto ${index + 1}`,
    description: 'Descripción del producto pendiente',
    price: 0,
    currency: 'USD',
    link: null,
    images: ['https://via.placeholder.com/300x300'],
    category: null,
    isService: false
  }));

  const handleProductClick = (product: Product) => {
    if (!isEditing && product.link) {
      window.open(product.link, '_blank', 'noopener,noreferrer');
    }
  };

  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null) return 'Consultar precio';
    
    const formatter = new Intl.NumberFormat('es', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    
    return formatter.format(price);
  };

  return (
    <SortableWidget widget={widget} isDraggingDisabled={isEditing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconPhoto size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">
            {data.title || 'Galería de productos'}
          </h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={isEditing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* Gallery grid */}
      {products.length > 0 ? (
        <div className="p-4 pt-3">
          <div className={cn(
            "grid gap-4",
            columnClasses[data.columns as keyof typeof columnClasses]
          )}>
            {products.map(product => (
              <div
                key={product.id}
                className={cn(
                  "group",
                  product.link && "cursor-pointer"
                )}
                onClick={() => handleProductClick(product)}
              >
                {/* Image container */}
                <div className="aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 relative">
                  <img
                    src={product.images[0] || 'https://via.placeholder.com/300x300'}
                    alt={product.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  
                  {/* Overlay on hover */}
                  {product.link && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                      <IconExternalLink 
                        size={24} 
                        className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                      />
                    </div>
                  )}
                  
                  {/* Service badge */}
                  {product.isService && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                      Servicio
                    </div>
                  )}
                </div>
                
                {/* Product info */}
                <div className="mt-3 space-y-1">
                  <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-primary transition-colors">
                    {product.name}
                  </h4>
                  
                  {data.showDescription && product.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                  
                  {data.showPrice && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatPrice(product.price, product.currency)}
                      </p>
                      
                      {product.link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProductClick(product);
                          }}
                        >
                          <IconShoppingCart size={14} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Note about pending implementation */}
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Nota:</strong> La galería mostrará productos reales cuando se implemente el sistema de productos.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 pt-3 text-center">
          <div className="py-8">
            <IconPhoto size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay productos seleccionados
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Selecciona productos en el editor para mostrarlos aquí
            </p>
          </div>
        </div>
      )}
    </SortableWidget>
  );
}