import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../services/encryption';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Auto-title helper: use last 30 chars of first user message, truncated
async function autoTitle(convId: string, userId: string, content: string, supabase: any) {
  // Simple heuristic: use first 40 chars of first user message
  const title = typeof content === 'string'
    ? content.slice(0, 40).replace(/\n/g, ' ') + (content.length > 40 ? '...' : '')
    : 'Chat';

  await supabase
    .from('conversations')
    .update({ title })
    .eq('id', convId)
    .eq('user_id', userId);
}

router.post('/completions', async (c) => {
  const body = await c.req.json<{
    provider_id: string;
    model_id: string;
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
    params?: { temperature?: number; max_tokens?: number; top_p?: number };
    stream?: boolean;
    tools?: unknown[];
    conversation_id?: string;
  }>();

  if (!body.provider_id || !body.model_id || !body.messages?.length) {
    return c.json({
      error: { type: 'invalid_request_error', message: 'provider_id, model_id, and messages are required' }
    }, 400);
  }

  const supabase = db(c);
  const userId = c.get('userId');
  const isStream = body.stream !== false;

  // Fetch provider with encrypted API key
  const { data: provider } = await supabase
    .from('providers')
    .select('api_key_encrypted, api_key_nonce, base_url, capabilities')
    .eq('id', body.provider_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!provider) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Provider not found or inactive' } }, 404);
  }

  // Fetch model
  const { data: model } = await supabase
    .from('models')
    .select('model_id, type, default_params')
    .eq('id', body.model_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!model) {
    return c.json({ error: { type: 'invalid_request_error', message: 'Model not found or inactive' } }, 404);
  }

  // Build messages array from conversation context if conversation_id provided
  let messages = body.messages;
  let conversationId = body.conversation_id;

  if (conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('system_prompt, model_id, params')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (conv) {
      // Load recent messages from conversation
      const { data: history } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(50);

      // Build full message array: system prompt + history + current
      const fullMessages: any[] = [];

      if (conv.system_prompt) {
        fullMessages.push({ role: 'system', content: conv.system_prompt });
      }

      if (history) {
        for (const msg of history) {
          let content: any = msg.content;
          // Try to parse JSON content (for multi-modal messages)
          try {
            if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
              content = JSON.parse(content);
            }
          } catch {}
          fullMessages.push({ role: msg.role, content });
        }
      }

      // Add the current user message(s)
      for (const msg of body.messages) {
        fullMessages.push(msg);
      }

      messages = fullMessages;
    }
  }

  // Save user message if conversation_id provided
  if (conversationId) {
    const userMsg = body.messages[body.messages.length - 1];
    if (userMsg) {
      const userContent = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: userContent,
      });

      // Auto-title on first exchange
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);

      if (count !== null && count <= 2) {
        await autoTitle(conversationId, userId, userContent, supabase);
      }
    }
  }

  // Decrypt API key
  const apiKey = await decrypt(
    provider.api_key_encrypted,
    provider.api_key_nonce,
    c.env.MASTER_ENCRYPTION_KEY
  );

  // Build request
  const params = { ...model.default_params, ...body.params };
  const requestBody: Record<string, unknown> = {
    model: model.model_id,
    messages,
    stream: isStream,
    ...params,
  };

  if (body.tools?.length) {
    requestBody.tools = body.tools;
  }

  try {
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      let errorType = 'server_error';
      if (response.status === 401 || response.status === 403) errorType = 'authentication_error';
      else if (response.status === 429) errorType = 'rate_limit_error';
      else if (response.status === 400) errorType = 'invalid_request_error';

      return c.json({
        error: { type: errorType, message: `Provider error (${response.status}): ${errorText}` }
      }, response.status as 400 | 401 | 403 | 429 | 500);
    }

    if (!isStream) {
      const data = await response.json() as any;
      // Save assistant response
      if (conversationId && data.choices?.[0]?.message) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: JSON.stringify(data.choices[0].message),
          model_used: body.model_id,
        });
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      }
      return c.json(data);
    }

    // For streaming, we need to return the stream AND save the response
    // Use a transform stream to collect the full response while forwarding
    if (conversationId && response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          let fullContent = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);

              // Accumulate content from SSE chunks
              const text = decoder.decode(value, { stream: true });
              const lines = text.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const chunk = JSON.parse(line.slice(6));
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (delta) fullContent += delta;
                  } catch {}
                }
              }
            }
            controller.close();

            // Save to DB
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullContent,
              model_used: body.model_id,
            });
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
          } catch (e) {
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Stream without saving (no conversation_id)
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return c.json({
        error: { type: 'timeout_error', message: 'Request to model provider timed out' }
      }, 504);
    }
    return c.json({
      error: { type: 'server_error', message: err instanceof Error ? err.message : 'Unknown error' }
    }, 500);
  }
});

export default router;
