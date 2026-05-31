-- Migration 003: Conversations and Messages

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New conversation',
    system_prompt TEXT NOT NULL DEFAULT '',
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    params JSONB NOT NULL DEFAULT '{}',
    tools_config JSONB NOT NULL DEFAULT '{"enabled_tools": [], "mcp_servers": []}',
    knowledge_base_ids UUID[] NOT NULL DEFAULT '{}',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Full-text search on conversation titles
ALTER TABLE conversations ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, ''))) STORED;

CREATE INDEX idx_conversations_search ON conversations USING GIN (search_vector);
CREATE INDEX idx_conversations_user_last ON conversations(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_conversations_user_archived ON conversations(user_id, is_archived) WHERE is_archived = false;

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content JSONB NOT NULL,
    tool_calls JSONB,
    tool_call_id TEXT,
    citations JSONB,
    token_count INTEGER,
    model_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);
