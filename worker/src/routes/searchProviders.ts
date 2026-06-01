import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { encrypt, decrypt } from '../services/encryption';
import { executeSearch } from '../services/webSearch';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SELECT = 'id, name, engine, base_url, config, is_active, is_default, sort_order, created_at, updated_at';

const schema = z.object({
  name: z.string().min(1),
  engine: z.enum(['brave', 'tavily', 'searxng', 'bing']).default('brave'),
  api_key: z.string().optional(),
  base_url: z.string().url().optional().or(z.literal('')),
  config: z.record(z.any()).default({}),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  sort_order: z.number().default(0),
});
const updateSchema = schema.partial();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Ensure only one default per user.
async function clearOtherDefaults(supabase: any, userId: string, exceptId?: string) {
  let q = supabase.from('search_providers').update({ is_default: false }).eq('user_id', userId).eq('is_default', true);
  if (exceptId) q = q.neq('id', exceptId);
  await q;
}

router.get('/', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase
    .from('search_providers')
    .select(SELECT)
    .eq('user_id', c.get('userId'))
    .order('sort_order', { ascending: true });
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

router.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  }
  const supabase = db(c);
  const userId = c.get('userId');
  const { api_key, base_url, ...rest } = parsed.data;

  const row: Record<string, unknown> = { ...rest, base_url: base_url || null, user_id: userId };
  if (api_key) {
    const { ciphertext, nonce } = await encrypt(api_key, c.env.MASTER_ENCRYPTION_KEY);
    row.api_key_encrypted = ciphertext;
    row.api_key_nonce = nonce;
  }

  if (parsed.data.is_default) await clearOtherDefaults(supabase, userId);

  const { data, error } = await supabase.from('search_providers').insert(row).select(SELECT).single();
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data, 201);
});

router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  }
  const supabase = db(c);
  const userId = c.get('userId');
  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.api_key) {
    const { ciphertext, nonce } = await encrypt(parsed.data.api_key, c.env.MASTER_ENCRYPTION_KEY);
    updateData.api_key_encrypted = ciphertext;
    updateData.api_key_nonce = nonce;
  }
  delete updateData.api_key;
  if ('base_url' in updateData) updateData.base_url = (updateData.base_url as string) || null;

  if (parsed.data.is_default) await clearOtherDefaults(supabase, userId, id);

  const { data, error } = await supabase
    .from('search_providers').update(updateData).eq('id', id).eq('user_id', userId).select(SELECT).single();
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

router.delete('/:id', async (c) => {
  const supabase = db(c);
  const { error } = await supabase
    .from('search_providers').delete().eq('id', c.req.param('id')).eq('user_id', c.get('userId'));
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.body(null, 204);
});

// Test a configured search provider with a sample query.
router.post('/:id/test', async (c) => {
  const supabase = db(c);
  const { data: row } = await supabase
    .from('search_providers')
    .select('engine, api_key_encrypted, api_key_nonce, base_url, config')
    .eq('id', c.req.param('id'))
    .eq('user_id', c.get('userId'))
    .single();
  if (!row) return c.json({ status: 'error', message: 'Search provider not found' }, 404);

  let apiKey: string | undefined;
  if (row.api_key_encrypted && row.api_key_nonce) {
    apiKey = await decrypt(row.api_key_encrypted, row.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);
  }
  try {
    const results = await executeSearch(
      { engine: row.engine, apiKey, baseUrl: row.base_url || undefined, config: row.config || {} },
      'OpenAI', 3
    );
    return c.json({ status: 'ok', result_count: results.length });
  } catch (err: any) {
    return c.json({ status: 'error', message: err?.message || '搜索失败' });
  }
});

export default router;
