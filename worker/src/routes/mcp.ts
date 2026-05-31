import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../services/encryption';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// List MCP servers
router.get('/', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase.from('mcp_servers')
    .select('id, name, server_url, tools, tools_whitelist, is_active, created_at, updated_at')
    .eq('user_id', c.get('userId')).order('created_at', { ascending: false });

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data || []);
});

// Create MCP server
router.post('/', async (c) => {
  const supabase = db(c);
  const body = await c.req.json();
  let encryptedKey: string | null = null;
  let nonce: string | null = null;

  if (body.api_key) {
    const result = await (await import('../services/encryption')).encrypt(body.api_key, c.env.MASTER_ENCRYPTION_KEY);
    encryptedKey = result.ciphertext;
    nonce = result.nonce;
  }

  const { data, error } = await supabase.from('mcp_servers').insert({
    user_id: c.get('userId'),
    name: body.name,
    server_url: body.server_url,
    api_key_encrypted: encryptedKey,
    api_key_nonce: nonce,
    tools_whitelist: body.tools_whitelist || [],
    is_active: body.is_active !== false,
  }).select('id, name, server_url, tools, tools_whitelist, is_active, created_at, updated_at').single();

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data, 201);
});

// Update MCP server
router.put('/:id', async (c) => {
  const supabase = db(c);
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  const allowed = ['name', 'server_url', 'api_key', 'tools_whitelist', 'is_active'];
  for (const k of allowed) {
    if (k in body) {
      if (k === 'api_key' && body.api_key) {
        // We'll handle api_key below
      } else {
        update[k] = body[k];
      }
    }
  }
  if (body.api_key) {
    const result = await (await import('../services/encryption')).encrypt(body.api_key, c.env.MASTER_ENCRYPTION_KEY);
    update.api_key_encrypted = result.ciphertext;
    update.api_key_nonce = result.nonce;
  }

  const { data, error } = await supabase.from('mcp_servers').update(update)
    .eq('id', c.req.param('id')).eq('user_id', c.get('userId'))
    .select('id, name, server_url, tools, tools_whitelist, is_active, created_at, updated_at').single();

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

// Delete MCP server
router.delete('/:id', async (c) => {
  const supabase = db(c);
  await supabase.from('mcp_servers').delete().eq('id', c.req.param('id')).eq('user_id', c.get('userId'));
  return c.body(null, 204);
});

// Discover tools from MCP server
router.post('/:id/discover', async (c) => {
  const supabase = db(c);
  const { data: server } = await supabase.from('mcp_servers').select('*').eq('id', c.req.param('id')).eq('user_id', c.get('userId')).single();

  if (!server) return c.json({ error: { type: 'invalid_request_error', message: 'Server not found' } }, 404);

  let authHeader = '';
  if (server.api_key_encrypted && server.api_key_nonce) {
    const key = await decrypt(server.api_key_encrypted, server.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);
    authHeader = `Bearer ${key}`;
  }

  try {
    const res = await fetch(`${server.server_url}/tools/list`, {
      method: 'GET',
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return c.json({ error: { type: 'server_error', message: `MCP server returned ${res.status}` } }, 502);
    }

    const data = await res.json() as any;
    const tools = data.tools || [];

    // Cache tools schema
    await supabase.from('mcp_servers').update({ tools }).eq('id', server.id);

    return c.json({ tools });
  } catch (err: any) {
    return c.json({ error: { type: 'server_error', message: err.message } }, 500);
  }
});

export default router;
