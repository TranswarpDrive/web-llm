import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Upload, RefreshCw, FileText, Search, X, Loader2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmAction } from '@/components/FormControls';
import { apiUrl } from '@/lib/apiBase';

interface KB {
  id: string; name: string; description: string; is_active: boolean;
  chunk_strategy: any; retrieval_config: any; embedding_model_id: string | null;
  documents?: Array<{ count: number }>; created_at: string;
}
interface Doc {
  id: string; filename: string; file_type: string; file_size: number;
  status: string; error_message?: string; chunk_count: number; created_at: string;
}
interface SearchResult { id: string; content: string; chunk_index: number; similarity: number; document_name: string; document_id: string; }

const DOC_STATUS_LABELS: Record<string, string> = {
  ready: '就绪',
  processing: '处理中',
  pending: '等待',
  error: '错误',
};

const DOC_STATUS_STYLES: Record<string, string> = {
  ready: 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200',
  processing: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  pending: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  error: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function api(path: string, opts?: RequestInit) {
  return window.fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    ...opts,
  }).then(r => r.ok ? r.json() : r.json().then(e => { throw e; }));
}

async function parseFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Basic DOCX: just read as text fallback
      reader.readAsText(file);
    } else {
      reader.readAsText(file);
    }
  });
}

export function KnowledgeBasesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [kbs, setKbs] = useState<KB[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Document state
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { loadKBs(); }, []);
  useEffect(() => { if (id) loadDocs(id); }, [id]);

  async function loadKBs() {
    setLoading(true);
    try { setKbs(await api('/knowledge-bases')); } catch {}
    setLoading(false);
  }

  async function loadDocs(kbId: string) {
    setDocsLoading(true);
    try { setDocs(await api(`/knowledge-bases/${kbId}/documents`)); } catch {}
    setDocsLoading(false);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const kb = await api('/knowledge-bases', { method: 'POST', body: JSON.stringify({ name: formName, description: formDesc }) });
      setShowForm(false); setFormName(''); setFormDesc('');
      navigate(`/knowledge-bases/${kb.id}`);
      loadKBs();
    } catch {}
    setSaving(false);
  }

  async function handleDeleteKb(kbId: string) {
    await api(`/knowledge-bases/${kbId}`, { method: 'DELETE' });
    if (id === kbId) navigate('/knowledge-bases');
    loadKBs();
  }

  async function handleUpload(kbId: string) {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const content = await parseFile(file);
      await api(`/knowledge-bases/${kbId}/documents`, {
        method: 'POST', body: JSON.stringify({ filename: file.name, file_type: file.type, content }),
      });
      loadDocs(kbId);
      loadKBs();
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSearch() {
    if (!searchQuery.trim() || !id) return;
    setSearching(true);
    try {
      const res = await api(`/knowledge-bases/${id}/search`, {
        method: 'POST', body: JSON.stringify({ query: searchQuery, top_k: 5 }),
      });
      setSearchResults(res.chunks || []);
    } catch {}
    setSearching(false);
  }

  async function handleDeleteDoc(docId: string) {
    if (!id) return;
    await api(`/knowledge-bases/${id}/documents/${docId}`, { method: 'DELETE' });
    loadDocs(id);
    loadKBs();
  }

  async function handleReindex(docId: string) {
    if (!id) return;
    await api(`/knowledge-bases/${id}/documents/${docId}/reindex`, { method: 'POST' });
    loadDocs(id);
  }

  async function handleReindexAll() {
    if (!id) return;
    await api(`/knowledge-bases/${id}/reindex-all`, { method: 'POST' });
    loadDocs(id);
  }

  const activeKb = kbs.find(k => k.id === id);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-card lg:w-[300px] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-medium">知识库</h3>
          <button
            onClick={() => { setShowForm(true); setFormName(''); setFormDesc(''); }}
            className="ui-icon-button"
            title="新建知识库"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showForm && (
          <div className="border-b p-3">
            <div className="space-y-2">
              <input value={formName} onChange={e => setFormName(e.target.value)} className="ui-input w-full" placeholder="名称" />
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="ui-input w-full" placeholder="描述" />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={saving || !formName} className="ui-primary-button px-3 py-1.5">{saving ? '创建中...' : '创建'}</button>
                <button onClick={() => setShowForm(false)} className="ui-ghost-button px-3 py-1.5">取消</button>
              </div>
            </div>
          </div>
        )}

        <div className="max-h-72 flex-1 overflow-y-auto p-2 lg:max-h-none">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
          ) : kbs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">暂无知识库</div>
          ) : (
            <div className="space-y-1">
              {kbs.map(kb => (
                <button key={kb.id} onClick={() => navigate(`/knowledge-bases/${kb.id}`)}
                  className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-accent', id === kb.id && 'bg-accent text-foreground')}>
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{kb.name}</div>
                    <div className="text-xs text-muted-foreground">{kb.documents?.[0]?.count || 0} 文档</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        {!id ? (
          <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
            <div className="text-center">
              <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>选择一个知识库或创建新的</p>
              <button onClick={() => setShowForm(true)} className="ui-secondary-button mt-4">
                <Plus className="h-4 w-4" />新建知识库
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-5">
            <header className="app-page-header">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="app-title truncate">{activeKb?.name || '知识库'}</h2>
                  <span className="ui-chip">{docs.length} 文档</span>
                  {activeKb && !activeKb.is_active && <span className="ui-chip">已禁用</span>}
                </div>
                {activeKb?.description && <p className="app-subtitle">{activeKb.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx,.html,.csv" className="hidden" onChange={() => handleUpload(id)} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="ui-primary-button">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  上传文档
                </button>
                <ConfirmAction
                  onConfirm={() => handleDeleteKb(id)}
                  className="ui-secondary-button text-destructive hover:text-destructive"
                  confirmLabel="删除"
                >
                  <Trash2 className="h-4 w-4" />删除
                </ConfirmAction>
              </div>
            </header>

            <section className="ui-surface p-4">
              <div className="flex gap-2">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="ui-input flex-1" placeholder="测试检索..." />
                <button onClick={handleSearch} disabled={searching} className="ui-secondary-button px-3">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-medium">检索结果</h3>
                  {searchResults.map(r => (
                    <div key={r.id} className="rounded-md border p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />{r.document_name} · similarity: {r.similarity.toFixed(3)}
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{r.content.slice(0, 300)}...</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ui-surface overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-medium">文档列表</h3>
                {docs.length > 0 && (
                  <ConfirmAction
                    onConfirm={handleReindexAll}
                    className="ui-ghost-button px-2 py-1 text-xs"
                    confirmLabel="重索引"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />重索引全部
                  </ConfirmAction>
                )}
              </div>
              {docsLoading ? (
                <div className="space-y-2 p-4">{[1,2].map(i => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
              ) : docs.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">暂无文档</div>
              ) : (
                <div className="divide-y">
                  {docs.map(d => (
                    <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{d.filename}</span>
                        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs', DOC_STATUS_STYLES[d.status] || DOC_STATUS_STYLES.error)}>
                          {DOC_STATUS_LABELS[d.status] || d.status}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">{formatBytes(d.file_size)} · {d.chunk_count} 分块</span>
                        {d.error_message && <span className="truncate text-xs text-red-500">{d.error_message}</span>}
                      </div>
                      <div className="ml-2 flex shrink-0 gap-1">
                        <button onClick={() => handleReindex(d.id)} className="ui-icon-button" title="重索引"><RefreshCw className="h-3.5 w-3.5" /></button>
                        <ConfirmAction onConfirm={() => handleDeleteDoc(d.id)} title="删除" confirmLabel="删除">
                          <X className="h-3.5 w-3.5" />
                        </ConfirmAction>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
