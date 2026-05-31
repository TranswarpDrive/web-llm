import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const modelSchema = z.object({
  provider_id: z.string().uuid(),
  model_id: z.string().min(1),
  display_name: z.string().min(1),
  type: z.enum(['chat', 'vision', 'embedding', 'rerank', 'reasoning']).default('chat'),
  capabilities: z.object({
    chat: z.boolean().default(true),
    vision: z.boolean().default(false),
    reasoning: z.boolean().default(false),
    image_gen: z.boolean().default(false),
    tool_calling: z.boolean().default(false),
    embedding: z.boolean().default(false),
    rerank: z.boolean().default(false),
  }).default({}),
  default_params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
  }).default({}),
  is_default_per_type: z.boolean().default(false),
  is_active: z.boolean().default(true),
  sort_order: z.number().default(0),
});

const updateSchema = modelSchema.partial();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// List models
router.get('/', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const providerId = c.req.query('provider_id');
  const type = c.req.query('type');

  let query = supabase
    .from('models')
    .select('*')
    .eq('user_id', userId);

  if (providerId) query = query.eq('provider_id', providerId);
  if (type) query = query.eq('type', type);

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Create model
router.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = modelSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({
      error: { type: 'invalid_request_error', message: parsed.error.issues.map(i => i.message).join(', ') }
    }, 400);
  }

  const supabase = db(c);
  const userId = c.get('userId');

  // If setting as default, unset other defaults of the same type
  if (parsed.data.is_default_per_type) {
    await supabase
      .from('models')
      .update({ is_default_per_type: false })
      .eq('user_id', userId)
      .eq('type', parsed.data.type)
      .eq('is_default_per_type', true);
  }

  const { data, error } = await supabase
    .from('models')
    .insert({
      ...parsed.data,
      user_id: userId,
    })
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data, 201);
});

// Update model
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
  const userId = c.get('userId');

  // Handle default type toggling
  if (parsed.data.is_default_per_type) {
    // Get current model to know its type
    const { data: current } = await supabase
      .from('models')
      .select('type')
      .eq('id', id)
      .single();

    if (current) {
      const targetType = parsed.data.type || current.type;
      await supabase
        .from('models')
        .update({ is_default_per_type: false })
        .eq('user_id', userId)
        .eq('type', targetType)
        .eq('is_default_per_type', true);
    }
  }

  const { data, error } = await supabase
    .from('models')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Delete model
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = db(c);

  const { error } = await supabase
    .from('models')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', c.get('userId'));

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.body(null, 204);
});

export default router;
