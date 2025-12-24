-- ============================================
-- Nooble8 Database Schema
-- File: init_06_products.sql
-- Description: Product categories and products
-- Version: 6.0
-- ============================================

-- ============================================
-- PRODUCT CATEGORIES TABLE
-- ============================================

CREATE TABLE public.product_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Unique category name per user
    CONSTRAINT product_categories_unique_name UNIQUE(user_id, name),
    -- Unique slug per user
    CONSTRAINT product_categories_unique_slug UNIQUE(user_id, slug)
);

-- Indexes
CREATE INDEX idx_product_categories_user ON public.product_categories(user_id);
CREATE INDEX idx_product_categories_slug ON public.product_categories(user_id, slug);
CREATE INDEX idx_product_categories_active ON public.product_categories(is_active) WHERE is_active = true;

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_product_categories_updated_at 
    BEFORE UPDATE ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PRODUCTS TABLE
-- ============================================

CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
    
    -- Basic info
    name text NOT NULL,
    description text,
    price decimal(10, 2),
    currency text DEFAULT 'USD',
    link text,  -- External product link
    
    -- Media
    images jsonb DEFAULT '[]'::jsonb,  -- Array of image URLs
    
    -- Inventory
    stock_quantity integer,  -- NULL for services
    is_service boolean DEFAULT false,
    
    -- Variants (for future use)
    variants jsonb DEFAULT '[]'::jsonb,  -- [{name: "Size", options: ["S", "M", "L"]}]
    
    -- Display
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    
    -- Additional data
    metadata jsonb DEFAULT '{}'::jsonb,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT products_positive_price CHECK (price IS NULL OR price >= 0),
    CONSTRAINT products_positive_stock CHECK (stock_quantity IS NULL OR stock_quantity >= 0)
);

-- Indexes
CREATE INDEX idx_products_user ON public.products(user_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE is_active = true;
CREATE INDEX idx_products_user_active ON public.products(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_products_service ON public.products(is_service);
CREATE INDEX idx_products_sort ON public.products(user_id, sort_order);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PRODUCT CATEGORIES RLS POLICIES
-- ============================================

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can view categories of public profiles
CREATE POLICY "Categories of public profiles are viewable"
    ON public.product_categories
    FOR SELECT
    USING (
        user_id IN (SELECT id FROM profiles WHERE is_public = true)
    );

-- Users can view their own categories
CREATE POLICY "Users can view their own categories"
    ON public.product_categories
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can manage their own categories
CREATE POLICY "Users can manage their own categories"
    ON public.product_categories
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to categories"
    ON public.product_categories
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- PRODUCTS RLS POLICIES
-- ============================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone can view active products of public profiles
CREATE POLICY "Active products of public profiles are viewable"
    ON public.products
    FOR SELECT
    USING (
        is_active = true AND
        user_id IN (SELECT id FROM profiles WHERE is_public = true)
    );

-- Users can view their own products
CREATE POLICY "Users can view their own products"
    ON public.products
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can manage their own products
CREATE POLICY "Users can manage their own products"
    ON public.products
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to products"
    ON public.products
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- VIEWS
-- ============================================

-- View: Products gallery (for widgets)
CREATE OR REPLACE VIEW public.products_gallery AS
SELECT 
    p.id,
    p.user_id,
    p.category_id,
    pc.name as category_name,
    p.name,
    p.description,
    p.price,
    p.currency,
    p.link,
    p.images,
    p.is_service,
    p.variants,
    p.sort_order,
    CASE 
        WHEN p.is_service THEN 'available'
        WHEN p.stock_quantity IS NULL THEN 'available'
        WHEN p.stock_quantity > 0 THEN 'in_stock'
        ELSE 'out_of_stock'
    END as availability
FROM public.products p
LEFT JOIN public.product_categories pc ON p.category_id = pc.id
WHERE p.is_active = true;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Generate slug from name
CREATE OR REPLACE FUNCTION generate_slug(p_name text)
RETURNS text AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                trim(p_name),
                '[^a-zA-Z0-9\s-]', '', 'g'
            ),
            '\s+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Count user's products
CREATE OR REPLACE FUNCTION count_user_products(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer 
        FROM products 
        WHERE user_id = p_user_id AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.product_categories TO anon;
GRANT ALL ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT ON public.products_gallery TO anon;
GRANT SELECT ON public.products_gallery TO authenticated;
GRANT SELECT ON public.products_gallery TO service_role;

GRANT EXECUTE ON FUNCTION generate_slug TO authenticated;
GRANT EXECUTE ON FUNCTION generate_slug TO service_role;

GRANT EXECUTE ON FUNCTION count_user_products TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_products TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.product_categories IS 'Product categories for organizing user products';
COMMENT ON TABLE public.products IS 'Products and services that users can display on their profile';
COMMENT ON VIEW public.products_gallery IS 'Products view with category info and availability status';

COMMENT ON COLUMN public.products.user_id IS 'Owner of the product';
COMMENT ON COLUMN public.products.variants IS 'Product variants for future use: [{name, options: [...]}]';
COMMENT ON COLUMN public.products.images IS 'Array of image URLs';
COMMENT ON COLUMN public.products.stock_quantity IS 'NULL for unlimited or services';
