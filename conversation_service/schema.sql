-- Extensión para UUIDs (por si no está habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de conversaciones simplificada para CRM
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    session_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    
    -- Timestamps para CRM
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    
    -- Estado
    is_active BOOLEAN DEFAULT TRUE,
    message_count INTEGER DEFAULT 0,
    
    -- Constraint único
    CONSTRAINT unique_conversation UNIQUE(tenant_id, session_id, agent_id)
);

-- Tabla de mensajes (solo user y assistant)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata opcional
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversations_dates ON conversations(started_at, ended_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Función para actualizar message_count
CREATE OR REPLACE FUNCTION update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET message_count = message_count + 1
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar contador
DROP TRIGGER IF EXISTS update_message_count_on_insert ON messages;
CREATE TRIGGER update_message_count_on_insert
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_message_count();

-- Vista para CRM (conversaciones con resumen)
CREATE OR REPLACE VIEW crm_conversations AS
SELECT 
    c.id,
    c.tenant_id,
    c.session_id,
    c.agent_id,
    c.started_at,
    c.ended_at,
    c.is_active,
    c.message_count,
    CASE 
        WHEN c.ended_at IS NOT NULL THEN c.ended_at - c.started_at
        ELSE NOW() - c.started_at
    END as duration,
    COUNT(m.id) FILTER (WHERE m.role = 'user') as user_messages,
    COUNT(m.id) FILTER (WHERE m.role = 'assistant') as agent_messages,
    MIN(m.created_at) FILTER (WHERE m.role = 'user') as first_user_message_at,
    MAX(m.created_at) FILTER (WHERE m.role = 'assistant') as last_agent_message_at
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id;

-- Comentarios para documentación
COMMENT ON TABLE conversations IS 'Almacena las conversaciones entre usuarios y agentes';
COMMENT ON TABLE messages IS 'Almacena los mensajes de cada conversación';
COMMENT ON VIEW crm_conversations IS 'Vista optimizada para consultas desde CRM';