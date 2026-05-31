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
