-- ============================================
-- Nooble8 Database Schema
-- File: init_03_processing_limits.sql
-- Description: Processing limits for document ingestion tiers
-- Version: 6.0
-- ============================================

-- ============================================
-- PREREQUISITE: Ensure increment_usage_metric exists
-- This function should be defined in a previous migration
-- ============================================

-- Create increment_usage_metric if it doesn't exist
CREATE OR REPLACE FUNCTION increment_usage_metric(
    p_user_id uuid,
    p_metric_name text,
    p_increment integer DEFAULT 1
)
RETURNS void AS $$
DECLARE
    v_period_start date;
BEGIN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    
    -- Insert or update the usage metric
    INSERT INTO usage_metrics (user_id, period_start, period_end)
    VALUES (
        p_user_id,
        v_period_start,
        (v_period_start + interval '1 month - 1 day')::date
    )
    ON CONFLICT (user_id, period_start) DO NOTHING;
    
    -- Dynamically update the correct column
    EXECUTE format(
        'UPDATE usage_metrics SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE user_id = $2 AND period_start = $3',
        p_metric_name, p_metric_name
    )
    USING p_increment, p_user_id, v_period_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Add documents_processed_count column if not exists
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'usage_metrics' 
        AND column_name = 'documents_processed_count'
    ) THEN
        ALTER TABLE usage_metrics ADD COLUMN documents_processed_count integer DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- UPDATE DEFAULT PLANS WITH PROCESSING LIMITS
-- ============================================

-- Update or insert subscription plans with processing limits
INSERT INTO public.subscription_plans (
    name,
    display_name,
    description,
    price_monthly,
    price_yearly,
    limits,
    features,
    trial_days,
    is_active,
    sort_order
) VALUES 
(
    'free',
    'Free',
    'Plan gratuito con funcionalidades básicas',
    0,
    0,
    '{
        "agents": 1,
        "documents": 10,
        "conversations_per_month": 100,
        "messages_per_month": 500,
        "tokens_input_per_month": 50000,
        "tokens_output_per_month": 25000,
        "products": 10,
        "widgets_per_type": 5,
        "api_calls_per_day": 50,
        "remove_branding": false,
        "priority_support": false,
        "processing_mode": "fast",
        "enable_llm_enrichment": false,
        "max_pages_per_document": 30,
        "max_documents_per_month": 10,
        "llm_enrichment_percentage": 0,
        "spacy_model": "md",
        "max_file_size_mb": 10
    }'::jsonb,
    '["1 Agente IA", "10 documentos", "Procesamiento rápido", "spaCy básico", "Soporte comunidad"]'::jsonb,
    14,
    true,
    1
),
(
    'pro',
    'Professional',
    'Plan profesional para equipos pequeños',
    29,
    290,
    '{
        "agents": 5,
        "documents": 100,
        "conversations_per_month": 1000,
        "messages_per_month": 5000,
        "tokens_input_per_month": 500000,
        "tokens_output_per_month": 250000,
        "products": 100,
        "widgets_per_type": 20,
        "api_calls_per_day": 500,
        "remove_branding": true,
        "priority_support": false,
        "processing_mode": "balanced",
        "enable_llm_enrichment": true,
        "max_pages_per_document": 100,
        "max_documents_per_month": 100,
        "llm_enrichment_percentage": 20,
        "spacy_model": "lg",
        "max_file_size_mb": 25
    }'::jsonb,
    '["5 Agentes IA", "100 documentos", "Procesamiento balanceado", "spaCy avanzado", "LLM enrichment selectivo", "Sin branding", "Soporte email"]'::jsonb,
    14,
    true,
    2
),
(
    'enterprise',
    'Enterprise',
    'Plan empresarial con todas las funcionalidades',
    99,
    990,
    '{
        "agents": 25,
        "documents": 1000,
        "conversations_per_month": 10000,
        "messages_per_month": 50000,
        "tokens_input_per_month": 5000000,
        "tokens_output_per_month": 2500000,
        "products": 1000,
        "widgets_per_type": 100,
        "api_calls_per_day": 5000,
        "remove_branding": true,
        "priority_support": true,
        "processing_mode": "premium",
        "enable_llm_enrichment": true,
        "max_pages_per_document": 500,
        "max_documents_per_month": 1000,
        "llm_enrichment_percentage": 100,
        "spacy_model": "lg",
        "max_file_size_mb": 50
    }'::jsonb,
    '["25 Agentes IA", "1000 documentos", "Procesamiento premium", "spaCy avanzado", "LLM enrichment completo", "Sin branding", "Soporte prioritario 24/7"]'::jsonb,
    30,
    true,
    3
)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    limits = EXCLUDED.limits,
    features = EXCLUDED.features,
    trial_days = EXCLUDED.trial_days,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- ============================================
-- HELPER FUNCTIONS FOR PROCESSING LIMITS
-- ============================================

-- Function: Get user's processing limits
CREATE OR REPLACE FUNCTION get_user_processing_limits(p_user_id uuid)
RETURNS TABLE (
    processing_mode text,
    enable_llm_enrichment boolean,
    max_pages_per_document integer,
    max_documents_per_month integer,
    llm_enrichment_percentage integer,
    spacy_model text,
    max_file_size_mb integer,
    documents_used_this_month integer
) AS $$
DECLARE
    v_period_start date;
BEGIN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    
    RETURN QUERY
    SELECT 
        COALESCE(sp.limits->>'processing_mode', 'fast')::text,
        COALESCE((sp.limits->>'enable_llm_enrichment')::boolean, false),
        COALESCE((sp.limits->>'max_pages_per_document')::integer, 30),
        COALESCE((sp.limits->>'max_documents_per_month')::integer, 10),
        COALESCE((sp.limits->>'llm_enrichment_percentage')::integer, 0),
        COALESCE(sp.limits->>'spacy_model', 'md')::text,
        COALESCE((sp.limits->>'max_file_size_mb')::integer, 10),
        COALESCE(um.documents_processed_count, 0)
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN usage_metrics um ON um.user_id = p_user_id AND um.period_start = v_period_start
    WHERE s.user_id = p_user_id
    AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Check if user can process document
CREATE OR REPLACE FUNCTION can_user_process_document(
    p_user_id uuid,
    p_page_count integer DEFAULT 0,
    p_file_size_mb integer DEFAULT 0
)
RETURNS TABLE (
    can_process boolean,
    reason text,
    processing_mode text
) AS $$
DECLARE
    v_limits record;
BEGIN
    SELECT * INTO v_limits FROM get_user_processing_limits(p_user_id);
    
    IF v_limits IS NULL THEN
        RETURN QUERY SELECT false, 'No active subscription found'::text, 'none'::text;
        RETURN;
    END IF;
    
    -- Check monthly document limit
    IF v_limits.documents_used_this_month >= v_limits.max_documents_per_month THEN
        RETURN QUERY SELECT false, 
            format('Monthly document limit reached (%s/%s)', v_limits.documents_used_this_month, v_limits.max_documents_per_month),
            v_limits.processing_mode;
        RETURN;
    END IF;
    
    -- Check page limit (only if page_count provided)
    IF p_page_count > 0 AND p_page_count > v_limits.max_pages_per_document THEN
        RETURN QUERY SELECT false, 
            format('Document has %s pages, max allowed is %s', p_page_count, v_limits.max_pages_per_document),
            v_limits.processing_mode;
        RETURN;
    END IF;
    
    -- Check file size (only if file_size_mb provided)
    IF p_file_size_mb > 0 AND p_file_size_mb > v_limits.max_file_size_mb THEN
        RETURN QUERY SELECT false,
            format('File size %sMB exceeds max %sMB', p_file_size_mb, v_limits.max_file_size_mb),
            v_limits.processing_mode;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, 'OK'::text, v_limits.processing_mode;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Increment document processed count
CREATE OR REPLACE FUNCTION increment_documents_processed(p_user_id uuid)
RETURNS void AS $$
BEGIN
    PERFORM increment_usage_metric(p_user_id, 'documents_processed_count', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION increment_usage_metric TO service_role;
GRANT EXECUTE ON FUNCTION get_user_processing_limits TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_processing_limits TO service_role;
GRANT EXECUTE ON FUNCTION can_user_process_document TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_process_document TO service_role;
GRANT EXECUTE ON FUNCTION increment_documents_processed TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION increment_usage_metric IS 'Generic function to increment usage metrics by column name';
COMMENT ON FUNCTION get_user_processing_limits IS 'Returns processing limits based on user subscription plan';
COMMENT ON FUNCTION can_user_process_document IS 'Validates if user can process a document given their limits';
COMMENT ON FUNCTION increment_documents_processed IS 'Increments the monthly document processed counter';
