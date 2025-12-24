# Migration Guide - Nooble8 Database V6.0

## Overview

This document describes all the changes required in the frontend (TypeScript) and backend (Python) code to work with the new database schema V6.0.

---

## Table of Contents

1. [Database Changes Summary](#1-database-changes-summary)
2. [Frontend Changes](#2-frontend-changes)
   - [agents-api.ts](#21-agents-apits)
   - [conversation-api.ts](#22-conversation-apits)
   - [design-api.ts](#23-design-apits)
   - [public-profile-api.tsx](#24-public-profile-apitsx)
   - [profile-api.ts](#25-profile-apits)
   - [New: subscription-api.ts](#26-new-subscription-apits)
   - [Type Definitions](#27-type-definitions)
3. [Backend Changes](#3-backend-changes)
   - [models.py](#31-modelspy)
   - [types.py](#32-typespy)
   - [auth.py](#33-authpy)
   - [cache.py](#34-cachepy)
   - [client.py](#35-clientpy)
4. [Breaking Changes Checklist](#4-breaking-changes-checklist)
5. [New Features Available](#5-new-features-available)

---

## 1. Database Changes Summary

### Renamed Fields

| Table | Old Field | New Field |
|-------|-----------|-----------|
| `conversations` | `tenant_id` | `user_id` |
| `products` | `tenant_id` | `user_id` |
| `documents_rag` | `profile_id` | `user_id` |
| `widget_*` | `profile_id` | `user_id` |

### Removed Fields

| Table | Removed Field | Reason |
|-------|---------------|--------|
| `profiles` | `agents` | Redundant with `agents` table |
| `profiles` | `widgets` | Redundant with `widget_*` tables |
| `profiles` | `version` | Moved to `design.version` |
| `documents_rag` | `tenant_id` | Was duplicate of `profile_id`/`user_id` |
| `documents_rag` | `agent_id` | Replaced by `agent_ids` JSONB |

### New Fields in Widget Tables

All `widget_*` tables now have:
- `position` (integer) - For ordering
- `is_active` (boolean) - For visibility
- `updated_at` (timestamptz) - For tracking changes

### New Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Available plans catalog |
| `subscriptions` | User subscriptions |
| `usage_metrics` | Monthly usage tracking |
| `product_categories` | Product categorization |

### New Fields in `messages`

- `tokens_input` (integer) - Input tokens consumed
- `tokens_output` (integer) - Output tokens generated
- `latency_ms` (integer) - Response time

### Renamed/Changed Enums

| Old | New |
|-----|-----|
| `is_active` boolean | `status` enum in `conversations` |

---

## 2. Frontend Changes

### 2.1 agents-api.ts

#### Remove Methods

```typescript
// DELETE these private methods - no longer needed
private async addAgentToProfile(agentId: string): Promise<void> { ... }
private async removeAgentFromProfile(agentId: string): Promise<void> { ... }
```

#### Modify Methods

```typescript
// createCustomAgent - REMOVE the addAgentToProfile call
async createCustomAgent(agentData: {...}): Promise<Agent> {
    // ... existing insert code ...
    
    // REMOVE THIS LINE:
    // await this.addAgentToProfile(data.id);
    
    return data;
}

// deleteAgent - REMOVE the removeAgentFromProfile call
async deleteAgent(agentId: string): Promise<void> {
    // ... existing ownership check ...
    
    // REMOVE THIS LINE:
    // await this.removeAgentFromProfile(agentId);
    
    // Delete the agent
    const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId)
        .eq('user_id', userId);
    // ...
}

// duplicateAgent - REMOVE the addAgentToProfile call
async duplicateAgent(agentId: string, newName?: string): Promise<Agent> {
    // ... existing code ...
    
    // REMOVE THIS LINE:
    // await this.addAgentToProfile(data.id);
    
    return data;
}
```

---

### 2.2 conversation-api.ts

#### Rename All `tenant_id` References

```typescript
// BEFORE
async getConversationsByTenant(tenantId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenantId)  // ❌ OLD
        // ...
}

// AFTER
async getConversationsByUser(userId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)  // ✅ NEW
        // ...
}
```

#### Update createConversation

```typescript
// BEFORE
async createConversation(
    tenantId: string,  // ❌ OLD
    sessionId: string,
    agentId: string,
    visitorInfo?: ...
): Promise<Conversation> {
    const { data, error } = await supabase
        .from('conversations')
        .insert({
            id: await this.generateConversationId(tenantId, sessionId, agentId),
            tenant_id: tenantId,  // ❌ OLD
            // ...
        })
}

// AFTER
async createConversation(
    userId: string,  // ✅ NEW
    sessionId: string,
    agentId: string,
    visitorInfo?: ...
): Promise<Conversation> {
    const { data, error } = await supabase
        .from('conversations')
        .insert({
            id: await this.generateConversationId(userId, sessionId, agentId),
            user_id: userId,  // ✅ NEW
            // ...
        })
}
```

#### Update generateConversationId

```typescript
// BEFORE
private async generateConversationId(
    tenantId: string,  // ❌ OLD
    sessionId: string,
    agentId: string
): Promise<string> {
    const { data, error } = await supabase.rpc('generate_conversation_id', {
        p_tenant_id: tenantId,  // ❌ OLD
        // ...
    });
}

// AFTER
private async generateConversationId(
    userId: string,  // ✅ NEW
    sessionId: string,
    agentId: string
): Promise<string> {
    const { data, error } = await supabase.rpc('generate_conversation_id', {
        p_user_id: userId,  // ✅ NEW
        p_session_id: sessionId,
        p_agent_id: agentId
    });
}
```

---

### 2.3 design-api.ts

No major changes needed. The design presets already use snake_case which matches the new schema.

**Optional improvement**: Consider calling `get_user_subscription` to check if user has access to certain design features based on their plan.

---

### 2.4 public-profile-api.tsx

This file requires the **most significant changes** because it currently reads widgets from `profiles.widgets` JSONB.

#### Complete Rewrite of getPublicProfile

```typescript
async getPublicProfile(username: string): Promise<ProfileWithAgents | null> {
    if (!username) return null;

    // 1. Get base profile (without widgets/agents JSONB - they're removed)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, description, avatar, social_links, design, is_public')
        .eq('username', username)
        .eq('is_public', true)
        .single();

    if (profileError || !profile) {
        console.error('Error fetching public profile:', profileError);
        return null;
    }

    // 2. Get agents directly from agents table
    const { data: agents, error: agentsError } = await supabase
        .from('agents_with_prompt')
        .select('*')
        .eq('user_id', profile.id)  // ✅ Use user_id
        .eq('is_active', true)
        .eq('is_public', true);

    // 3. Get all widgets using the new function OR individual queries
    // Option A: Use the new helper function
    const { data: allWidgets, error: widgetsError } = await supabase
        .rpc('get_user_widgets_ordered', { 
            p_user_id: profile.id,
            p_active_only: true
        });

    // Option B: Query each widget table separately (if not using function)
    const [links, galleries, agentWidgets, youtube, maps, spotify, calendar, separators, titles] = 
        await Promise.all([
            supabase.from('widget_links')
                .select('*')
                .eq('user_id', profile.id)
                .eq('is_active', true)
                .order('position'),
            supabase.from('widget_gallery')
                .select('*')
                .eq('user_id', profile.id)
                .eq('is_active', true)
                .order('position'),
            supabase.from('widget_agents')
                .select('*')
                .eq('user_id', profile.id)
                .eq('is_active', true)
                .order('position'),
            // ... repeat for other widget types
        ]);

    // 4. Combine all widgets and sort by position
    const combinedWidgets = [
        ...(links.data || []).map(w => ({ ...w, type: 'link' })),
        ...(galleries.data || []).map(w => ({ ...w, type: 'gallery' })),
        ...(agentWidgets.data || []).map(w => ({ ...w, type: 'agents' })),
        // ... other widget types
    ].sort((a, b) => a.position - b.position);

    // 5. Return the profile with all data
    return {
        ...profile,
        agentDetails: agents || [],
        linkWidgets: links.data || [],
        galleryWidgets: galleries.data || [],
        agentWidgets: agentWidgets.data || [],
        youtubeWidgets: youtube.data || [],
        mapsWidgets: maps.data || [],
        spotifyWidgets: spotify.data || [],
        calendarWidgets: calendar.data || [],
        separatorWidgets: separators.data || [],
        titleWidgets: titles.data || [],
        // Combined and sorted for rendering
        allWidgetsOrdered: combinedWidgets
    };
}
```

---

### 2.5 profile-api.ts

If you have a profile-api.ts that manages the profile, update widget-related operations:

#### Creating Widgets

```typescript
// BEFORE - used to update profiles.widgets JSONB
async createWidget(type: string, data: any): Promise<Widget> {
    // Create widget in table
    const { data: widget } = await supabase
        .from(`widget_${type}`)
        .insert({ profile_id: userId, ...data })  // ❌ OLD
        .select()
        .single();
    
    // Update profiles.widgets JSONB  // ❌ REMOVE THIS
    await supabase
        .from('profiles')
        .update({ widgets: [...currentWidgets, newWidgetRef] })
        .eq('id', userId);
}

// AFTER - just create widget with position
async createWidget(type: string, data: any): Promise<Widget> {
    const userId = await getUserId();
    
    // Get next position
    const { data: nextPos } = await supabase
        .rpc('get_next_widget_position', { p_user_id: userId });
    
    // Create widget with position
    const { data: widget, error } = await supabase
        .from(`widget_${type}`)
        .insert({ 
            user_id: userId,  // ✅ NEW
            position: nextPos || 0,
            is_active: true,
            ...data 
        })
        .select()
        .single();
    
    return widget;
}
```

#### Reordering Widgets

```typescript
// BEFORE - updated profiles.widgets JSONB
async reorderWidgets(widgetIds: string[]): Promise<void> {
    // Complex JSONB manipulation
}

// AFTER - update position in each widget table
async reorderWidgets(widgets: { id: string, type: string, position: number }[]): Promise<void> {
    const userId = await getUserId();
    
    // Update each widget's position
    for (const widget of widgets) {
        await supabase
            .from(`widget_${widget.type}`)
            .update({ position: widget.position })
            .eq('id', widget.id)
            .eq('user_id', userId);  // ✅ Use user_id
    }
}
```

---

### 2.6 New: subscription-api.ts

Create a new API file for subscription management:

```typescript
// src/api/subscription-api.ts
import { supabase } from '@/lib/supabase';

class SubscriptionAPI {
    /**
     * Get current user's subscription with plan details
     */
    async getCurrentSubscription() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .rpc('get_user_subscription', { p_user_id: session.user.id });

        if (error) throw error;
        return data?.[0] || null;
    }

    /**
     * Get current usage for this period
     */
    async getCurrentUsage() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .rpc('get_user_current_usage', { p_user_id: session.user.id });

        if (error) throw error;
        return data?.[0] || null;
    }

    /**
     * Get user limits based on plan
     */
    async getUserLimits() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .rpc('get_user_limits', { p_user_id: session.user.id });

        if (error) throw error;
        return data;
    }

    /**
     * Check if user can create a resource
     */
    async checkResourceLimit(resourceType: 'agents' | 'documents' | 'products') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .rpc('check_resource_limit', { 
                p_user_id: session.user.id,
                p_resource_type: resourceType
            });

        if (error) throw error;
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

        if (error) throw error;
        return data;
    }

    /**
     * Get dashboard stats
     */
    async getDashboardStats() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .rpc('get_user_dashboard_stats', { p_user_id: session.user.id });

        if (error) throw error;
        return data?.[0];
    }
}

export const subscriptionApi = new SubscriptionAPI();
```

---

### 2.7 Type Definitions

Update your TypeScript type definitions:

```typescript
// types/profile.ts

// REMOVE these from Profile type
interface Profile {
    id: string;
    username: string;
    display_name: string;
    description: string;
    avatar: string;
    social_links: SocialLink[];
    design: ProfileDesign;
    is_public: boolean;
    created_at: string;
    updated_at: string;
    // REMOVE: agents: string[];  ❌
    // REMOVE: widgets: Widget[]; ❌
    // REMOVE: version: number;   ❌
}

// UPDATE Widget types to include position and is_active
interface BaseWidget {
    id: string;
    user_id: string;  // ✅ Changed from profile_id
    position: number;  // ✅ NEW
    is_active: boolean;  // ✅ NEW
    created_at: string;
    updated_at: string;  // ✅ NEW
}

interface WidgetLink extends BaseWidget {
    title: string;
    url: string;
    description?: string;
    icon?: string;
}

// ... similar for other widget types

// NEW: Subscription types
interface SubscriptionPlan {
    id: string;
    name: string;
    display_name: string;
    description: string;
    price_monthly: number;
    price_yearly: number;
    currency: string;
    limits: PlanLimits;
    features: string[];
    trial_days: number;
}

interface PlanLimits {
    agents: number;
    documents: number;
    conversations_per_month: number;
    messages_per_month: number;
    tokens_input_per_month: number;
    tokens_output_per_month: number;
    products: number;
    widgets_per_type: number;
    api_calls_per_day: number;
    remove_branding: boolean;
    priority_support: boolean;
}

interface Subscription {
    id: string;
    user_id: string;
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused';
    trial_ends_at?: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
}

interface UsageMetrics {
    messages_count: number;
    conversations_count: number;
    tokens_input_count: number;
    tokens_output_count: number;
    api_calls_count: number;
    documents_processed_count: number;
    chunks_stored_count: number;
    period_start: string;
    period_end: string;
}

// UPDATE Conversation type
interface Conversation {
    id: string;
    user_id: string;  // ✅ Changed from tenant_id
    session_id: string;
    agent_id: string;
    visitor_info: VisitorInfo;
    status: 'active' | 'closed' | 'archived';  // ✅ Changed from is_active
    started_at: string;
    ended_at?: string;
    message_count: number;
    last_message_at: string;
}

// UPDATE Message type
interface Message {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';  // ✅ Added 'system'
    content: string;
    tokens_input?: number;   // ✅ NEW
    tokens_output?: number;  // ✅ NEW
    model?: string;          // ✅ NEW
    latency_ms?: number;     // ✅ NEW
    metadata: Record<string, any>;
    created_at: string;
}
```

---

## 3. Backend Changes

### 3.1 models.py

```python
# BEFORE
class AgentConfig(BaseModel):
    agent_id: uuid.UUID
    agent_name: str
    tenant_id: uuid.UUID  # ❌ OLD
    # ...

# AFTER
class AgentConfig(BaseModel):
    agent_id: uuid.UUID
    agent_name: str
    user_id: uuid.UUID  # ✅ NEW
    # ...


# BEFORE
class IngestionMetadata(BaseModel):
    document_id: str
    collection_id: str
    tenant_id: uuid.UUID  # ❌ OLD
    # ...

# AFTER
class IngestionMetadata(BaseModel):
    document_id: str
    collection_id: str
    user_id: uuid.UUID  # ✅ NEW
    # ...


# ADD new models
class SubscriptionInfo(BaseModel):
    """User subscription information."""
    id: uuid.UUID
    user_id: uuid.UUID
    plan_name: str
    plan_display_name: str
    status: str  # active, canceled, past_due, trialing, paused
    limits: Dict[str, Any]
    current_period_start: datetime
    current_period_end: datetime
    trial_ends_at: Optional[datetime] = None
    cancel_at_period_end: bool = False


class UsageMetrics(BaseModel):
    """Monthly usage metrics."""
    user_id: uuid.UUID
    period_start: date
    period_end: date
    messages_count: int = 0
    conversations_count: int = 0
    tokens_input_count: int = 0
    tokens_output_count: int = 0
    api_calls_count: int = 0
    documents_processed_count: int = 0
    chunks_stored_count: int = 0


class MessageWithTokens(BaseModel):
    """Message with token tracking."""
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str  # user, assistant, system
    content: str
    tokens_input: int = 0
    tokens_output: int = 0
    model: Optional[str] = None
    latency_ms: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
```

---

### 3.2 types.py

No breaking changes, but add new types:

```python
# ADD these new types

class SubscriptionStatus(str, Enum):
    """Subscription status enum."""
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"
    PAUSED = "paused"


class ConversationStatus(str, Enum):
    """Conversation status enum."""
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"


class MessageRole(str, Enum):
    """Message role enum."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
```

---

### 3.3 auth.py

Update references from `tenant_id` to `user_id` in validation:

```python
# BEFORE
async def validate_message_permissions(self, connection_info: ConnectionInfo, message: WebSocketMessage) -> bool:
    # ...
    if message.tenant_id and connection_info.tenant_id:
        if message.tenant_id != connection_info.tenant_id:  # ❌ OLD
    # ...

# AFTER
async def validate_message_permissions(self, connection_info: ConnectionInfo, message: WebSocketMessage) -> bool:
    # ...
    # Option 1: Rename to user_id
    if message.user_id and connection_info.user_id:
        if message.user_id != connection_info.user_id:  # ✅ NEW
    
    # Option 2: Keep tenant_id internally but document it equals user_id
    # Add docstring: "Note: tenant_id is equivalent to user_id in our system"
    # ...
```

**Decision**: If you want to keep `tenant_id` internally in the backend for multi-tenant future expansion, document clearly that `tenant_id = user_id` currently. Otherwise, rename everywhere.

---

### 3.4 cache.py

Rename methods or add aliases:

```python
# Option 1: Rename methods
async def get_user_info(self, user_id: str) -> Optional[Dict[str, Any]]:
    """Get user information from cache."""
    cache_key = self.key_manager.get_key("user_info", user_id)
    return await self.cache_manager.get(cache_key)

# Option 2: Keep tenant but add alias
async def get_tenant_info(self, tenant_id: str) -> Optional[Dict[str, Any]]:
    """
    Get tenant information from cache.
    Note: In current implementation, tenant_id equals user_id.
    """
    return await self.get_user_info(tenant_id)
```

---

### 3.5 client.py

Update Supabase queries:

```python
# BEFORE
async def get_conversations(self, tenant_id: str):
    response = await self.client.table('conversations') \
        .select('*') \
        .eq('tenant_id', tenant_id) \  # ❌ OLD
        .execute()

# AFTER
async def get_conversations(self, user_id: str):
    response = await self.client.table('conversations') \
        .select('*') \
        .eq('user_id', user_id) \  # ✅ NEW
        .execute()


# ADD: New methods for subscriptions
async def get_user_subscription(self, user_id: str):
    response = await self.client.rpc(
        'get_user_subscription',
        {'p_user_id': user_id}
    ).execute()
    return response.data[0] if response.data else None

async def check_user_limit(self, user_id: str, resource_type: str):
    response = await self.client.rpc(
        'check_resource_limit',
        {'p_user_id': user_id, 'p_resource_type': resource_type}
    ).execute()
    return response.data[0] if response.data else None

async def record_message_usage(self, user_id: str, tokens_input: int, tokens_output: int):
    await self.client.rpc(
        'record_message_usage',
        {
            'p_user_id': user_id,
            'p_tokens_input': tokens_input,
            'p_tokens_output': tokens_output
        }
    ).execute()
```

---

## 4. Breaking Changes Checklist

### Database

- [ ] `conversations.tenant_id` → `conversations.user_id`
- [ ] `products.tenant_id` → `products.user_id`
- [ ] `documents_rag.profile_id` → `documents_rag.user_id`
- [ ] `documents_rag.tenant_id` removed (was redundant)
- [ ] `documents_rag.agent_id` removed (use `agent_ids` JSONB)
- [ ] `widget_*.profile_id` → `widget_*.user_id`
- [ ] `profiles.agents` removed
- [ ] `profiles.widgets` removed
- [ ] `conversations.is_active` → `conversations.status` (enum)
- [ ] All widget tables now have `position`, `is_active`, `updated_at`

### Frontend

- [ ] Update all `tenant_id` references to `user_id`
- [ ] Remove `addAgentToProfile()` and `removeAgentFromProfile()` from agents-api
- [ ] Rewrite `public-profile-api.tsx` to query widget tables directly
- [ ] Update widget creation to include `position` field
- [ ] Update widget types to include `position`, `is_active`, `updated_at`
- [ ] Remove `agents` and `widgets` from Profile type
- [ ] Add new subscription-api.ts
- [ ] Update Conversation type (`is_active` → `status`)
- [ ] Update Message type (add token fields)

### Backend

- [ ] Rename `tenant_id` to `user_id` in models (or document alias)
- [ ] Add new models: `SubscriptionInfo`, `UsageMetrics`, `MessageWithTokens`
- [ ] Update Supabase queries to use new field names
- [ ] Add methods for subscription/usage tracking
- [ ] Update cache key names if renaming

---

## 5. New Features Available

After migration, you have access to:

### Subscription Management
- `get_user_subscription(user_id)` - Get current plan and limits
- `check_resource_limit(user_id, type)` - Check before creating resources
- `check_monthly_limit(user_id, metric)` - Check usage limits

### Usage Tracking
- `record_message_usage(user_id, tokens_in, tokens_out)` - Track messages
- `record_conversation_usage(user_id)` - Track new conversations
- `record_document_usage(user_id, chunks)` - Track document processing

### Dashboard Stats
- `get_user_dashboard_stats(user_id)` - All stats in one call
- `get_agent_stats(agent_id)` - Per-agent statistics

### Widget Management
- `get_user_widgets_ordered(user_id)` - All widgets sorted by position
- `get_next_widget_position(user_id)` - Get position for new widget
- `count_user_widgets_by_type(user_id, type)` - Count by type

### Maintenance
- `archive_old_conversations(months)` - Archive old conversations
- `delete_old_conversations(months)` - Delete archived conversations
- `reset_monthly_usage()` - Create new period records

---

## Migration Order

1. **Deploy database changes first**
   - Run init scripts in order (01 through 09)
   - Verify with test queries

2. **Update backend**
   - Update models and types
   - Update Supabase client queries
   - Deploy backend

3. **Update frontend**
   - Update type definitions
   - Update API files
   - Test thoroughly
   - Deploy frontend

4. **Verify**
   - Test user registration (new user flow)
   - Test existing user login
   - Test widget operations
   - Test agent operations
   - Test conversation flow
