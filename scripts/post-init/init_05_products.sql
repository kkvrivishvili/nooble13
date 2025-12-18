-- Nooble8 Products Schema
-- Version: 5.0 - Snake Case
-- Description: Products and services management with snake_case convention

-- Step 1: Create products table
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price decimal(10, 2),
  currency text DEFAULT 'USD',
  link text, -- External link for the product
  images jsonb DEFAULT '[]'::jsonb, -- Array of image URLs
  category text,
  stock_quantity integer, -- NULL for services
  is_service boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT positive_price CHECK (price >= 0),
  CONSTRAINT positive_stock CHECK (stock_quantity >= 0 OR stock_quantity IS NULL)
);

-- Step 2: Create indexes
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_is_service ON public.products(is_service);
CREATE INDEX idx_products_is_active ON public.products(is_active) WHERE is_active = true;

-- Step 3: Create gallery view for widgets
CREATE OR REPLACE VIEW products_gallery AS
SELECT 
  p.id,
  p.tenant_id,
  p.name,
  p.description,
  p.price,
  p.currency,
  p.link,
  p.images,
  p.category,
  p.is_service,
  CASE 
    WHEN p.stock_quantity > 0 THEN 'in_stock'
    WHEN p.stock_quantity = 0 THEN 'out_of_stock'
    WHEN p.is_service THEN 'available'
    ELSE 'unavailable'
  END as availability
FROM products p
WHERE p.is_active = true;

-- Step 4: Add trigger
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();