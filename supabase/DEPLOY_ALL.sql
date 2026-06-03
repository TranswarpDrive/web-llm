-- WebLLM — consolidated schema (migrations 001–008)
-- Run once in the Supabase SQL Editor on a fresh project, or use 'supabase db push'.
-- Order matters; do not reorder.

-- ============================================================
-- 001_initial_core.sql
-- ============================================================
-- Migration 001: Initial core schema
-- Foundation tables, RLS policies, and seed admin user

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create users table (self-contained auth, not tied to Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed admin user with a locked placeholder password.
-- Before production login, run `npm run hash-password` and apply the generated SQL.
INSERT INTO users (username, display_name, password_hash, password_salt) VALUES (
    'admin',
    'Admin',
    'n9LwYIU5JwVT0XuehMW6uVKrQfNJAF/fb4QzMUzT5a8=',
    'O+vbTSirLSIqsjMoKemdwmKM1k4YV3j4RDSjrpd0Vfk='
) ON CONFLICT (username) DO NOTHING;

-- Enable Row Level Security (single-user but still best practice)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- For simplicity in single-user mode, allow all operations on own data
-- Since the worker uses service_role, RLS is bypassed on server side
-- These policies apply if anon key is used directly
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (id = auth.uid());

-- ============================================================
-- 002_providers_models.sql
-- ============================================================
-- Migration 002: Providers and Models

-- Providers table
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_key_nonce TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '{"chat": false, "vision": false, "embedding": false, "rerank": false}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_providers_updated_at
    BEFORE UPDATE ON providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

-- Model type enum
CREATE TYPE model_type AS ENUM ('chat', 'vision', 'embedding', 'rerank', 'reasoning');

-- Models table
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    type model_type NOT NULL DEFAULT 'chat',
    capabilities JSONB NOT NULL DEFAULT '{}',
    default_params JSONB NOT NULL DEFAULT '{"temperature": 0.7, "max_tokens": 4096, "top_p": 1.0}',
    is_default_per_type BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_providers_user_active ON providers(user_id, is_active);
CREATE INDEX idx_models_user_active ON models(user_id, is_active);
CREATE INDEX idx_models_provider ON models(provider_id);
CREATE INDEX idx_models_type_default ON models(user_id, type, is_default_per_type) WHERE is_active = true;

-- ============================================================
-- 003_conversations_messages.sql
-- ============================================================
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

-- ============================================================
-- 004_rag.sql
-- ============================================================
-- Migration 004: RAG Knowledge Bases

CREATE TABLE knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    chunk_strategy JSONB NOT NULL DEFAULT '{"chunk_size": 1000, "chunk_overlap": 200, "separator": "\n\n"}',
    retrieval_config JSONB NOT NULL DEFAULT '{"top_k": 5, "similarity_threshold": 0.7, "chunk_limit": 10}',
    embedding_model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    rerank_model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER update_kb_updated_at BEFORE UPDATE ON knowledge_bases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_kb_user ON knowledge_bases(user_id);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    storage_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
    error_message TEXT,
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER update_docs_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_docs_kb ON documents(knowledge_base_id);

CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_chunks_doc ON chunks(document_id);
CREATE INDEX idx_chunks_kb ON chunks(knowledge_base_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Vector similarity search function for RAG
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding TEXT,
    match_threshold FLOAT,
    match_count INT,
    kb_id UUID
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    chunk_index INT,
    document_id UUID,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content,
        c.chunk_index,
        c.document_id,
        c.metadata,
        1 - (c.embedding <=> query_embedding::vector) AS similarity
    FROM chunks c
    WHERE c.knowledge_base_id = kb_id
      AND 1 - (c.embedding <=> query_embedding::vector) > match_threshold
    ORDER BY c.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- ============================================================
-- 005_mcp.sql
-- ============================================================
-- Migration 005: MCP Servers

CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    server_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    api_key_nonce TEXT,
    tools JSONB DEFAULT '[]',
    tools_whitelist TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER update_mcp_updated_at BEFORE UPDATE ON mcp_servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_mcp_user ON mcp_servers(user_id);

-- ============================================================
-- 006_provider_custom_request.sql
-- ============================================================
-- Migration 006: Per-provider custom request headers & body
-- Lets a provider attach extra HTTP headers and extra JSON body fields to
-- outgoing requests (useful for third-party gateways / proxies).

ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS custom_headers JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS custom_body JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- 007_search_providers.sql
-- ============================================================
-- Migration 007: Search providers
-- Web search engines managed as first-class providers, sibling to model providers.
-- The chat `web_search` tool resolves the default active search provider at call time.

CREATE TABLE search_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    engine TEXT NOT NULL DEFAULT 'brave',          -- brave | tavily | searxng | bing
    api_key_encrypted TEXT,
    api_key_nonce TEXT,
    base_url TEXT,                                  -- for self-hosted engines (e.g. SearXNG)
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_search_providers_updated_at
    BEFORE UPDATE ON search_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE search_providers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_search_providers_user_active ON search_providers(user_id, is_active);
CREATE INDEX idx_search_providers_default ON search_providers(user_id, is_default) WHERE is_active = true;

-- ============================================================
-- 008_assistants.sql
-- ============================================================
-- Migration 008: Assistants
-- A reusable bundle of system prompt + default model + params. The system prompt
-- may contain variables ({model}, {date}, {time}, {datetime}) rendered at send time.

CREATE TABLE assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    default_model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    params JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_assistants_updated_at
    BEFORE UPDATE ON assistants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_assistants_user ON assistants(user_id, sort_order);
