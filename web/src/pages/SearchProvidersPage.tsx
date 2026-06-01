import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Save, Wifi, Check, X, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CheckboxCard, ConfirmAction, SelectMenu } from '@/components/FormControls';
import { useSearchProviderStore, type SearchProviderFormData } from '@/stores/searchProviderStore';
import type { SearchEngine, SearchProvider } from '@/types';

const ENGINES: { value: SearchEngine; label: string; needsKey: boolean; needsBaseUrl: boolean; hint: string }[] = [
  { value: 'brave', label: 'Brave Search', needsKey: true, needsBaseUrl: false, hint: '需要 Brave Search API Key' },
  { value: 'tavily', label: 'Tavily', needsKey: true, needsBaseUrl: false, hint: '需要 Tavily API Key' },
  { value: 'bing', label: 'Bing', needsKey: true, needsBaseUrl: false, hint: '需要 Bing Search v7 订阅 Key' },
  { value: 'searxng', label: 'SearXNG', needsKey: false, needsBaseUrl: true, hint: '自建实例，需填写 Base URL（开启 JSON 输出）' },
];

const DEFAULT_FORM: SearchProviderFormData = {
  name: '', engine: 'brave', api_key: '', base_url: '', is_active: true, is_default: false,
};

export function SearchProvidersPage() {
  const { providers, loading, fetch: fetchProviders, create, update, remove, testConnection } = useSearchProviderStore();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SearchProvider | null>(null);
  const [form, setForm] = useState<SearchProviderFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { status: string; message?: string; result_count?: number }>>({});

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const engineMeta = ENGINES.find(e => e.value === form.engine)!;

  function openNew() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(p: SearchProvider) {
    setEditing(p);
    setForm({ name: p.name, engine: p.engine, api_key: '', base_url: p.base_url || '', is_active: p.is_active, is_default: p.is_default });
    setFormError('');
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditing(null); setFormError(''); }

  async function handleSave() {
    setFormError(''); setSaving(true);
    try {
      const meta = ENGINES.find(e => e.value === form.engine)!;
      const payload: Partial<SearchProviderFormData> = {
        name: form.name, engine: form.engine, is_active: form.is_active, is_default: form.is_default,
        base_url: meta.needsBaseUrl ? form.base_url : '',
      };
      if (form.api_key) payload.api_key = form.api_key;

      if (editing) await update(editing.id, payload);
      else {
        if (meta.needsKey && !form.api_key) throw new Error('该引擎需要 API Key');
        if (meta.needsBaseUrl && !form.base_url) throw new Error('该引擎需要 Base URL');
        await create(payload as SearchProviderFormData);
      }
      setShowForm(false); setEditing(null);
    } catch (err: any) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  async function handleTest(id: string) {
    setTesting(t => ({ ...t, [id]: true }));
    try {
      const result = await testConnection(id);
      setTestResults(t => ({ ...t, [id]: result }));
    } catch (err: any) {
      setTestResults(t => ({ ...t, [id]: { status: 'error', message: err?.message || '测试失败' } }));
    } finally {
      setTesting(t => ({ ...t, [id]: false }));
    }
  }

  const canSave = Boolean(form.name.trim() && form.engine);

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">搜索服务</h2>
            <p className="app-subtitle">{providers.length} 个搜索服务，联网搜索时使用默认服务</p>
          </div>
          <button onClick={openNew} className="ui-primary-button">
            <Plus className="h-4 w-4" />添加
          </button>
        </header>

        {showForm && (
          <section className="ui-surface space-y-4 p-4 sm:p-5">
            <h3 className="font-medium">{editing ? '编辑搜索服务' : '添加搜索服务'}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">名称</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="ui-input w-full" placeholder="我的搜索" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">引擎</label>
                <SelectMenu<SearchEngine>
                  value={form.engine}
                  options={ENGINES.map(e => ({ value: e.value, label: e.label }))}
                  onChange={engine => setForm(f => ({ ...f, engine }))}
                />
              </div>
              {engineMeta.needsKey && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">
                    API Key {editing && <span className="text-muted-foreground">(留空则保持不变)</span>}
                  </label>
                  <input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                    className="ui-input w-full" placeholder={editing ? '••••••••' : ''} />
                </div>
              )}
              {engineMeta.needsBaseUrl && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">Base URL</label>
                  <input type="url" value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                    className="ui-input w-full" placeholder="https://searxng.example.com" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <CheckboxCard checked={form.is_default} onCheckedChange={c => setForm(f => ({ ...f, is_default: c }))} label="设为默认" />
                <CheckboxCard checked={form.is_active} onCheckedChange={c => setForm(f => ({ ...f, is_active: c }))} label="启用" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{engineMeta.hint}</p>
            {formError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={handleSave} disabled={saving || !canSave} className="ui-primary-button">
                <Save className="h-4 w-4" />{saving ? '保存中...' : (editing ? '更新' : '添加')}
              </button>
              <button onClick={cancelForm} className="ui-ghost-button">取消</button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />)}</div>
        ) : providers.length === 0 ? (
          <div className="ui-surface border-dashed p-12 text-center text-sm text-muted-foreground">
            暂无搜索服务。添加后，对话里的「联网搜索」会使用默认服务。
          </div>
        ) : (
          <div className="grid gap-3">
            {providers.map(p => {
              const meta = ENGINES.find(e => e.value === p.engine);
              const result = testResults[p.id];
              return (
                <article key={p.id} className={cn('ui-surface p-4', !p.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{p.name}</span>
                        <span className="ui-chip">{meta?.label || p.engine}</span>
                        {p.is_default && <span className="ui-chip border-primary/20 bg-primary/10 text-primary">默认</span>}
                        {!p.is_active && <span className="ui-chip">已禁用</span>}
                      </div>
                      {p.base_url && <p className="mt-1 truncate text-xs text-muted-foreground">{p.base_url}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => handleTest(p.id)} disabled={testing[p.id]} className="ui-icon-button" title="测试搜索">
                        {testing[p.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                      </button>
                      <button onClick={() => openEdit(p)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
                      <ConfirmAction onConfirm={() => remove(p.id)} title="删除" confirmLabel="删除">
                        <Trash2 className="h-4 w-4" />
                      </ConfirmAction>
                    </div>
                  </div>
                  {result && (
                    <div className={cn('mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-xs',
                      result.status === 'ok'
                        ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                        : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200')}>
                      {result.status === 'ok'
                        ? <><Check className="h-3.5 w-3.5" />搜索正常，返回 {result.result_count} 条结果</>
                        : <><X className="h-3.5 w-3.5" />{result.message || '测试失败'}</>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
