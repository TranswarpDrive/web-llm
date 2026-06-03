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
