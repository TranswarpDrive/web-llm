import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  // Add production domain when deployed
];

export async function corsMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: () => Promise<void>
) {
  const origin = c.req.header('Origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
  }

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}
