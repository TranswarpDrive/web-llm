import type { Hono } from 'hono';

// Bindings are set via wrangler.toml vars or `wrangler secret put`
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MASTER_ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  BRAVE_API_KEY?: string;
};

export type Variables = {
  userId: string;
  username: string;
};

export type AppType = Hono<{ Bindings: Bindings; Variables: Variables }>;
