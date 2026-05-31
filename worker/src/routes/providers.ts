import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { encrypt, decrypt } from '../services/encryption';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const providerSchema = z.object({
  name: z.string().min(1),
  base_url: z.string().url(),
  api_key: z.string().min(1),
  capabilities: z.object({
    chat: z.boolean().default(false),
    vision: z.boolean().default(false),
    embedding: z.boolean().default(false),
    rerank: z.boolean().default(false),
  }).default({}),
  is_active: z.boolean().default(true),
  sort_order: z.number().default(0),
});

const updateSchema = providerSchema.partial();

// Get Supabase client
function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// List all providers (no sensitive data)
router.get('/', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');

  const { data, error } = await supabase
    .from('providers')
    .select('id, name, base_url, capabilities, is_active, sort_order, created_at, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Create provider
router.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = providerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') }
    }, 400);
  }

  const { api_key, ...rest } = parsed.data;
  const { ciphertext, nonce } = await encrypt(api_key, c.env.MASTER_ENCRYPTION_KEY);

  const supabase = db(c);
  const { data, error } = await supabase
    .from('providers')
    .insert({
      ...rest,
      user_id: c.get('userId'),
      api_key_encrypted: ciphertext,
      api_key_nonce: nonce,
    })
    .select('id, name, base_url, capabilities, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data, 201);
});

// Update provider
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') }
    }, 400);
  }

  const supabase = db(c);
  const updateData: Record<string, unknown> = { ...parsed.data };

  // If updating API key, encrypt it
  if (parsed.data.api_key) {
    const { ciphertext, nonce } = await encrypt(parsed.data.api_key, c.env.MASTER_ENCRYPTION_KEY);
    updateData.api_key_encrypted = ciphertext;
    updateData.api_key_nonce = nonce;
  }
  delete updateData.api_key;

  const { data, error } = await supabase
    .from('providers')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', c.get('userId'))
    .select('id, name, base_url, capabilities, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Delete provider (soft delete)
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = db(c);

  const { error } = await supabase
    .from('providers')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', c.get('userId'));

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.body(null, 204);
});

// Test connection
router.post('/:id/test', async (c) => {
  const id = c.req.param('id');
  const supabase = db(c);

  const { data: provider } = await supabase
    .from('providers')
    .select('api_key_encrypted, api_key_nonce, base_url')
    .eq('id', id)
    .eq('user_id', c.get('userId'))
    .single();

  if (!provider) {
    return c.json({ error: { type: 'server_error', message: 'Provider not found' } }, 404);
  }

  const apiKey = await decrypt(provider.api_key_encrypted, provider.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);

  try {
    const res = await fetch(`${provider.base_url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const models = await res.json() as any;
      const modelCount = models.data?.length || models.length || 0;
      return c.json({ status: 'ok', model_count: modelCount });
    }

    return c.json({
      status: 'error',
      message: `HTTP ${res.status}: ${await res.text().catch(() => 'Unknown error')}`
    });
  } catch (err) {
    return c.json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Connection failed'
    });
  }
});

// Fetch available model list from provider
router.post('/:id/remote-models', async (c) => {
  const id = c.req.param('id');
  const supabase = db(c);

  const { data: provider } = await supabase
    .from('providers')
    .select('api_key_encrypted, api_key_nonce, base_url')
    .eq('id', id)
    .eq('user_id', c.get('userId'))
    .single();

  if (!provider) {
    return c.json({ error: { type: 'server_error', message: 'Provider not found' } }, 404);
  }

  const apiKey = await decrypt(provider.api_key_encrypted, provider.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);

  try {
    const res = await fetch(`${provider.base_url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return c.json({
        error: { type: 'server_error', message: `Provider responded with ${res.status}` }
      }, 502);
    }

    const data = await res.json() as any;
    // OpenAI-compatible format: { object: "list", data: [{ id: "gpt-4o", ... }] }
    const models = (data.data || data).map((m: any) => ({
      id: m.id,
      owned_by: m.owned_by || '',
      created: m.created,
    }));

    return c.json({ models });
  } catch (err) {
    return c.json({
      error: { type: 'server_error', message: err instanceof Error ? err.message : 'Failed to fetch models' }
    }, 500);
  }
});

export default router;
