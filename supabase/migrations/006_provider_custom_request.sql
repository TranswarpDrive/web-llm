-- Migration 006: Per-provider custom request headers & body
-- Lets a provider attach extra HTTP headers and extra JSON body fields to
-- outgoing requests (useful for third-party gateways / proxies).

ALTER TABLE providers
    ADD COLUMN IF NOT EXISTS custom_headers JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS custom_body JSONB NOT NULL DEFAULT '{}';
