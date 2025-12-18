// src/features/public-profile/widgets/public-gallery-widget.tsx - Refactored with BaseWidget utilities
import { useState } from 'react';
import { IconPhoto, IconExternalLink, IconShoppingBag, IconTag, IconX } from '@tabler/icons-react';
import { PublicWidgetProps } from './types';
import BaseWidget from './BaseWidget';
import { getBorderRadius, getShadowStyle, getFontFamily } from '@/features/public-profile/utils/theme-styles';

interface PublicGalleryWidgetProps extends PublicWidgetProps {
  data: {
    title?: string;
    products: string[]; // Product IDs from database
    show_price: boolean;
    show_description: boolean;
    columns: number;
  };
  // Products data would come from profile.products or a separate query
  productsData?: Array<{
    id: string;
    name: string;
    description?: string;
    price?: number;
    currency: string;
    link?: string;
    images: string[];
    isService: boolean;
    category?: string;
  }>;
}

export function PublicGalleryWidget({ data, productsData = [], theme, className }: PublicGalleryWidgetProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Filter products based on configured IDs
  const products = productsData.filter(product => data.products.includes(product.id));
  
  const formatPrice = (price?: number, currency: string = 'USD') => {
    if (!price) return 'Consultar precio';
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const handleProductClick = (product: typeof products[0]) => {
    if (product.link) {
      window.open(product.link, '_blank', 'noopener,noreferrer');
    } else if (product.images.length > 0) {
      setSelectedImage(product.images[0]);
    }
  };

  const getColumnClass = () => {
    const columnClasses = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    };
    return columnClasses[data.columns as keyof typeof columnClasses] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  };

  const cardStyles = {
    borderRadius: theme ? getBorderRadius(theme) : '1rem',
    overflow: 'hidden',
    boxShadow: theme ? getShadowStyle(theme) : 'none',
    fontFamily: theme ? getFontFamily(theme.font_family) : 'sans-serif',
    backgroundColor: theme?.button_fill === 'glass'
      ? 'rgba(255, 255, 255, 0.1)'
      : theme?.background_color || '#ffffff',
    backdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
    WebkitBackdropFilter: theme?.button_fill === 'glass' ? 'blur(10px)' : 'none',
  };

  if (products.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <IconPhoto size={48} className="mx-auto mb-3 opacity-30" />
        <BaseWidget.Text theme={theme} variant="primary" style={{ opacity: 0.6 }}>
          No hay productos para mostrar
        </BaseWidget.Text>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Title */}
      {data.title && (
        <BaseWidget.Text
          theme={theme}
          variant="primary"
          className="font-semibold mb-4 text-lg"
          as="h3"
        >
          {data.title}
        </BaseWidget.Text>
      )}

      {/* Products grid */}
      <div className={`grid gap-4 ${getColumnClass()}`}>
        {products.map(product => (
          <div
            key={product.id}
            className={`group cursor-pointer ${product.link ? 'hover:scale-105' : ''} transition-transform`}
            onClick={() => handleProductClick(product)}
            style={cardStyles}
          >
            {/* Product image */}
            <div className="aspect-square overflow-hidden bg-gray-100 relative">
              {product.images.length > 0 ? (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <IconPhoto 
                    size={48} 
                    style={{ color: theme?.primary_color, opacity: 0.3 }}
                  />
                </div>
              )}
              
              {/* Service/Product badge */}
              {product.isService && (
                <div 
                  className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: theme?.primary_color || '#3b82f6',
                    color: theme?.button_text_color || '#ffffff',
                    borderRadius: theme ? getBorderRadius(theme) : '9999px',
                  }}
                >
                  Servicio
                </div>
              )}
              
              {/* Link indicator */}
              {product.link && (
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                  <div 
                    className="p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      backgroundColor: theme?.button_fill === 'glass'
                        ? 'rgba(255, 255, 255, 0.9)'
                        : 'rgba(255, 255, 255, 0.9)',
                    }}
                  >
                    <IconExternalLink size={20} style={{ color: theme?.primary_color }} />
                  </div>
                </div>
              )}
            </div>
            
            {/* Product info */}
            <div className="p-3 space-y-1">
              <div className="flex items-start justify-between">
                <BaseWidget.Text
                  theme={theme}
                  variant="primary"
                  className="font-medium text-sm line-clamp-2 flex-1"
                  as="h4"
                >
                  {product.name}
                </BaseWidget.Text>
                {product.isService ? (
                  <IconTag 
                    size={16} 
                    className="ml-2 flex-shrink-0" 
                    style={{ color: theme?.primary_color, opacity: 0.6 }}
                  />
                ) : (
                  <IconShoppingBag 
                    size={16} 
                    className="ml-2 flex-shrink-0" 
                    style={{ color: theme?.primary_color, opacity: 0.6 }}
                  />
                )}
              </div>
              
              {/* Description */}
              {data.show_description && product.description && (
                <BaseWidget.Text
                  theme={theme}
                  variant="primary"
                  className="text-xs line-clamp-2"
                  style={{ opacity: 0.7 }}
                >
                  {product.description}
                </BaseWidget.Text>
              )}
              
              {/* Price */}
              {data.show_price && (
                <div className="flex items-center justify-between">
                  <BaseWidget.Text
                    theme={theme}
                    variant="primary"
                    className="font-semibold text-sm"
                  >
                    {formatPrice(product.price, product.currency)}
                  </BaseWidget.Text>
                  {product.category && (
                    <span 
                      className="text-xs px-2 py-1 rounded"
                      style={{ 
                        backgroundColor: `${theme?.primary_color}10`,
                        color: theme?.primary_color,
                        borderRadius: theme ? getBorderRadius(theme) : '9999px',
                      }}
                    >
                      {product.category}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox for images */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={selectedImage}
              alt="Imagen ampliada"
              className="max-w-full max-h-full object-contain"
              style={{
                borderRadius: theme ? getBorderRadius(theme) : '1rem',
              }}
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full transition-all hover:scale-110"
              style={{
                backgroundColor: theme?.button_fill === 'glass'
                  ? 'rgba(255, 255, 255, 0.2)'
                  : 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <IconX size={20} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}