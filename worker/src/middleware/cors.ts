import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
];

export async function corsMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: () => Promise<void>
) {
  const origin = c.req.header('Origin');

  // Production origins (e.g. the GitHub Pages site) come from the CORS_ORIGINS
  // env var, comma-separated, merged with the localhost dev defaults.
  const envOrigins = (c.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const allowed = [...DEFAULT_ORIGINS, ...envOrigins];

  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  }

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}
