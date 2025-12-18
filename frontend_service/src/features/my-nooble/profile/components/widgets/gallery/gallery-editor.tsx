// src/features/my-nooble/profile/components/widgets/gallery/gallery-editor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { IconPhoto, IconAlertCircle, IconCheck, IconPlus } from '@tabler/icons-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { WidgetEditor } from '../common/widget-editor';
import { GalleryWidgetData, WidgetEditorProps } from '@/types/widget';
import { validateGalleryData } from './gallery-config';
import { cn } from '@/lib/utils';

// Product type matching database schema
interface Product {
  id: string;
  name: string;
  price: number | null;
  imageUrl: string;
  isService: boolean;
}

export function GalleryEditor({
  data: initialData,
  onSave,
  onCancel,
  is_loading = false,
}: WidgetEditorProps<GalleryWidgetData>) {
  const [formData, setFormData] = useState<GalleryWidgetData>({
    title: initialData?.title || '',
    products: initialData?.products || [],
    show_price: initialData?.show_price ?? true,
    show_description: initialData?.show_description ?? true,
    columns: initialData?.columns || 3,
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [is_saving, setIsSaving] = useState(false);

  // TODO: Replace with actual products from database
  const availableProducts: Product[] = [];
  const hasNoProducts = availableProducts.length === 0;

  const handleSave = async () => {
    const validation = validateGalleryData(formData);
    
    if (!validation.is_valid) {
      setErrors(validation.errors);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      setErrors({ 
        general: error instanceof Error ? error.message : 'Error al guardar la galería' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProduct = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.includes(productId)
        ? prev.products.filter(id => id !== productId)
        : [...prev.products, productId]
    }));
    
    // Clear products error
    if (errors.products) {
      const newErrors = { ...errors };
      delete newErrors.products;
      setErrors(newErrors);
    }
  };

  return (
    <WidgetEditor
      title={initialData ? 'Editar galería' : 'Nueva galería'}
      icon={IconPhoto}
      onSave={handleSave}
      onCancel={onCancel}
      is_loading={is_loading}
      is_saving={is_saving}
      error={errors.general}
    >
      {/* Title input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Título (opcional)
        </label>
        <Input
          placeholder="Ej: Nuestros productos destacados"
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value });
            if (errors.title) {
              const newErrors = { ...errors };
              delete newErrors.title;
              setErrors(newErrors);
            }
          }}
          className={errors.title ? 'border-red-300' : ''}
          disabled={is_saving || is_loading}
          maxLength={100}
        />
        {errors.title && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <IconAlertCircle size={12} />
            {errors.title}
          </p>
        )}
      </div>

      {/* Product selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Selecciona productos *
        </label>
        
        {hasNoProducts ? (
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
            <IconPhoto size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
              No hay productos disponibles
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Primero necesitas crear productos para poder mostrarlos en la galería
            </p>
            <Button variant="outline" size="sm" disabled>
              <IconPlus size={16} className="mr-2" />
              Ir a productos (próximamente)
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-lg p-2">
              {availableProducts.map(product => (
                <div
                  key={product.id}
                  className={cn(
                    "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                    formData.products.includes(product.id)
                      ? "border-primary"
                      : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                  onClick={() => toggleProduct(product.id)}
                >
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-24 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-xs text-white font-medium truncate">
                      {product.name}
                    </p>
                    {product.price !== null && (
                      <p className="text-xs text-white/80">
                        ${product.price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  {formData.products.includes(product.id) && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <IconCheck size={12} />
                    </div>
                  )}
                  {product.isService && (
                    <div className="absolute top-2 left-2 bg-white/90 text-xs px-1.5 py-0.5 rounded">
                      Servicio
                    </div>
                  )}
                </div>
              ))}
            </div>
            {errors.products && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <IconAlertCircle size={12} />
                {errors.products}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Seleccionados: {formData.products.length} productos
            </p>
          </>
        )}
      </div>

      {/* Display options */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="show-price" className="text-sm font-medium">
            Mostrar precio
          </Label>
          <Switch
            id="show-price"
            checked={formData.show_price}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, show_price: checked })
            }
            disabled={hasNoProducts || is_saving || is_loading}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="show-description" className="text-sm font-medium">
            Mostrar descripción
          </Label>
          <Switch
            id="show-description"
            checked={formData.show_description}
            onCheckedChange={(checked) => 
              setFormData({ ...formData, show_description: checked })
            }
            disabled={hasNoProducts || is_saving || is_loading}
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Columnas: {formData.columns}
          </Label>
          <Slider
            value={[formData.columns]}
            onValueChange={([value]) => 
              setFormData({ ...formData, columns: value })
            }
            min={1}
            max={4}
            step={1}
            className="w-full"
            disabled={hasNoProducts || is_saving || is_loading}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Nota:</strong> El sistema de productos se implementará próximamente. 
          Por ahora, la galería mostrará productos de ejemplo.
        </p>
      </div>
    </WidgetEditor>
  );
}