import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// List conversations
router.get('/', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const search = c.req.query('search');
  const archived = c.req.query('archived') === 'true';

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (!archived) {
    query = query.eq('is_archived', false);
  }

  if (search) {
    query = query.textSearch('search_vector', search);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data || []);
});

// Get single conversation with messages
router.get('/:id', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !conv) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Conversation not found' } }, 404);
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  return c.json({ ...conv, messages: messages || [] });
});

// Create conversation
router.post('/', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: body.title || 'New conversation',
      system_prompt: body.system_prompt || '',
      model_id: body.model_id || null,
      params: body.params || {},
      tools_config: body.tools_config || { enabled_tools: [], mcp_servers: [] },
      knowledge_base_ids: body.knowledge_base_ids || [],
    })
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data, 201);
});

// Update conversation
router.put('/:id', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const allowed = ['title', 'system_prompt', 'model_id', 'params', 'tools_config', 'knowledge_base_ids', 'is_archived'];
  const updateData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updateData[key] = body[key];
  }

  const { data, error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Delete conversation (cascade deletes messages)
router.delete('/:id', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const id = c.req.param('id');

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.body(null, 204);
});

// Add message to conversation
router.post('/:id/messages', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const conversationId = c.req.param('id');
  const body = await c.req.json<{ role: string; content: string | any[] }>();

  if (!body.role || body.content === undefined) {
    return c.json({ error: { type: 'invalid_request_error', message: 'role and content required' } }, 400);
  }

  // Verify conversation ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (!conv) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Conversation not found' } }, 404);
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: body.role,
      content: typeof body.content === 'string' ? body.content : JSON.stringify(body.content),
    })
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  // Update last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return c.json(data, 201);
});

// Update message
router.put('/:convId/messages/:msgId', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const convId = c.req.param('convId');
  const msgId = c.req.param('msgId');
  const body = await c.req.json<{ content: string }>();

  // Verify ownership via conversation
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', convId)
    .eq('user_id', userId)
    .single();

  if (!conv) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Conversation not found' } }, 404);
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ content: body.content })
    .eq('id', msgId)
    .eq('conversation_id', convId)
    .select('*')
    .single();

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.json(data);
});

// Delete message
router.delete('/:convId/messages/:msgId', async (c) => {
  const supabase = db(c);
  const userId = c.get('userId');
  const convId = c.req.param('convId');
  const msgId = c.req.param('msgId');

  // Verify ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', convId)
    .eq('user_id', userId)
    .single();

  if (!conv) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Conversation not found' } }, 404);
  }

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', msgId)
    .eq('conversation_id', convId);

  if (error) {
    return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  }

  return c.body(null, 204);
});

export default router;
