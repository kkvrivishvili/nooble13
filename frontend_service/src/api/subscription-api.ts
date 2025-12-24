// src/api/subscription-api.ts
import { supabase } from '@/lib/supabase';
import { PostgrestError, AuthError } from '@supabase/supabase-js';

// Helper Functions
const handleApiError = (error: PostgrestError | AuthError | null, context: string) => {
    if (error) {
        throw new Error(`A problem occurred in ${context}: ${error.message}`);
    }
};

class SubscriptionAPI {
    /**
     * Get current user's subscription with plan details
     */
    async getCurrentSubscription() {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        handleApiError(authError, 'auth session');
        if (!session?.user?.id) return null;

        const { data, error } = await supabase
            .rpc('get_user_subscription', { p_user_id: session.user.id });

        handleApiError(error, 'getCurrentSubscription');
        return data?.[0] || null;
    }

    /**
     * Get current usage for this period
     */
    async getCurrentUsage() {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        handleApiError(authError, 'auth session');
        if (!session?.user?.id) return null;

        const { data, error } = await supabase
            .rpc('get_user_current_usage', { p_user_id: session.user.id });

        handleApiError(error, 'getCurrentUsage');
        return data?.[0] || null;
    }

    /**
     * Get user limits based on plan
     */
    async getUserLimits() {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        handleApiError(authError, 'auth session');
        if (!session?.user?.id) return null;

        const { data, error } = await supabase
            .rpc('get_user_limits', { p_user_id: session.user.id });

        handleApiError(error, 'getUserLimits');
        return data;
    }

    /**
     * Check if user can create a resource
     */
    async checkResourceLimit(resourceType: 'agents' | 'documents' | 'products') {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        handleApiError(authError, 'auth session');
        if (!session?.user?.id) return { allowed: false, current: 0, limit: 0 };

        const { data, error } = await supabase
            .rpc('check_resource_limit', {
                p_user_id: session.user.id,
                p_resource_type: resourceType
            });

        handleApiError(error, 'checkResourceLimit');
        return data?.[0];
    }

    /**
     * Get all available plans
     */
    async getAvailablePlans() {
        const { data, error } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');

        handleApiError(error, 'getAvailablePlans');
        return data;
    }

    /**
     * Get user dashboard stats
     */
    async getDashboardStats() {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        handleApiError(authError, 'auth session');
        if (!session?.user?.id) return null;

        const { data, error } = await supabase
            .rpc('get_user_dashboard_stats', { p_user_id: session.user.id });

        handleApiError(error, 'getDashboardStats');
        return data?.[0];
    }
}

export const subscriptionApi = new SubscriptionAPI();
