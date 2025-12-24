-- ============================================
-- Nooble8 Database Schema
-- File: init_08_functions.sql
-- Description: Consolidated helper functions
-- Version: 6.0
-- ============================================

-- ============================================
-- USER INITIALIZATION
-- ============================================

-- Function: Initialize new user with subscription and usage record
CREATE OR REPLACE FUNCTION initialize_new_user(p_user_id uuid)
RETURNS void AS $$
DECLARE
    v_free_plan_id uuid;
BEGIN
    -- Get free plan
    SELECT id INTO v_free_plan_id
    FROM subscription_plans
    WHERE name = 'free' AND is_active = true
    LIMIT 1;
    
    -- Create subscription if free plan exists and user doesn't have one
    IF v_free_plan_id IS NOT NULL THEN
        INSERT INTO subscriptions (
            user_id,
            plan_id,
            status,
            trial_ends_at,
            current_period_start,
            current_period_end
        )
        SELECT
            p_user_id,
            v_free_plan_id,
            'trialing',
            now() + interval '7 days',
            now(),
            now() + interval '1 month'
        WHERE NOT EXISTS (
            SELECT 1 FROM subscriptions WHERE user_id = p_user_id
        );
    END IF;
    
    -- Create initial usage record for current period
    PERFORM get_or_create_usage_record(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- LIMIT CHECKING FUNCTIONS
-- ============================================

-- Function: Get user's plan limits
CREATE OR REPLACE FUNCTION get_user_limits(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_limits jsonb;
BEGIN
    SELECT sp.limits INTO v_limits
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.user_id = p_user_id;
    
    -- Return free tier limits if no subscription found
    IF v_limits IS NULL THEN
        SELECT limits INTO v_limits
        FROM subscription_plans
        WHERE name = 'free' AND is_active = true
        LIMIT 1;
    END IF;
    
    RETURN COALESCE(v_limits, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Check if user can create more of a resource
CREATE OR REPLACE FUNCTION check_resource_limit(
    p_user_id uuid,
    p_resource_type text  -- 'agents', 'documents', 'products'
)
RETURNS TABLE (
    allowed boolean,
    current_count integer,
    max_limit integer,
    message text
) AS $$
DECLARE
    v_limits jsonb;
    v_current integer;
    v_max integer;
BEGIN
    -- Get user limits
    v_limits := get_user_limits(p_user_id);
    v_max := (v_limits->>p_resource_type)::integer;
    
    -- Count current resources
    CASE p_resource_type
        WHEN 'agents' THEN
            SELECT COUNT(*)::integer INTO v_current
            FROM agents WHERE user_id = p_user_id AND is_active = true;
        WHEN 'documents' THEN
            SELECT COUNT(*)::integer INTO v_current
            FROM documents_rag WHERE user_id = p_user_id;
        WHEN 'products' THEN
            SELECT COUNT(*)::integer INTO v_current
            FROM products WHERE user_id = p_user_id AND is_active = true;
        ELSE
            v_current := 0;
    END CASE;
    
    -- Return result
    allowed := v_current < COALESCE(v_max, 999999);
    current_count := v_current;
    max_limit := COALESCE(v_max, 999999);
    
    IF allowed THEN
        message := 'OK';
    ELSE
        message := format('Limit reached: %s/%s %s', v_current, v_max, p_resource_type);
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Check monthly usage limits
CREATE OR REPLACE FUNCTION check_monthly_limit(
    p_user_id uuid,
    p_metric text  -- 'messages', 'conversations', 'tokens_input', 'tokens_output'
)
RETURNS TABLE (
    allowed boolean,
    current_usage bigint,
    max_limit bigint,
    usage_percent numeric,
    message text
) AS $$
DECLARE
    v_limits jsonb;
    v_current bigint;
    v_max bigint;
    v_limit_key text;
BEGIN
    -- Get user limits
    v_limits := get_user_limits(p_user_id);
    
    -- Map metric to limit key
    v_limit_key := p_metric || '_per_month';
    v_max := (v_limits->>v_limit_key)::bigint;
    
    -- Get current usage
    SELECT 
        CASE p_metric
            WHEN 'messages' THEN messages_count
            WHEN 'conversations' THEN conversations_count
            WHEN 'tokens_input' THEN tokens_input_count
            WHEN 'tokens_output' THEN tokens_output_count
            ELSE 0
        END INTO v_current
    FROM usage_metrics
    WHERE user_id = p_user_id 
    AND period_start = date_trunc('month', CURRENT_DATE)::date;
    
    v_current := COALESCE(v_current, 0);
    
    -- Return result
    allowed := v_current < COALESCE(v_max, 999999999);
    current_usage := v_current;
    max_limit := COALESCE(v_max, 999999999);
    usage_percent := CASE WHEN v_max > 0 THEN (v_current::numeric / v_max * 100) ELSE 0 END;
    
    IF allowed THEN
        IF usage_percent >= 80 THEN
            message := format('Warning: %s%% of %s limit used', round(usage_percent), p_metric);
        ELSE
            message := 'OK';
        END IF;
    ELSE
        message := format('Limit reached: %s %s', v_current, p_metric);
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- USAGE TRACKING FUNCTIONS
-- ============================================

-- Function: Record message and update usage
CREATE OR REPLACE FUNCTION record_message_usage(
    p_user_id uuid,
    p_tokens_input integer,
    p_tokens_output integer
)
RETURNS void AS $$
BEGIN
    -- Increment message count
    PERFORM increment_usage_metric(p_user_id, 'messages_count', 1);
    
    -- Increment token counts
    PERFORM increment_token_usage(p_user_id, p_tokens_input::bigint, p_tokens_output::bigint);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Record new conversation
CREATE OR REPLACE FUNCTION record_conversation_usage(p_user_id uuid)
RETURNS void AS $$
BEGIN
    PERFORM increment_usage_metric(p_user_id, 'conversations_count', 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Record document processing
CREATE OR REPLACE FUNCTION record_document_usage(
    p_user_id uuid,
    p_chunks_count integer
)
RETURNS void AS $$
BEGIN
    PERFORM increment_usage_metric(p_user_id, 'documents_processed_count', 1);
    PERFORM increment_usage_metric(p_user_id, 'chunks_stored_count', p_chunks_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- DASHBOARD / STATS FUNCTIONS
-- ============================================

-- Function: Get user dashboard stats
CREATE OR REPLACE FUNCTION get_user_dashboard_stats(p_user_id uuid)
RETURNS TABLE (
    -- Resource counts
    agents_count integer,
    documents_count integer,
    products_count integer,
    widgets_count integer,
    
    -- Subscription info
    plan_name text,
    subscription_status subscription_status,
    period_end timestamptz,
    
    -- Current period usage
    messages_used integer,
    messages_limit integer,
    conversations_used integer,
    conversations_limit integer,
    tokens_input_used bigint,
    tokens_input_limit bigint,
    tokens_output_used bigint,
    tokens_output_limit bigint
) AS $$
DECLARE
    v_limits jsonb;
    v_usage record;
BEGIN
    -- Get limits
    v_limits := get_user_limits(p_user_id);
    
    -- Get current usage
    SELECT * INTO v_usage FROM get_user_current_usage(p_user_id);
    
    RETURN QUERY
    SELECT
        -- Resource counts
        count_user_agents(p_user_id),
        count_user_documents(p_user_id),
        count_user_products(p_user_id),
        (SELECT COUNT(*)::integer FROM get_user_widgets_ordered(p_user_id, false)),
        
        -- Subscription info
        (SELECT sp.name FROM subscriptions s 
         JOIN subscription_plans sp ON s.plan_id = sp.id 
         WHERE s.user_id = p_user_id),
        (SELECT s.status FROM subscriptions s WHERE s.user_id = p_user_id),
        (SELECT s.current_period_end FROM subscriptions s WHERE s.user_id = p_user_id),
        
        -- Usage vs limits
        COALESCE(v_usage.messages_count, 0),
        (v_limits->>'messages_per_month')::integer,
        COALESCE(v_usage.conversations_count, 0),
        (v_limits->>'conversations_per_month')::integer,
        COALESCE(v_usage.tokens_input_count, 0),
        (v_limits->>'tokens_input_per_month')::bigint,
        COALESCE(v_usage.tokens_output_count, 0),
        (v_limits->>'tokens_output_per_month')::bigint;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get agent stats
CREATE OR REPLACE FUNCTION get_agent_stats(p_agent_id uuid)
RETURNS TABLE (
    total_conversations bigint,
    total_messages bigint,
    total_tokens_input bigint,
    total_tokens_output bigint,
    last_conversation_at timestamptz,
    avg_messages_per_conversation numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT c.id),
        COUNT(m.id),
        COALESCE(SUM(m.tokens_input), 0)::bigint,
        COALESCE(SUM(m.tokens_output), 0)::bigint,
        MAX(c.last_message_at),
        CASE 
            WHEN COUNT(DISTINCT c.id) > 0 
            THEN ROUND(COUNT(m.id)::numeric / COUNT(DISTINCT c.id), 2)
            ELSE 0
        END
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

-- Function: Reset monthly usage (for scheduled job)
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS integer AS $$
DECLARE
    v_count integer;
    v_current_month date;
BEGIN
    v_current_month := date_trunc('month', CURRENT_DATE)::date;
    
    -- Create new usage records for all active users who don't have one
    WITH inserted AS (
        INSERT INTO usage_metrics (user_id, period_start, period_end)
        SELECT 
            p.id,
            v_current_month,
            (v_current_month + interval '1 month' - interval '1 day')::date
        FROM profiles p
        WHERE NOT EXISTS (
            SELECT 1 FROM usage_metrics um 
            WHERE um.user_id = p.id AND um.period_start = v_current_month
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM inserted;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT EXECUTE ON FUNCTION initialize_new_user TO service_role;
GRANT EXECUTE ON FUNCTION get_user_limits TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_limits TO service_role;
GRANT EXECUTE ON FUNCTION check_resource_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_resource_limit TO service_role;
GRANT EXECUTE ON FUNCTION check_monthly_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_monthly_limit TO service_role;
GRANT EXECUTE ON FUNCTION record_message_usage TO service_role;
GRANT EXECUTE ON FUNCTION record_conversation_usage TO service_role;
GRANT EXECUTE ON FUNCTION record_document_usage TO service_role;
GRANT EXECUTE ON FUNCTION get_user_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_dashboard_stats TO service_role;
GRANT EXECUTE ON FUNCTION get_agent_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_stats TO service_role;
GRANT EXECUTE ON FUNCTION reset_monthly_usage TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION initialize_new_user IS 'Sets up subscription and usage tracking for a new user';
COMMENT ON FUNCTION get_user_limits IS 'Returns the limits for a user based on their subscription plan';
COMMENT ON FUNCTION check_resource_limit IS 'Checks if user can create more of a resource type';
COMMENT ON FUNCTION check_monthly_limit IS 'Checks monthly usage against plan limits';
COMMENT ON FUNCTION record_message_usage IS 'Records message and token usage for billing';
COMMENT ON FUNCTION record_conversation_usage IS 'Records new conversation for billing';
COMMENT ON FUNCTION record_document_usage IS 'Records document processing for billing';
COMMENT ON FUNCTION get_user_dashboard_stats IS 'Returns all stats for user dashboard';
COMMENT ON FUNCTION get_agent_stats IS 'Returns statistics for a specific agent';
COMMENT ON FUNCTION reset_monthly_usage IS 'Creates new usage records for a new month';
