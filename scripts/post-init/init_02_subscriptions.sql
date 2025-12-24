-- ============================================
-- Nooble8 Database Schema
-- File: init_02_subscriptions.sql
-- Description: Subscription plans, user subscriptions, usage metrics
-- Version: 6.0
-- ============================================

-- ============================================
-- SUBSCRIPTION PLANS TABLE
-- ============================================

CREATE TABLE public.subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    display_name text NOT NULL,
    description text,
    price_monthly decimal(10, 2) DEFAULT 0,
    price_yearly decimal(10, 2) DEFAULT 0,
    currency text DEFAULT 'USD',
    limits jsonb NOT NULL DEFAULT '{
        "agents": 1,
        "documents": 5,
        "conversations_per_month": 100,
        "messages_per_month": 500,
        "tokens_input_per_month": 50000,
        "tokens_output_per_month": 25000,
        "products": 10,
        "widgets_per_type": 10,
        "api_calls_per_day": 50,
        "remove_branding": false,
        "priority_support": false
    }'::jsonb,
    features jsonb DEFAULT '[]'::jsonb,
    trial_days integer DEFAULT 0,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_subscription_plans_name ON public.subscription_plans(name);
CREATE INDEX idx_subscription_plans_active ON public.subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX idx_subscription_plans_sort ON public.subscription_plans(sort_order);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_subscription_plans_updated_at 
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
    status subscription_status NOT NULL DEFAULT 'trialing',
    trial_ends_at timestamptz,
    current_period_start timestamptz NOT NULL DEFAULT now(),
    current_period_end timestamptz NOT NULL,
    cancel_at_period_end boolean DEFAULT false,
    canceled_at timestamptz,
    stripe_subscription_id text,
    stripe_customer_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Each user can only have ONE active subscription
    CONSTRAINT subscriptions_user_unique UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_plan ON public.subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_period_end ON public.subscriptions(current_period_end);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- USAGE METRICS TABLE
-- ============================================

CREATE TABLE public.usage_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    
    -- Message and conversation counts
    messages_count integer DEFAULT 0,
    conversations_count integer DEFAULT 0,
    
    -- Token counts (separate input/output for accurate billing)
    tokens_input_count bigint DEFAULT 0,
    tokens_output_count bigint DEFAULT 0,
    
    -- API usage
    api_calls_count integer DEFAULT 0,
    
    -- Document processing counts (for RAG)
    documents_processed_count integer DEFAULT 0,
    chunks_stored_count integer DEFAULT 0,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- One record per user per period
    CONSTRAINT usage_metrics_user_period_unique UNIQUE (user_id, period_start)
);

-- Indexes
CREATE INDEX idx_usage_metrics_user ON public.usage_metrics(user_id);
CREATE INDEX idx_usage_metrics_period ON public.usage_metrics(period_start, period_end);
CREATE INDEX idx_usage_metrics_user_period ON public.usage_metrics(user_id, period_start);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_usage_metrics_updated_at 
    BEFORE UPDATE ON public.usage_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUBSCRIPTION PLANS RLS POLICIES
-- ============================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can view active plans
CREATE POLICY "Active plans are viewable by everyone"
    ON public.subscription_plans
    FOR SELECT
    USING (is_active = true);

-- Service role has full access
CREATE POLICY "Service role has full access to plans"
    ON public.subscription_plans
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- SUBSCRIPTIONS RLS POLICIES
-- ============================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view their own subscription"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access (for Stripe webhooks, etc.)
CREATE POLICY "Service role has full access to subscriptions"
    ON public.subscriptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- USAGE METRICS RLS POLICIES
-- ============================================

ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own usage"
    ON public.usage_metrics
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access (for backend to update counters)
CREATE POLICY "Service role has full access to usage metrics"
    ON public.usage_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get user's current subscription with plan details
CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id uuid)
RETURNS TABLE (
    subscription_id uuid,
    plan_name text,
    plan_display_name text,
    status subscription_status,
    limits jsonb,
    current_period_start timestamptz,
    current_period_end timestamptz,
    trial_ends_at timestamptz,
    cancel_at_period_end boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        sp.name,
        sp.display_name,
        s.status,
        sp.limits,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        s.cancel_at_period_end
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get user's current period usage
CREATE OR REPLACE FUNCTION get_user_current_usage(p_user_id uuid)
RETURNS TABLE (
    messages_count integer,
    conversations_count integer,
    tokens_input_count bigint,
    tokens_output_count bigint,
    api_calls_count integer,
    documents_processed_count integer,
    chunks_stored_count integer,
    period_start date,
    period_end date
) AS $$
DECLARE
    v_period_start date;
    v_period_end date;
BEGIN
    -- Get current month period
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    
    RETURN QUERY
    SELECT 
        COALESCE(um.messages_count, 0),
        COALESCE(um.conversations_count, 0),
        COALESCE(um.tokens_input_count, 0)::bigint,
        COALESCE(um.tokens_output_count, 0)::bigint,
        COALESCE(um.api_calls_count, 0),
        COALESCE(um.documents_processed_count, 0),
        COALESCE(um.chunks_stored_count, 0),
        v_period_start,
        v_period_end
    FROM (SELECT 1) dummy
    LEFT JOIN usage_metrics um ON um.user_id = p_user_id AND um.period_start = v_period_start;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get or create current period usage record
CREATE OR REPLACE FUNCTION get_or_create_usage_record(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
    v_period_start date;
    v_period_end date;
    v_record_id uuid;
BEGIN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
    
    -- Try to get existing record
    SELECT id INTO v_record_id
    FROM usage_metrics
    WHERE user_id = p_user_id AND period_start = v_period_start;
    
    -- Create if not exists
    IF v_record_id IS NULL THEN
        INSERT INTO usage_metrics (user_id, period_start, period_end)
        VALUES (p_user_id, v_period_start, v_period_end)
        RETURNING id INTO v_record_id;
    END IF;
    
    RETURN v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Increment usage metric
CREATE OR REPLACE FUNCTION increment_usage_metric(
    p_user_id uuid,
    p_metric text,
    p_amount integer DEFAULT 1
)
RETURNS void AS $$
DECLARE
    v_record_id uuid;
BEGIN
    -- Get or create the usage record
    v_record_id := get_or_create_usage_record(p_user_id);
    
    -- Increment the appropriate metric
    EXECUTE format(
        'UPDATE usage_metrics SET %I = %I + $1, updated_at = now() WHERE id = $2',
        p_metric, p_metric
    ) USING p_amount, v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Increment token usage (bigint version)
CREATE OR REPLACE FUNCTION increment_token_usage(
    p_user_id uuid,
    p_tokens_input bigint,
    p_tokens_output bigint
)
RETURNS void AS $$
DECLARE
    v_record_id uuid;
BEGIN
    v_record_id := get_or_create_usage_record(p_user_id);
    
    UPDATE usage_metrics 
    SET 
        tokens_input_count = tokens_input_count + p_tokens_input,
        tokens_output_count = tokens_output_count + p_tokens_output,
        updated_at = now()
    WHERE id = v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Create default subscription for new user
CREATE OR REPLACE FUNCTION create_default_subscription(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
    v_free_plan_id uuid;
    v_subscription_id uuid;
    v_trial_days integer;
BEGIN
    -- Get free plan
    SELECT id, trial_days INTO v_free_plan_id, v_trial_days
    FROM subscription_plans
    WHERE name = 'free' AND is_active = true
    LIMIT 1;
    
    IF v_free_plan_id IS NULL THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;
    
    -- Create subscription
    INSERT INTO subscriptions (
        user_id,
        plan_id,
        status,
        trial_ends_at,
        current_period_start,
        current_period_end
    ) VALUES (
        p_user_id,
        v_free_plan_id,
        'trialing',
        now() + (v_trial_days || ' days')::interval,
        now(),
        now() + interval '1 month'
    )
    RETURNING id INTO v_subscription_id;
    
    RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

GRANT SELECT ON public.usage_metrics TO authenticated;
GRANT ALL ON public.usage_metrics TO service_role;

GRANT EXECUTE ON FUNCTION get_user_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_subscription TO service_role;
GRANT EXECUTE ON FUNCTION get_user_current_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_current_usage TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_usage_record TO service_role;
GRANT EXECUTE ON FUNCTION increment_usage_metric TO service_role;
GRANT EXECUTE ON FUNCTION increment_token_usage TO service_role;
GRANT EXECUTE ON FUNCTION create_default_subscription TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.subscription_plans IS 'Available subscription plans with limits and pricing';
COMMENT ON TABLE public.subscriptions IS 'User subscriptions - one per user';
COMMENT ON TABLE public.usage_metrics IS 'Monthly usage tracking per user';

COMMENT ON COLUMN public.subscription_plans.limits IS 'JSON with plan limits: agents, documents, tokens_input/output_per_month, etc.';
COMMENT ON COLUMN public.usage_metrics.tokens_input_count IS 'Total input tokens consumed in period';
COMMENT ON COLUMN public.usage_metrics.tokens_output_count IS 'Total output tokens consumed in period';
COMMENT ON COLUMN public.usage_metrics.documents_processed_count IS 'Documents processed for RAG in period';
COMMENT ON COLUMN public.usage_metrics.chunks_stored_count IS 'Chunks stored in vector DB in period';
