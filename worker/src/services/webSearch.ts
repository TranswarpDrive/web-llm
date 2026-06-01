/**
 * Web search engine adapters + resolver.
 *
 * A search provider (table `search_providers`) is resolved at call time: the
 * default active provider is preferred, otherwise the first active one, and as a
 * last resort the legacy BRAVE_API_KEY env var. Engines share a common result
 * shape so callers (chat tool loop, /tools/web-search) stay engine-agnostic.
 */
import { decrypt } from './encryption';
import type { Bindings } from '../types';

export type SearchEngine = 'brave' | 'tavily' | 'searxng' | 'bing';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResolvedSearchProvider {
  engine: SearchEngine;
  apiKey?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
}

/** Run a search against a single resolved provider. Throws on hard failure. */
export async function executeSearch(p: ResolvedSearchProvider, query: string, count = 5): Promise<SearchResult[]> {
  const n = Math.min(Math.max(count, 1), 10);
  const timeout = AbortSignal.timeout(10000);

  switch (p.engine) {
    case 'brave': {
      if (!p.apiKey) throw new Error('Brave 搜索缺少 API Key');
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`,
        { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': p.apiKey }, signal: timeout }
      );
      if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
      const data = await res.json() as any;
      return (data.web?.results || []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: r.description || '' }));
    }
    case 'tavily': {
      if (!p.apiKey) throw new Error('Tavily 搜索缺少 API Key');
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: p.apiKey, query, max_results: n }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      const data = await res.json() as any;
      return (data.results || []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
    }
    case 'searxng': {
      if (!p.baseUrl) throw new Error('SearXNG 搜索缺少 Base URL');
      const base = p.baseUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, {
        headers: { Accept: 'application/json' }, signal: timeout,
      });
      if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
      const data = await res.json() as any;
      return (data.results || []).slice(0, n).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
    }
    case 'bing': {
      if (!p.apiKey) throw new Error('Bing 搜索缺少 API Key');
      const res = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${n}`, {
        headers: { 'Ocp-Apim-Subscription-Key': p.apiKey }, signal: timeout,
      });
      if (!res.ok) throw new Error(`Bing HTTP ${res.status}`);
      const data = await res.json() as any;
      return (data.webPages?.value || []).slice(0, n).map((r: any) => ({ title: r.name, url: r.url, snippet: r.snippet || '' }));
    }
    default:
      throw new Error(`不支持的搜索引擎: ${p.engine}`);
  }
}

/**
 * Resolve the user's active search provider (default first) and run a search.
 * Falls back to the legacy BRAVE_API_KEY env var. Returns results + a status
 * note so callers can surface "not configured" without throwing.
 */
export async function resolveAndSearch(
  supabase: any, env: Bindings, userId: string, query: string, count = 5
): Promise<{ results: SearchResult[]; note?: string }> {
  const { data: rows } = await supabase
    .from('search_providers')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(1);

  const row = rows?.[0];

  if (row) {
    let apiKey: string | undefined;
    if (row.api_key_encrypted && row.api_key_nonce) {
      apiKey = await decrypt(row.api_key_encrypted, row.api_key_nonce, env.MASTER_ENCRYPTION_KEY);
    }
    const results = await executeSearch(
      { engine: row.engine, apiKey, baseUrl: row.base_url || undefined, config: row.config || {} },
      query, count
    );
    return { results };
  }

  // Legacy fallback: env Brave key
  if (env.BRAVE_API_KEY) {
    const results = await executeSearch({ engine: 'brave', apiKey: env.BRAVE_API_KEY }, query, count);
    return { results };
  }

  return { results: [], note: '未配置搜索服务，请在「搜索服务」页面添加。' };
}

/** Format results as plain text for the tool-calling loop. */
export function formatResultsForTool(results: SearchResult[], note?: string): string {
  if (note) return note;
  if (results.length === 0) return 'No results found.';
  return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`).join('\n\n');
}
