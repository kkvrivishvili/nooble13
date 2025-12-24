# Nooble8 Database Schema V6.0

## Overview

Complete database schema for Nooble8 platform - a link-in-bio service with AI agents.

## File Structure

```
nooble8_db/
├── README.md                    # This file
├── MIGRATION.md                 # Code migration guide
├── init_01_core.sql            # Extensions, base functions, profiles
├── init_02_subscriptions.sql   # Plans, subscriptions, usage metrics
├── init_03_agents.sql          # Agent templates structure, agents
├── init_04_conversations.sql   # Conversations, messages
├── init_05_documents.sql       # Documents for RAG
├── init_06_products.sql        # Product categories, products
├── init_07_widgets.sql         # All widget tables
├── init_08_functions.sql       # Consolidated helper functions
└── init_09_agent_templates.sql # Seed data (plans + templates)
```

## Execution Order

**IMPORTANT**: Scripts must be executed in numerical order.

```bash
# Using psql directly
psql -U postgres -d postgres -f init_01_core.sql
psql -U postgres -d postgres -f init_02_subscriptions.sql
psql -U postgres -d postgres -f init_03_agents.sql
psql -U postgres -d postgres -f init_04_conversations.sql
psql -U postgres -d postgres -f init_05_documents.sql
psql -U postgres -d postgres -f init_06_products.sql
psql -U postgres -d postgres -f init_07_widgets.sql
psql -U postgres -d postgres -f init_08_functions.sql
psql -U postgres -d postgres -f init_09_agent_templates.sql
```

Or using Docker with Supabase:

```bash
# Execute all scripts in order
for file in init_*.sql; do
    echo "Executing $file..."
    docker exec -i supabase-db psql -U postgres -d postgres < "$file"
done
```

## Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles linked to auth.users |
| `subscription_plans` | Available subscription plans |
| `subscriptions` | User subscriptions (one per user) |
| `usage_metrics` | Monthly usage tracking |

### Agent System

| Table | Purpose |
|-------|---------|
| `agent_templates` | Pre-built agent templates |
| `agents` | User-owned AI agents |
| `conversations` | Chat conversations |
| `messages` | Individual messages |

### Content

| Table | Purpose |
|-------|---------|
| `documents_rag` | Documents for RAG system |
| `product_categories` | Product categorization |
| `products` | User products/services |

### Widgets (9 tables)

| Table | Purpose |
|-------|---------|
| `widget_links` | URL links |
| `widget_gallery` | Product galleries |
| `widget_agents` | AI agent chat widgets |
| `widget_youtube` | YouTube embeds |
| `widget_maps` | Google Maps embeds |
| `widget_spotify` | Spotify embeds |
| `widget_calendar` | Calendly scheduling |
| `widget_separator` | Visual separators |
| `widget_title` | Section titles |

## Key Design Decisions

### 1. Unified Identity: `user_id`

All tables use `user_id` as the foreign key to `profiles.id`, which equals `auth.users.id`.

```sql
-- Example
CREATE TABLE agents (
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE
);
```

### 2. Widget Positioning

Widgets have `position` and `is_active` fields directly in their tables (not in a JSONB column).

```sql
-- Each widget table has:
position integer NOT NULL DEFAULT 0,
is_active boolean DEFAULT true,
```

### 3. Subscription System

- One subscription per user (UNIQUE constraint)
- Limits stored as JSONB in plans
- Monthly usage tracking in `usage_metrics`
- Token tracking (input/output separate)

### 4. RLS Policies

Each table has Row Level Security policies defined in its own init file:
- Public data viewable by everyone
- User data manageable by owner
- Service role has full access

## Verification Queries

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check subscription plans
SELECT name, display_name, limits->>'agents' as agents_limit 
FROM subscription_plans;

-- Check agent templates
SELECT name, category, required_plan 
FROM agent_templates;

-- Verify foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public';
```

## Helper Functions

### User Management
- `handle_new_user()` - Triggered on auth.users insert
- `check_username_availability(username)` - Check if username is available
- `initialize_new_user(user_id)` - Set up subscription and usage record

### Subscription & Limits
- `get_user_subscription(user_id)` - Get current plan details
- `get_user_limits(user_id)` - Get plan limits as JSONB
- `check_resource_limit(user_id, type)` - Check if can create resource
- `check_monthly_limit(user_id, metric)` - Check usage limits

### Usage Tracking
- `get_user_current_usage(user_id)` - Get current period usage
- `increment_usage_metric(user_id, metric, amount)` - Increment counter
- `increment_token_usage(user_id, input, output)` - Track tokens
- `record_message_usage(user_id, tokens_in, tokens_out)` - Record message

### Widgets
- `get_user_widgets_ordered(user_id, active_only)` - Get all widgets sorted
- `get_next_widget_position(user_id)` - Get next available position
- `count_user_widgets_by_type(user_id, type)` - Count by type

### Agents
- `copy_agent_from_template(user_id, template_id, name)` - Create from template
- `get_agent_system_prompt(agent_id)` - Get computed prompt
- `get_agent_stats(agent_id)` - Get agent statistics

### Conversations
- `generate_conversation_id(user_id, session_id, agent_id)` - Deterministic ID
- `close_conversation(conversation_id)` - Close a conversation
- `archive_old_conversations(months)` - Archive old conversations
- `delete_old_conversations(months)` - Delete archived

### Dashboard
- `get_user_dashboard_stats(user_id)` - All stats in one call

## Plans Configuration

Default plans included:

| Plan | Agents | Documents | Messages/mo | Tokens In/mo | Price |
|------|--------|-----------|-------------|--------------|-------|
| Free | 1 | 5 | 500 | 50K | $0 |
| Pro | 5 | 50 | 5,000 | 500K | $19.99 |
| Business | 20 | 200 | 50,000 | 2M | $49.99 |
| Enterprise | ∞ | ∞ | ∞ | ∞ | $199.99 |

## Notes

1. **Supabase Auth Integration**: The `handle_new_user` trigger fires on `auth.users` insert to create profiles automatically.

2. **Service Role**: Backend services should use the `service_role` key to bypass RLS for admin operations.

3. **Token Tracking**: Messages track `tokens_input` and `tokens_output` separately for accurate billing.

4. **Conversation Cleanup**: Use `archive_old_conversations()` and `delete_old_conversations()` for maintenance (recommended: run monthly via pg_cron).
