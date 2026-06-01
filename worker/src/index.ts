import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { verifyPassword } from './services/auth';
import { signToken } from './services/jwt';
import providerRoutes from './routes/providers';
import searchProviderRoutes from './routes/searchProviders';
import modelRoutes from './routes/models';
import chatRoutes from './routes/chat';
import conversationRoutes from './routes/conversations';
import ragRoutes from './routes/rag';
import mcpRoutes from './routes/mcp';
import toolRoutes from './routes/tools';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Dev mode: check if Supabase is configured
function isDevMode(env: Bindings): boolean {
  return !env.SUPABASE_URL || env.SUPABASE_URL === 'https://your-project.supabase.co';
}

// Global middleware
app.use('*', corsMiddleware);

// --- Public routes (no auth required) ---

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || !password) {
    return c.json(
      { error: { type: 'invalid_request_error', message: 'Username and password required' } },
      400
    );
  }

  const user = await verifyPassword(username, password, c.env);
  if (!user) {
    return c.json(
      { error: { type: 'authentication_error', message: 'Invalid username or password' } },
      401
    );
  }

  const token = await signToken(
    { userId: user.userId, username: user.username },
    c.env.JWT_SECRET
  );

  return c.json({ token, user: { id: user.userId, username: user.username } });
});

app.get('/api/auth/me', authMiddleware, (c) => {
  return c.json({
    user: {
      id: c.get('userId'),
      username: c.get('username'),
    },
  });
});

// --- Protected routes ---
const api = app.basePath('/api');

// Step 1: Auth check (skip for public routes)
api.use('*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/health' || path === '/api/auth/login') return next();
  return authMiddleware(c, next);
});

// Step 2: Dev mode guard (return empty data without hitting Supabase)
api.use('*', async (c, next) => {
  if (isDevMode(c.env)) {
    const path = c.req.path;
    const method = c.req.method;

    // Chat: return clear message
    if (path === '/api/chat/completions') {
      return c.json({
        error: { type: 'server_error', message: 'Dev mode: configure Supabase in .dev.vars to enable chat' }
      }, 503);
    }

    // All other data endpoints: return empty responses instantly
    if (method === 'GET') return c.json([]);
    if (method === 'POST') return c.json({ id: 'dev-mode' }, 201);
    if (method === 'DELETE') return c.body(null, 204);
    if (method === 'PUT') return c.json({});
  }
  return next();
});

// Phase 2: Providers, Models, Chat
// Phase 3: Conversations
api.route('/providers', providerRoutes);
api.route('/search-providers', searchProviderRoutes);
api.route('/models', modelRoutes);
api.route('/chat', chatRoutes);
api.route('/conversations', conversationRoutes);
api.route('/knowledge-bases', ragRoutes);
api.route('/mcp-servers', mcpRoutes);
api.route('/tools', toolRoutes);

// Phase 5: Tools
// (mounted above)

// Phase 5: Files (stub)

// Phase 6: Config sync
api.post('/config/sync', async (c) => c.json({ synced: true }));

export default app;
