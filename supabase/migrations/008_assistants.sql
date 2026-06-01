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
