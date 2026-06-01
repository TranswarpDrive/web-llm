import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Save, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmAction } from '@/components/FormControls';

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
    } catch (err: any) { setFormError(err?.error?.message || '保存失败'); }
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
    await api(`/mcp-servers/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">MCP 服务</h2>
            <p className="app-subtitle">远程 HTTP MCP Server 管理</p>
          </div>
          <button onClick={openNew} className="ui-primary-button">
            <Plus className="h-4 w-4" />添加
          </button>
        </header>

        {showForm && (
          <section className="ui-surface space-y-4 p-4 sm:p-5">
            <div>
              <h3 className="font-medium">{editing ? '编辑' : '添加'} MCP Server</h3>
              <p className="mt-1 text-sm text-muted-foreground">工具白名单会在发现工具后显示为可点选标签</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={formName} onChange={e => setFormName(e.target.value)} className="ui-input" placeholder="名称" />
              <input value={formUrl} onChange={e => setFormUrl(e.target.value)} className="ui-input" placeholder="Server URL" />
              <input type="password" value={formKey} onChange={e => setFormKey(e.target.value)} className="ui-input sm:col-span-2" placeholder={editing ? 'API Key (留空不变)' : 'API Key (可选)'} />
            </div>
            {formError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={handleSave} disabled={saving} className="ui-primary-button">
                <Save className="h-4 w-4" />{saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setShowForm(false)} className="ui-ghost-button">取消</button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />)}</div>
        ) : servers.length === 0 ? (
          <div className="ui-surface border-dashed p-12 text-center text-sm text-muted-foreground">暂无 MCP Server</div>
        ) : (
          <div className="grid gap-3">
            {servers.map(s => {
              const allowedCount = s.tools_whitelist?.length || 0;
              const toolCount = s.tools?.length || 0;
              return (
                <article key={s.id} className={cn('ui-surface p-4', !s.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <span className="ui-chip">{allowedCount}/{toolCount} 工具</span>
                        {!s.is_active && <span className="ui-chip">已禁用</span>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{s.server_url}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => handleDiscover(s.id)} disabled={discovering[s.id]}
                        className="ui-icon-button" title="发现工具">
                        {discovering[s.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </button>
                      <button onClick={() => openEdit(s)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
                      <ConfirmAction onConfirm={() => handleDelete(s.id)} title="删除" confirmLabel="删除">
                        <Trash2 className="h-4 w-4" />
                      </ConfirmAction>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(s.tools || []).map(t => {
                      const inList = s.tools_whitelist?.includes(t.name);
                      return (
                        <button key={t.name} onClick={async () => {
                          const newList = inList ? s.tools_whitelist.filter(x => x !== t.name) : [...(s.tools_whitelist || []), t.name];
                          await api(`/mcp-servers/${s.id}`, { method: 'PUT', body: JSON.stringify({ tools_whitelist: newList }) });
                          load();
                        }}
                          className={cn('rounded-md border px-2 py-1 text-xs transition',
                            inList ? 'border-primary bg-primary/10 text-primary' : 'border-transparent bg-muted text-muted-foreground hover:border-primary/30 hover:text-foreground')}>
                          {t.name}
                        </button>
                      );
                    })}
                    {(s.tools || []).length === 0 && <span className="text-xs text-muted-foreground">未发现工具，点击发现获取</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
