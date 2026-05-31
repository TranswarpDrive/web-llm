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
