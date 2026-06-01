import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../services/encryption';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function autoTitle(convId: string, userId: string, content: string, supabase: any) {
  const title = typeof content === 'string'
    ? content.slice(0, 40).replace(/\n/g, ' ') + (content.length > 40 ? '...' : '')
    : 'Chat';
  await supabase.from('conversations').update({ title }).eq('id', convId).eq('user_id', userId);
}

// Wrap text as SSE chunk
function sseChunk(content: string, finish = false): string {
  const chunk = JSON.stringify({
    id: 'chatcmpl-' + Date.now(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: '',
    choices: [{ index: 0, delta: { content }, finish_reason: finish ? 'stop' : null }],
  });
  return `data: ${chunk}\n\n`;
}

function toolCallSSE(name: string, args: string, idx: number): string {
  const chunk = JSON.stringify({
    id: 'chatcmpl-' + Date.now(),
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: '',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{ index: idx, id: `call_${idx}`, type: 'function', function: { name, arguments: args } }],
      },
      finish_reason: null,
    }],
  });
  return `data: ${chunk}\n\n`;
}

// Execute a single tool call, return result text
async function executeTool(name: string, argsStr: string, env: Bindings, supabase: any, userId: string): Promise<string> {
  let args: any = {};
  try { args = JSON.parse(argsStr); } catch {}

  if (name === 'web_search') {
    const query = args.query || '';
    if (!query) return 'Error: query parameter required for web_search';

    const apiKey = env.BRAVE_API_KEY;
    if (!apiKey) return 'Brave Search API key not configured. Set BRAVE_API_KEY.';

    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
        { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return `Search failed: HTTP ${res.status}`;
      const data = await res.json() as any;
      const results = (data.web?.results || []).map((r: any, i: number) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description || ''}`
      );
      return results.length > 0 ? results.join('\n\n') : 'No results found.';
    } catch (e: any) { return `Search error: ${e.message}`; }
  }

  // Try MCP servers for other tools
  const { data: mcpServers } = await supabase.from('mcp_servers')
    .select('*').eq('user_id', userId).eq('is_active', true);

  if (mcpServers) {
    for (const server of mcpServers) {
      const whitelist = server.tools_whitelist || [];
      if (whitelist.length > 0 && !whitelist.includes(name)) continue;
      const tools = server.tools || [];
      if (tools.some((t: any) => t.name === name)) {
        try {
          let authHeader = '';
          if (server.api_key_encrypted && server.api_key_nonce) {
            const key = await decrypt(server.api_key_encrypted, server.api_key_nonce, env.MASTER_ENCRYPTION_KEY);
            authHeader = `Bearer ${key}`;
          }
          const res = await fetch(`${server.server_url}/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
            body: JSON.stringify({ name, arguments: args }),
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            const data = await res.json() as any;
            return JSON.stringify(data);
          }
        } catch {}
      }
    }
  }

  return `Tool "${name}" not available. Add it via an MCP server or check the whitelist.`;
}

async function callModel(
  baseUrl: string, apiKey: string, modelId: string,
  messages: any[], tools?: unknown[], stream = true,
  customHeaders?: Record<string, string>, customBody?: Record<string, unknown>
): Promise<Response> {
  // custom_body is merged first so explicit fields (model/messages/stream/tools) win.
  const body: Record<string, unknown> = { ...(customBody || {}), model: modelId, messages, stream };
  if (tools?.length) body.tools = tools;

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...(customHeaders || {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
}

router.post('/completions', async (c) => {
  const body = await c.req.json<{
    provider_id: string; model_id: string;
    messages: Array<{ role: string; content: any }>;
    params?: Record<string, unknown>; stream?: boolean; tools?: unknown[]; conversation_id?: string; knowledge_base_ids?: string[];
  }>();

  if (!body.provider_id || !body.model_id || !body.messages?.length) {
    return c.json({ error: { type: 'invalid_request_error', message: 'provider_id, model_id, and messages are required' } }, 400);
  }

  const supabase = db(c);
  const userId = c.get('userId');
  const isStream = body.stream !== false;

  // Fetch provider + model
  const { data: provider } = await supabase.from('providers')
    .select('*').eq('id', body.provider_id).eq('user_id', userId).eq('is_active', true).single();
  if (!provider) return c.json({ error: { type: 'invalid_request_error', message: 'Provider not found' } }, 404);

  const { data: model } = await supabase.from('models')
    .select('*').eq('id', body.model_id).eq('user_id', userId).eq('is_active', true).single();
  if (!model) return c.json({ error: { type: 'invalid_request_error', message: 'Model not found' } }, 404);

  // Build messages from conversation context
  let messages = body.messages;
  let conversationId = body.conversation_id;

  if (conversationId) {
    const { data: conv } = await supabase.from('conversations')
      .select('system_prompt, model_id, params').eq('id', conversationId).eq('user_id', userId).single();
    if (conv) {
      const { data: history } = await supabase.from('messages')
        .select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(50);
      const fullMessages: any[] = [];
      if (conv.system_prompt) fullMessages.push({ role: 'system', content: conv.system_prompt });
      if (history) for (const msg of history) {
        let content: any = msg.content;
        try { if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) content = JSON.parse(content); } catch {}
        fullMessages.push({ role: msg.role, content });
      }
      for (const msg of body.messages) fullMessages.push(msg);
      messages = fullMessages;
    }
  }

  // Save user message
  if (conversationId) {
    const userMsg = body.messages[body.messages.length - 1];
    if (userMsg) {
      const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
      await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content });
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversation_id', conversationId);
      if (count !== null && count <= 2) await autoTitle(conversationId, userId, content, supabase);
    }
  }

  const apiKey = await decrypt(provider.api_key_encrypted, provider.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);
  const customHeaders = (provider.custom_headers as Record<string, string>) || {};
  const customBody = (provider.custom_body as Record<string, unknown>) || {};
  const hasTools = body.tools && body.tools.length > 0;

  // --- RAG knowledge base injection ---
  let ragCitations: Array<{ index: number; document_name: string; chunk_content: string; similarity: number }> = [];
  if (body.knowledge_base_ids?.length) {
    const queryText = typeof body.messages[body.messages.length - 1]?.content === 'string'
      ? body.messages[body.messages.length - 1].content
      : '';

    if (queryText) {
      let allChunks: Array<{ content: string; document_name: string; similarity: number; document_id: string }> = [];

      for (const kbId of body.knowledge_base_ids) {
        try {
          const { data: kb } = await supabase.from('knowledge_bases')
            .select('id, retrieval_config, embedding_model_id')
            .eq('id', kbId).eq('user_id', userId).single();

          if (!kb || !kb.embedding_model_id) continue;

          const retrievalConf = kb.retrieval_config as any || {};
          const topK = retrievalConf.top_k || 5;
          const threshold = retrievalConf.similarity_threshold || 0.5;

          // Get embedding model and provider
          const { data: embModel } = await supabase.from('models')
            .select('*').eq('id', kb.embedding_model_id).single();

          if (!embModel) continue;

          const { data: embProv } = await supabase.from('providers')
            .select('*').eq('id', embModel.provider_id).single();

          if (!embProv) continue;

          const embKey = await decrypt(embProv.api_key_encrypted, embProv.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);

          // Embed the query
          const embRes = await fetch(`${embProv.base_url}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${embKey}` },
            body: JSON.stringify({ model: embModel.model_id, input: [queryText] }),
            signal: AbortSignal.timeout(15000),
          });

          if (!embRes.ok) continue;

          const embData = await embRes.json() as any;
          const queryEmbedding = embData.data?.[0]?.embedding;

          if (!queryEmbedding) continue;

          // Vector search via match_chunks RPC
          const { data: chunks } = await supabase.rpc('match_chunks', {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: threshold,
            match_count: topK,
            kb_id: kbId,
          });

          if (chunks?.length) {
            const { data: docs } = await supabase.from('documents')
              .select('id, filename').in('id', [...new Set(chunks.map((c: any) => c.document_id))]);

            const docMap = new Map((docs || []).map((d: any) => [d.id, d.filename]));

            for (const c of chunks) {
              allChunks.push({
                content: c.content,
                document_name: docMap.get(c.document_id) || 'Unknown',
                similarity: c.similarity,
                document_id: c.document_id,
              });
            }
          }
        } catch {} // KB search failure shouldn't block the chat
      }

      // Deduplicate and sort by similarity
      allChunks = allChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);

      // Build citations and context
      if (allChunks.length > 0) {
        ragCitations = allChunks.map((c, i) => ({
          index: i + 1,
          document_name: c.document_name,
          chunk_content: c.content,
          similarity: c.similarity,
        }));

        const context = allChunks.map((c, i) =>
          `[${i + 1}] Source: ${c.document_name} (relevance: ${(c.similarity * 100).toFixed(0)}%)\n${c.content}`
        ).join('\n\n');

        // Inject context as system message at the beginning
        messages = [
          {
            role: 'system',
            content: `You have access to the following reference material. Use it to answer the user's question. Cite sources using [1], [2], etc.\n\n## Reference Material\n\n${context}`,
          },
          ...messages,
        ];
      }
    }
  }

  try {
    // --- Tool calling loop ---
    if (hasTools) {
      // First call: non-streaming to check for tool_calls
      const firstRes = await callModel(provider.base_url, apiKey, model.model_id, messages, body.tools, false, customHeaders, customBody);

      if (!firstRes.ok) {
        const errText = await firstRes.text().catch(() => 'Unknown');
        let et = 'server_error';
        if (firstRes.status === 401 || firstRes.status === 403) et = 'authentication_error';
        else if (firstRes.status === 429) et = 'rate_limit_error';
        return c.json({ error: { type: et, message: `Provider error (${firstRes.status}): ${errText}` } }, firstRes.status as any);
      }

      const firstData = await firstRes.json() as any;
      const choice = firstData.choices?.[0];

      // Check if model wants to call tools
      if (choice?.message?.tool_calls?.length && choice.finish_reason === 'tool_calls') {
        const toolCalls = choice.message.tool_calls;
        console.log(`Executing ${toolCalls.length} tool calls`);

        // Execute all tools
        const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];
        for (const tc of toolCalls) {
          const result = await executeTool(tc.function.name, tc.function.arguments, c.env, supabase, userId);
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }

        // Build new messages: original + assistant (with tool_calls) + tool results
        const extendedMessages = [
          ...messages,
          choice.message,
          ...toolResults,
        ];

        if (isStream) {
          // Stream: send tool_call SSE chunks first, then stream final response
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              try {
                // Send tool_call SSE chunks so frontend can display them
                for (let i = 0; i < toolCalls.length; i++) {
                  const tc = toolCalls[i];
                  const chunk = toolCallSSE(tc.function.name, tc.function.arguments, i);
                  controller.enqueue(encoder.encode(chunk));
                }

                // Second call: streaming with tool results, no tools
                const secondRes = await callModel(provider.base_url, apiKey, model.model_id, extendedMessages, undefined, true, customHeaders, customBody);
                if (!secondRes.ok || !secondRes.body) {
                  const errText = secondRes.ok ? '' : await secondRes.text().catch(() => '');
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: `Final call failed: ${errText}` } })}\n\n`));
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }

                const reader = secondRes.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                  const text = decoder.decode(value, { stream: true });
                  const lines = text.split('\n');
                  for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                      try {
                        const ck = JSON.parse(line.slice(6));
                        const delta = ck.choices?.[0]?.delta?.content;
                        if (delta) fullContent += delta;
                      } catch {}
                    }
                  }
                }

                // Save assistant + tool messages
                if (conversationId) {
                  await supabase.from('messages').insert({
                    conversation_id: conversationId, role: 'assistant',
                    content: fullContent,
                    citations: ragCitations.length > 0 ? ragCitations : null,
                    tool_calls: toolCalls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
                    model_used: body.model_id,
                  });
                  for (const tr of toolResults) {
                    await supabase.from('messages').insert({ conversation_id: conversationId, role: 'tool', content: tr.content, tool_call_id: tr.tool_call_id });
                  }
                  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
                }

                controller.close();
              } catch (e) { controller.error(e); }
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
          });
        } else {
          // Non-streaming with tool results
          const secondRes = await callModel(provider.base_url, apiKey, model.model_id, extendedMessages, undefined, false, customHeaders, customBody);
          if (!secondRes.ok) {
            const errText = await secondRes.text().catch(() => '');
            return c.json({ error: { type: 'server_error', message: `Final call failed: ${errText}` } }, 502);
          }
          const secondData = await secondRes.json() as any;
          // Augment with tool call info
          secondData._tool_calls = toolCalls;
          if (conversationId) {
            const finalMsg = secondData.choices?.[0]?.message;
            await supabase.from('messages').insert({
              conversation_id: conversationId, role: 'assistant',
              content: finalMsg?.content || JSON.stringify(finalMsg),
              tool_calls: toolCalls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
              model_used: body.model_id,
            });
            await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
          }
          return c.json(secondData);
        }
      }

      // No tool calls — model answered directly. Return as streaming or non-streaming
      const msg = choice?.message;
      if (msg && isStream) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            // Simulate SSE from the non-streaming response
            let pos = 0; const chunkSize = 10;
            while (pos < content.length) {
              const chunk = content.slice(pos, pos + chunkSize);
              controller.enqueue(encoder.encode(sseChunk(chunk)));
              pos += chunkSize;
            }
            controller.enqueue(encoder.encode(sseChunk('', true)));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        if (conversationId) {
          await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content, citations: ragCitations.length > 0 ? ragCitations : null, model_used: body.model_id });
          await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
        }
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        });
      }

      // Non-streaming, no tools
      if (conversationId && msg) {
        await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: JSON.stringify(msg), citations: ragCitations.length > 0 ? ragCitations : null, model_used: body.model_id });
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      }
      return c.json(firstData);
    }

    // --- No tools: plain streaming or non-streaming ---
    const response = await callModel(provider.base_url, apiKey, model.model_id, messages, undefined, isStream, customHeaders, customBody);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      let errorType = 'server_error';
      if (response.status === 401 || response.status === 403) errorType = 'authentication_error';
      else if (response.status === 429) errorType = 'rate_limit_error';
      else if (response.status === 400) errorType = 'invalid_request_error';
      return c.json({ error: { type: errorType, message: `Provider error (${response.status}): ${errorText}` } }, response.status as 400 | 401 | 403 | 429 | 500);
    }

    if (!isStream) {
      const data = await response.json() as any;
      if (conversationId && data.choices?.[0]?.message) {
        await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: JSON.stringify(data.choices[0].message), citations: ragCitations.length > 0 ? ragCitations : null, model_used: body.model_id });
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      }
      return c.json(data);
    }

    // Streaming without saving
    if (response.body) {
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
              const text = decoder.decode(value, { stream: true });
              const lines = text.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const ck = JSON.parse(line.slice(6));
                    const delta = ck.choices?.[0]?.delta?.content;
                    if (delta) fullContent += delta;
                  } catch {}
                }
              }
            }
            controller.close();
            if (conversationId) {
              await supabase.from('messages').insert({ conversation_id: conversationId, role: 'assistant', content: fullContent, citations: ragCitations.length > 0 ? ragCitations : null, model_used: body.model_id });
              await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
            }
          } catch (e) { controller.error(e); }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      });
    }

    return c.json({ error: { type: 'server_error', message: 'No response body' } }, 500);
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return c.json({ error: { type: 'timeout_error', message: 'Request timed out' } }, 504);
    }
    return c.json({ error: { type: 'server_error', message: err instanceof Error ? err.message : 'Unknown error' } }, 500);
  }
});

export default router;
