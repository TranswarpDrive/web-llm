import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Save, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface McpServer {
  id: string; name: string; server_url: string; tools: McpTool[]; tools_whitelist: string[]; is_active: boolean; created_at: string;
}
interface McpTool { name: string; description: string; inputSchema: any; }

function api(path: string, opts?: RequestInit) {
  return window.fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    ...opts,
  }).then(r => r.ok ? r.json() : r.json().then(e => { throw e; }));
}

export function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formWhitelist, setFormWhitelist] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Discover
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setServers(await api('/mcp-servers')); } catch {}
    setLoading(false);
  }

  function openNew() {
    setEditing(null); setFormName(''); setFormUrl(''); setFormKey(''); setFormWhitelist([]); setFormError(''); setShowForm(true);
  }
  function openEdit(s: McpServer) {
    setEditing(s); setFormName(s.name); setFormUrl(s.server_url); setFormKey(''); setFormWhitelist(s.tools_whitelist); setFormError(''); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true); setFormError('');
    try {
      const body: any = { name: formName, server_url: formUrl, tools_whitelist: formWhitelist };
      if (formKey) body.api_key = formKey;
      if (editing) {
        await api(`/mcp-servers/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/mcp-servers', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err: any) { setFormError(err?.error?.message || 'Failed'); }
    setSaving(false);
  }

  async function handleDiscover(id: string) {
    setDiscovering(d => ({ ...d, [id]: true }));
    try {
      await api(`/mcp-servers/${id}/discover`, { method: 'POST' });
      load();
    } catch {}
    setDiscovering(d => ({ ...d, [id]: false }));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this MCP server?')) return;
    await api(`/mcp-servers/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">MCP 服务</h2>
          <p className="text-sm text-muted-foreground mt-1">远程 HTTP MCP Server 管理</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />添加
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border p-4 sm:p-6 mb-6 space-y-3">
          <h3 className="font-semibold">{editing ? '编辑' : '添加'} MCP Server</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={formName} onChange={e => setFormName(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder="名称" />
            <input value={formUrl} onChange={e => setFormUrl(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder="Server URL" />
            <input type="password" value={formKey} onChange={e => setFormKey(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder={editing ? 'API Key (留空不变)' : 'API Key (可选)'} />
          </div>
          {formError && <div className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"><Save className="h-3.5 w-3.5" />{saving ? '保存中...' : '保存'}</button>
            <button onClick={() => setShowForm(false)} className="rounded-md px-4 py-2 text-sm hover:bg-accent">取消</button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : servers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground text-sm">暂无 MCP Server</div>
      ) : (
        <div className="space-y-2">
          {servers.map(s => (
            <div key={s.id} className={cn('rounded-lg border p-4', !s.is_active && 'opacity-50')}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {!s.is_active && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">已禁用</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.server_url}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(s.tools || []).map(t => {
                      const inList = s.tools_whitelist?.includes(t.name);
                      return (
                        <button key={t.name} onClick={async () => {
                          const newList = inList ? s.tools_whitelist.filter(x => x !== t.name) : [...(s.tools_whitelist || []), t.name];
                          await api(`/mcp-servers/${s.id}`, { method: 'PUT', body: JSON.stringify({ tools_whitelist: newList }) });
                          load();
                        }}
                          className={cn('rounded px-1.5 py-0.5 text-xs cursor-pointer border transition-colors',
                            inList ? 'bg-green-100 text-green-800 border-green-300' : 'bg-muted text-muted-foreground border-transparent hover:border-green-300')}>
                          {t.name}
                        </button>
                      );
                    })}
                    {(s.tools || []).length === 0 && <span className="text-xs text-muted-foreground">未发现工具 — 点击"发现"获取</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleDiscover(s.id)} disabled={discovering[s.id]}
                    className="rounded p-1.5 hover:bg-accent disabled:opacity-50" title="发现工具">
                    {discovering[s.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(s)} className="rounded p-1.5 hover:bg-accent" title="编辑"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(s.id)} className="rounded p-1.5 hover:bg-accent text-destructive" title="删除"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
