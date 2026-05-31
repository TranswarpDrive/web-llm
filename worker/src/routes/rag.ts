import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../services/encryption';
import { chunkText } from '../services/chunking';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function db(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
}

// List knowledge bases
router.get('/', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*, documents:documents(count)')
    .eq('user_id', c.get('userId'))
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data || []);
});

// Get single KB
router.get('/:id', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('id', c.req.param('id'))
    .eq('user_id', c.get('userId'))
    .single();

  if (error || !data) return c.json({ error: { type: 'invalid_request_error', message: 'Not found' } }, 404);
  return c.json(data);
});

// Create KB
router.post('/', async (c) => {
  const supabase = db(c);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from('knowledge_bases')
    .insert({
      user_id: c.get('userId'),
      name: body.name || 'New KB',
      description: body.description || '',
      chunk_strategy: body.chunk_strategy || {},
      retrieval_config: body.retrieval_config || {},
      embedding_model_id: body.embedding_model_id || null,
      rerank_model_id: body.rerank_model_id || null,
    })
    .select('*').single();

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data, 201);
});

// Update KB
router.put('/:id', async (c) => {
  const supabase = db(c);
  const body = await c.req.json();
  const allowed = ['name', 'description', 'chunk_strategy', 'retrieval_config', 'embedding_model_id', 'rerank_model_id', 'is_active'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  const { data, error } = await supabase
    .from('knowledge_bases').update(update)
    .eq('id', c.req.param('id')).eq('user_id', c.get('userId'))
    .select('*').single();

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data);
});

// Delete KB
router.delete('/:id', async (c) => {
  const supabase = db(c);
  await supabase.from('knowledge_bases').delete().eq('id', c.req.param('id')).eq('user_id', c.get('userId'));
  return c.body(null, 204);
});

// Upload document text (frontend parses, sends text)
router.post('/:id/documents', async (c) => {
  const supabase = db(c);
  const kbId = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json<{ filename: string; content: string; file_type: string }>();

  if (!body.content) {
    return c.json({ error: { type: 'invalid_request_error', message: 'content required' } }, 400);
  }

  // Verify KB ownership
  const { data: kb } = await supabase.from('knowledge_bases').select('id, chunk_strategy, embedding_model_id')
    .eq('id', kbId).eq('user_id', userId).single();
  if (!kb) return c.json({ error: { type: 'invalid_request_error', message: 'KB not found' } }, 404);

  // Create document
  const { data: doc, error: docErr } = await supabase.from('documents').insert({
    knowledge_base_id: kbId, filename: body.filename, file_type: body.file_type,
    file_size: body.content.length, status: 'processing',
  }).select('*').single();
  if (docErr) return c.json({ error: { type: 'server_error', message: docErr.message } }, 500);

  // Chunk
  const config = (kb.chunk_strategy as any) || {};
  const chunks = chunkText(body.content, config);

  // Embed if model configured
  if (kb.embedding_model_id) {
    try {
      // Fetch embedding model
      const { data: model } = await supabase.from('models').select('*').eq('id', kb.embedding_model_id).single();
      const { data: provider } = await supabase.from('providers').select('*').eq('id', model?.provider_id).single();

      if (provider && model) {
        const apiKey = await decrypt(provider.api_key_encrypted, provider.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);
        await embedChunks(chunks, doc!.id, kbId, provider.base_url, apiKey, model.model_id, supabase, c.env);
      }
    } catch (err) {
      await supabase.from('documents').update({ status: 'error', error_message: `Embedding failed: ${err}` }).eq('id', doc!.id);
      return c.json({ error: { type: 'server_error', message: 'Embedding failed' } }, 500);
    }
  } else {
    // Store chunks without embeddings
    const chunkRows = chunks.map((content, i) => ({
      document_id: doc!.id, knowledge_base_id: kbId, content, chunk_index: i,
      embedding: null,
    }));
    await supabase.from('chunks').insert(chunkRows);
  }

  await supabase.from('documents').update({ status: 'ready', chunk_count: chunks.length }).eq('id', doc!.id);
  return c.json(doc, 201);
});

async function embedChunks(
  chunks: string[], docId: string, kbId: string,
  baseUrl: string, apiKey: string, modelId: string,
  supabase: any, _env: any
) {
  const batchSize = 20;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelId, input: batch }),
    });

    if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);

    const data = await res.json() as any;
    const embeddings = data.data || [];

    const chunkRows = batch.map((content, j) => ({
      document_id: docId,
      knowledge_base_id: kbId,
      content,
      chunk_index: i + j,
      embedding: embeddings[j]?.embedding ? JSON.stringify(embeddings[j].embedding) : null,
    }));

    await supabase.from('chunks').insert(chunkRows);
  }
}

// RAG Search
router.post('/:id/search', async (c) => {
  const supabase = db(c);
  const kbId = c.req.param('id');
  const userId = c.get('userId');
  const { query, top_k = 5, similarity_threshold = 0.5 } = await c.req.json<{ query: string; top_k?: number; similarity_threshold?: number }>();

  if (!query) return c.json({ error: { type: 'invalid_request_error', message: 'query required' } }, 400);

  // Get KB config
  const { data: kb } = await supabase.from('knowledge_bases')
    .select('*, embedding_model_id, rerank_model_id').eq('id', kbId).eq('user_id', userId).single();
  if (!kb) return c.json({ error: { type: 'invalid_request_error', message: 'KB not found' } }, 404);

  // Get embedding model
  const { data: embModel } = await supabase.from('models').select('*').eq('id', kb.embedding_model_id).single();

  if (!embModel) {
    // Fallback: keyword search
    const { data: chunks } = await supabase.from('chunks').select('id, content, chunk_index, document_id, metadata')
      .eq('knowledge_base_id', kbId).ilike('content', `%${query}%`).limit(top_k);
    return c.json(formatResults(chunks || [], supabase));
  }

  // Get provider and API key
  const { data: provider } = await supabase.from('providers').select('*').eq('id', embModel.provider_id).single();
  if (!provider) return c.json({ error: { type: 'server_error', message: 'Provider not found' } }, 500);

  const apiKey = await decrypt(provider.api_key_encrypted, provider.api_key_nonce, c.env.MASTER_ENCRYPTION_KEY);

  // Embed query
  const embRes = await fetch(`${provider.base_url}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: embModel.model_id, input: [query] }),
  });
  if (!embRes.ok) return c.json({ error: { type: 'server_error', message: 'Embedding failed' } }, 500);

  const embData = await embRes.json() as any;
  const queryEmbedding = embData.data?.[0]?.embedding;
  if (!queryEmbedding) return c.json({ error: { type: 'server_error', message: 'No embedding returned' } }, 500);

  // Vector search
  const { data: chunks, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: similarity_threshold,
    match_count: top_k,
    kb_id: kbId,
  });

  if (error) {
    // Fallback: pgvector operator
    const { data: fallback } = await supabase.from('chunks')
      .select('id, content, chunk_index, document_id, metadata, embedding')
      .eq('knowledge_base_id', kbId)
      .limit(top_k * 2);
    return c.json(formatResults(fallback || [], supabase));
  }

  return c.json(await formatResults((chunks || []) as any[], supabase));
});

async function formatResults(chunks: any[], supabase: any) {
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const { data: docs } = await supabase.from('documents').select('id, filename').in('id', docIds);

  const docMap = new Map((docs || []).map((d: any) => [d.id, d.filename]));

  return {
    chunks: chunks.map(c => ({
      id: c.id,
      content: c.content,
      chunk_index: c.chunk_index,
      similarity: c.similarity || 0,
      document_name: docMap.get(c.document_id) || 'Unknown',
      document_id: c.document_id,
    })),
  };
}

// List documents in KB
router.get('/:id/documents', async (c) => {
  const supabase = db(c);
  const { data, error } = await supabase.from('documents').select('*')
    .eq('knowledge_base_id', c.req.param('id')).order('created_at', { ascending: false });

  if (error) return c.json({ error: { type: 'server_error', message: error.message } }, 500);
  return c.json(data || []);
});

// Delete document
router.delete('/:kbId/documents/:docId', async (c) => {
  const supabase = db(c);
  await supabase.from('documents').delete().eq('id', c.req.param('docId'));
  return c.body(null, 204);
});

// Re-index document
router.post('/:kbId/documents/:docId/reindex', async (c) => {
  const supabase = db(c);
  const docId = c.req.param('docId');
  await supabase.from('chunks').delete().eq('document_id', docId);
  await supabase.from('documents').update({ status: 'pending' }).eq('id', docId);
  return c.json({ status: 'queued' });
});

// Re-index entire knowledge base
router.post('/:id/reindex-all', async (c) => {
  const supabase = db(c);
  const kbId = c.req.param('id');
  const userId = c.get('userId');

  // Verify ownership
  const { data: kb } = await supabase.from('knowledge_bases')
    .select('id').eq('id', kbId).eq('user_id', userId).single();
  if (!kb) return c.json({ error: { type: 'invalid_request_error', message: 'KB not found' } }, 404);

  // Get all document IDs
  const { data: docs } = await supabase.from('documents').select('id').eq('knowledge_base_id', kbId);
  const docIds = (docs || []).map(d => d.id);

  // Delete all chunks and reset status
  await supabase.from('chunks').delete().in('document_id', docIds);
  if (docIds.length > 0) {
    await supabase.from('documents').update({ status: 'pending', chunk_count: 0 }).eq('knowledge_base_id', kbId);
  }

  return c.json({ status: 'queued', document_count: docIds.length });
});

export default router;
