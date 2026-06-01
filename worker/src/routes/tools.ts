import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { resolveAndSearch } from '../services/webSearch';
import type { Bindings, Variables } from '../types';

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Web search tool definition
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for current information. Returns titles, URLs, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        count: { type: 'integer', description: 'Number of results (1-10)', default: 5 },
      },
      required: ['query'],
    },
  },
};

// Execute web search via the user's configured search provider (default first).
router.post('/web-search', async (c) => {
  const { query, count = 5 } = await c.req.json<{ query: string; count?: number }>();

  if (!query) {
    return c.json({ error: { type: 'invalid_request_error', message: 'query required' } }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { results, note } = await resolveAndSearch(supabase, c.env, c.get('userId'), query, count);
    if (note) return c.json({ results: [{ title: '搜索服务未配置', url: '', snippet: note }] });
    return c.json({ results });
  } catch (err: any) {
    return c.json({ results: [{ title: 'Search error', url: '', snippet: err.message }] });
  }
});

// Available tools list
router.get('/definitions', async (c) => {
  return c.json({ tools: [WEB_SEARCH_TOOL] });
});

export { WEB_SEARCH_TOOL };
export default router;
