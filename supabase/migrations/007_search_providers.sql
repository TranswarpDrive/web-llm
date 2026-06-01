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
