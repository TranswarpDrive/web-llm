import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';
import { verifyToken } from '../services/jwt';

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: () => Promise<void>
) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: { type: 'authentication_error', message: 'Missing authorization header' } },
      401
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(
      { error: { type: 'authentication_error', message: 'Invalid or expired token' } },
      401
    );
  }

  // Set user info for downstream handlers
  c.set('userId', payload.userId);
  c.set('username', payload.username);

  await next();
}
