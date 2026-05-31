import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Upload, RefreshCw, FileText, Search, X, Loader2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function api(path: string, opts?: RequestInit) {
  return window.fetch(`/api${path}`, {
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
    if (!confirm('Delete this knowledge base and all documents?')) return;
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

  const activeKb = kbs.find(k => k.id === id);

  return (
    <div className="flex h-full">
      {/* KB List sidebar */}
      <div className="w-64 border-r shrink-0 flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-medium text-sm">知识库</h3>
          <button onClick={() => setShowForm(true)} className="rounded p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div>
            : kbs.map(kb => (
              <button key={kb.id} onClick={() => navigate(`/knowledge-bases/${kb.id}`)}
                className={cn('w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2', id === kb.id && 'bg-accent')}>
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{kb.name}</div>
                  <div className="text-xs text-muted-foreground">{kb.documents?.[0]?.count || 0} docs</div>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!id ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>选择一个知识库或创建新的</p>
              {showForm && (
                <div className="mt-4 mx-auto max-w-sm text-left space-y-3 border rounded-lg p-4">
                  <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="名称" />
                  <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="描述" />
                  <div className="flex gap-2">
                    <button onClick={handleCreate} disabled={saving || !formName} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{saving ? '创建中...' : '创建'}</button>
                    <button onClick={() => setShowForm(false)} className="rounded px-3 py-1.5 text-sm hover:bg-accent">取消</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{activeKb?.name}</h2>
                {activeKb?.description && <p className="text-sm text-muted-foreground">{activeKb.description}</p>}
              </div>
              <button onClick={() => handleDeleteKb(id)} className="rounded p-2 hover:bg-accent text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>

            {/* Upload */}
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx,.html,.csv" className="hidden" onChange={() => handleUpload(id)} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                上传文档
              </button>
              <span className="text-xs text-muted-foreground">支持 PDF, TXT, MD, DOCX, HTML</span>
            </div>

            {/* Search test */}
            <div className="flex gap-2">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 rounded border px-3 py-2 text-sm" placeholder="测试检索..." />
              <button onClick={handleSearch} disabled={searching} className="rounded border px-4 py-2 text-sm hover:bg-accent">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">检索结果</h3>
                {searchResults.map(r => (
                  <div key={r.id} className="rounded border p-3 text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <FileText className="h-3 w-3" />{r.document_name} · similarity: {r.similarity.toFixed(3)}
                    </div>
                    <p className="whitespace-pre-wrap text-xs">{r.content.slice(0, 300)}...</p>
                  </div>
                ))}
              </div>
            )}

            {/* Documents */}
            <div>
              <h3 className="text-sm font-medium mb-2">文档列表</h3>
              {docsLoading ? <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
                : docs.length === 0 ? <p className="text-sm text-muted-foreground">暂无文档</p>
                  : <div className="space-y-1">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between rounded border p-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{d.filename}</span>
                          <span className={cn('rounded px-1.5 py-0.5 text-xs shrink-0',
                            d.status === 'ready' ? 'bg-green-100 text-green-800' :
                              d.status === 'processing' || d.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800')}>
                            {d.status}
                          </span>
                          <span className="text-xs text-muted-foreground">{d.chunk_count} chunks</span>
                          {d.error_message && <span className="text-xs text-red-500 truncate">{d.error_message}</span>}
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <button onClick={() => handleReindex(d.id)} className="rounded p-1 hover:bg-accent" title="Re-index"><RefreshCw className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteDoc(d.id)} className="rounded p-1 hover:bg-accent text-destructive" title="Delete"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
