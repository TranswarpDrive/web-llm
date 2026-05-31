import { useEffect, useState } from 'react';
import { Download, FileText, File, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation { id: string; title: string; last_message_at: string; created_at: string; }

function api(path: string, opts?: RequestInit) {
  return window.fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    ...opts,
  }).then(r => r.ok ? r.json() : r.json().then(e => { throw e; }));
}

export function ExportPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<'markdown' | 'pdf'>('markdown');
  const [options, setOptions] = useState({
    includeSystemPrompt: false, includeModelInfo: true, includeTimestamps: true,
    includeToolCalls: true, includeCitations: true,
  });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api('/conversations').then(d => { setConversations(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function toggleAll() {
    if (selected.size === conversations.length) setSelected(new Set());
    else setSelected(new Set(conversations.map(c => c.id)));
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const ids = [...selected];
      const allData: any[] = [];

      for (const id of ids) {
        const data = await api(`/conversations/${id}`);
        allData.push(data);
      }

      let content = '';
      if (format === 'markdown') {
        content = allData.map(conv => buildMarkdown(conv, options)).join('\n\n---\n\n');
        downloadFile(content, `export-${Date.now()}.md`, 'text/markdown');
      } else {
        // PDF via print window
        content = allData.map(conv => buildMarkdown(conv, options)).join('\n\n---\n\n');
        const w = window.open('', '_blank')!;
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Export</title>
          <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:1rem;line-height:1.6}
          pre{background:#f5f5f5;padding:1rem;border-radius:4px;overflow-x:auto}code{font-size:0.9em}
          blockquote{border-left:3px solid #ddd;margin-left:0;padding-left:1rem;color:#666}</style></head><body></body></html>`);
        w.document.close();
        const body = w.document.querySelector('body')!;
        const md_html = markdownToHtml(content);
        body.innerHTML = md_html;
        setTimeout(() => { w.print(); w.close(); }, 500);
      }
    } catch {}
    setExporting(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h2 className="text-2xl font-bold mb-6">导出对话</h2>

      {/* Format & options */}
      <div className="rounded-lg border p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          {[{ v: 'markdown' as const, l: 'Markdown', i: FileText }, { v: 'pdf' as const, l: 'PDF (打印)', i: File }].map(f => (
            <button key={f.v} onClick={() => setFormat(f.v)}
              className={cn('flex items-center gap-2 rounded-md px-4 py-2 text-sm border', format === f.v ? 'border-primary bg-primary/10' : 'hover:bg-accent')}>
              <f.i className="h-4 w-4" />{f.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(options).map(([k, v]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={v} onChange={e => setOptions(o => ({ ...o, [k]: e.target.checked }))} className="rounded" />
              {k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
            </label>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
            <input type="checkbox" checked={selected.size === conversations.length && conversations.length > 0} onChange={toggleAll} className="rounded" />
            全选 ({conversations.length})
          </label>
          <div className="space-y-1 mb-6">
            {conversations.map(c => (
              <label key={c.id} className="flex items-center gap-3 rounded border p-3 cursor-pointer hover:bg-accent">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-sm">{c.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(c.last_message_at).toLocaleDateString()}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <button onClick={handleExport} disabled={selected.size === 0 || exporting}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {exporting ? '导出中...' : `导出 ${selected.size} 个对话`}
      </button>
    </div>
  );
}

function buildMarkdown(conv: any, opts: any): string {
  let md = `# ${conv.title || 'Untitled'}\n`;
  if (opts.includeModelInfo) md += `*${new Date(conv.created_at).toLocaleString()}*\n`;
  if (opts.includeSystemPrompt && conv.system_prompt && conv.messages?.find((m: any) => m.role === 'system')) {
    md += `\n> **System**: ${conv.system_prompt}\n`;
  }
  for (const msg of (conv.messages || [])) {
    if (msg.role === 'system' && !opts.includeSystemPrompt) continue;
    const ts = opts.includeTimestamps ? ` (${new Date(msg.created_at).toLocaleTimeString()})` : '';
    md += `\n**${msg.role}**${ts}\n`;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    md += `${content}\n`;
  }
  return md;
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hpbl])(.+)$/gm, '<p>$1</p>')
    .replace(/<p>\n/g, '<p>');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
