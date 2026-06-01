import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const schema = z.object({
  name: z.string().min(1),
  emoji: z.string().default(''),
  system_prompt: z.string().default(''),
  default_model_id: z.string().uuid().nullable().optional(),
  params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
  }).default({}),
  is_default: z.boolean().default(false),
  sort_order: z.number().default(0),
});
const updateSchema = schema.partial();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function clearOtherDefaults(supabase: any, userId: string, exceptId?: string) {
  let q = supabase.from('assistants').update({ is_default: false }).eq('user_id', userId).eq('is_default', true);
  if (exceptId) q = q.neq('id', exceptId);
  await q;
}

router.get('/', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase
    .from('assistants')
    .select('*')
    .eq('user_id', c.get('userId'))
    .order('sort_order', { ascending: true });
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

router.post('/', async (c) => {
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  }
  const supabase = db(c);
  const userId = c.get('userId');
  if (parsed.data.is_default) await clearOtherDefaults(supabase, userId);

  const { data, error } = await supabase
    .from('assistants').insert({ ...parsed.data, user_id: userId }).select('*').single();
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data, 201);
});

router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  }
  const supabase = db(c);
  const userId = c.get('userId');
  if (parsed.data.is_default) await clearOtherDefaults(supabase, userId, id);

  const { data, error } = await supabase
    .from('assistants').update(parsed.data).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

router.delete('/:id', async (c) => {
  const supabase = db(c);
  const { error } = await supabase
    .from('assistants').delete().eq('id', c.req.param('id')).eq('user_id', c.get('userId'));
  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.body(null, 204);
});

export default router;
