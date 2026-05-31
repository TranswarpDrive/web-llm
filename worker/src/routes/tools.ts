import { Hono } from 'hono';
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

// Execute web search
router.post('/web-search', async (c) => {
  const { query, count = 5 } = await c.req.json<{ query: string; count?: number }>();

  if (!query) {
    return c.json({ error: { type: 'invalid_request_error', message: 'query required' } }, 400);
  }

  const apiKey = c.env.BRAVE_API_KEY;
  if (!apiKey) {
    return c.json({
      results: [{ title: 'Brave Search not configured', url: '', snippet: 'Set BRAVE_API_KEY in .dev.vars' }],
    });
  }

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 10)}`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return c.json({ results: [{ title: 'Search failed', url: '', snippet: `HTTP ${res.status}` }] });
    }

    const data = await res.json() as any;
    const results = (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description || r.snippet || '',
    }));

    return c.json({ results });
  } catch (err: any) {
    return c.json({
      results: [{ title: 'Search error', url: '', snippet: err.message }],
    });
  }
});

// Available tools list
router.get('/definitions', async (c) => {
  return c.json({ tools: [WEB_SEARCH_TOOL] });
});

export { WEB_SEARCH_TOOL };
export default router;
