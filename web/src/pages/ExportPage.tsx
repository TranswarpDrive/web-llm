import { useEffect, useState } from 'react';
import { Download, FileText, File, Image, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  exportConversationImage,
  fetchCompleteConversation,
  type ConversationExportOptions,
} from '@/lib/conversationExport';
import { apiUrl } from '@/lib/apiBase';

interface Conversation { id: string; title: string; last_message_at: string; created_at: string; }
type ExportFormat = 'markdown' | 'pdf' | 'png';

const OPTION_LABELS: Record<keyof ConversationExportOptions, string> = {
  includeSystemPrompt: '系统提示',
  includeModelInfo: '模型信息',
  includeTimestamps: '时间戳',
  includeToolCalls: '工具调用',
  includeCitations: '引用来源',
};

function api(path: string, opts?: RequestInit) {
  return window.fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    ...opts,
  }).then(r => r.ok ? r.json() : r.json().then(e => { throw e; }));
}

export function ExportPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [options, setOptions] = useState<ConversationExportOptions>({
    includeSystemPrompt: false, includeModelInfo: true, includeTimestamps: true,
    includeToolCalls: true, includeCitations: true,
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const canSelectAll = !loading && conversations.length > 0;
  const allSelected = canSelectAll && selected.size === conversations.length;

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
    setExportError('');
    try {
      const ids = [...selected];
      const allData: any[] = [];

      for (const id of ids) {
        const data = await fetchCompleteConversation(id, api);
        allData.push(data);
      }

      let content = '';
      if (format === 'markdown') {
        content = allData.map(conv => buildMarkdown(conv, options)).join('\n\n---\n\n');
        downloadFile(content, `export-${Date.now()}.md`, 'text/markdown');
      } else if (format === 'pdf') {
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
      } else {
        for (const conv of allData) {
          await exportConversationImage(conv, options);
        }
      }
    } catch {
      setExportError('导出失败，请稍后再试。');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">导出对话</h2>
            <p className="app-subtitle">已选择 {selected.size} / {conversations.length} 个对话</p>
          </div>
          <button onClick={handleExport} disabled={selected.size === 0 || exporting}
            className="ui-primary-button">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? '导出中...' : `导出 ${selected.size} 个`}
          </button>
        </header>
        {exportError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {exportError}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="ui-surface overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <label className={cn('ui-check-card min-h-0 border-transparent bg-transparent px-0 py-0 hover:bg-transparent', allSelected && 'is-checked', !canSelectAll && 'is-disabled')}>
                <input type="checkbox" checked={allSelected} disabled={!canSelectAll} onChange={toggleAll} className="ui-checkbox" />
                全选
              </label>
              <span className="text-xs text-muted-foreground">{conversations.length} 个对话</span>
            </div>

            {loading ? (
              <div className="space-y-2 p-4">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
            ) : conversations.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">暂无可导出的对话</div>
            ) : (
              <div className="divide-y">
                {conversations.map((c, index) => (
                  <label key={`${c.id}-${index}`} className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-accent', selected.has(c.id) && 'bg-primary/10 text-primary')}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="ui-checkbox" />
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.title || '未命名对话'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.last_message_at).toLocaleDateString()}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <section className="ui-surface p-4">
              <h3 className="mb-3 text-sm font-medium">格式</h3>
              <div className="grid gap-2">
                {[
                  { v: 'markdown' as const, l: 'Markdown', i: FileText },
                  { v: 'pdf' as const, l: 'PDF 打印', i: File },
                  { v: 'png' as const, l: '对话长图', i: Image },
                ].map(f => (
                  <button key={f.v} onClick={() => setFormat(f.v)}
                    className={cn('flex items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:bg-accent', format === f.v && 'border-primary bg-primary/10 text-primary')}>
                    <span className="flex items-center gap-2"><f.i className="h-4 w-4" />{f.l}</span>
                    {format === f.v && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
            </section>

            <section className="ui-surface p-4">
              <h3 className="mb-3 text-sm font-medium">内容</h3>
              <div className="space-y-2">
                {(Object.entries(options) as Array<[keyof ConversationExportOptions, boolean]>).map(([k, v]) => (
                  <label key={k} className={cn('ui-check-row', v && 'is-checked')}>
                    <span>{OPTION_LABELS[k]}</span>
                    <input type="checkbox" checked={v} onChange={e => setOptions(o => ({ ...o, [k]: e.target.checked }))} className="ui-checkbox" />
                  </label>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
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
