import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useProviderStore, type ProviderFormData } from '@/stores/providerStore';
import { useModelStore, type ModelFormData } from '@/stores/modelStore';
import type { Provider, Model, ModelType, ModelCapabilities } from '@/types';
import { Plus, Pencil, Trash2, Wifi, Check, X, Loader2, Save, Eye, Brain, Image, Wrench, Hash, ArrowUpDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CheckboxCard, ConfirmAction, SelectMenu } from '@/components/FormControls';

type Tab = 'providers' | 'models';

const MODEL_CAP_LABELS: { key: keyof ModelCapabilities; label: string; icon: React.ElementType }[] = [
  { key: 'chat', label: '对话', icon: MessageIcon },
  { key: 'vision', label: '识图', icon: Eye },
  { key: 'reasoning', label: '思考', icon: Brain },
  { key: 'image_gen', label: '生图', icon: Image },
  { key: 'tool_calling', label: '工具调用', icon: Wrench },
  { key: 'embedding', label: '嵌入', icon: Hash },
  { key: 'rerank', label: '重排序', icon: ArrowUpDown },
];

function MessageIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const MODEL_TYPES: { value: ModelType; label: string }[] = [
  { value: 'chat', label: '对话' },
  { value: 'vision', label: '视觉' },
  { value: 'reasoning', label: '推理' },
  { value: 'embedding', label: '嵌入' },
  { value: 'rerank', label: '重排序' },
];

const DEFAULT_PROVIDER_FORM: ProviderFormData = {
  name: '', base_url: '', api_key: '',
  is_active: true,
};

const DEFAULT_MODEL_FORM: ModelFormData = {
  provider_id: '', model_id: '', display_name: '', type: 'chat',
  capabilities: { chat: true, vision: false, reasoning: false, image_gen: false, tool_calling: false, embedding: false, rerank: false },
  default_params: { temperature: 0.7, max_tokens: 4096, top_p: 1.0 },
  is_default_per_type: false, is_active: true,
};

export function ProvidersPage() {
  const location = useLocation();
  const [tab, setTab] = useState<Tab>(() => location.pathname === '/models' ? 'models' : 'providers');
  const { providers, loading: pLoading, fetch: fetchProviders, create: createP, update: updateP, remove: removeP, testConnection } = useProviderStore();
  const { models, loading: mLoading, fetch: fetchModels, create: createM, update: updateM, remove: removeM, batchCreate } = useModelStore();

  // Provider form state
  const [editingProv, setEditingProv] = useState<Provider | null>(null);
  const [provForm, setProvForm] = useState<ProviderFormData>(DEFAULT_PROVIDER_FORM);
  const [provSaving, setProvSaving] = useState(false);
  const [provError, setProvError] = useState('');
  const [testResults, setTestResults] = useState<Record<string, { status: string; message?: string; model_count?: number }>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  // Model form state
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormData>(DEFAULT_MODEL_FORM);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState('');

  // Pull models state
  const [pullProvider, setPullProvider] = useState('');
  const [pullModels, setPullModels] = useState<Array<{ id: string; owned_by: string }>>([]);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullError, setPullError] = useState('');
  const [selectedPulls, setSelectedPulls] = useState<Set<string>>(new Set());
  const [pullImporting, setPullImporting] = useState(false);
  const [showPullSection, setShowPullSection] = useState(false);

  useEffect(() => { fetchProviders(); fetchModels(); }, [fetchProviders, fetchModels]);
  useEffect(() => { setTab(location.pathname === '/models' ? 'models' : 'providers'); }, [location.pathname]);

  // ---- Provider handlers ----
  function openEditProvider(p: Provider) {
    setEditingProv(p);
    setProvForm({ name: p.name, base_url: p.base_url, api_key: '', is_active: p.is_active });
    setProvError('');
  }

  async function saveProvider() {
    setProvError(''); setProvSaving(true);
    try {
      if (editingProv) {
        const data = { ...provForm };
        if (!data.api_key) delete (data as any).api_key;
        await updateP(editingProv.id, data);
      } else {
        if (!provForm.api_key) throw new Error('API key is required');
        await createP(provForm);
      }
      setEditingProv(null);
    } catch (err: any) { setProvError(err.message); }
    finally { setProvSaving(false); }
  }

  async function handleTest(id: string) {
    setTesting(t => ({ ...t, [id]: true }));
    const result = await testConnection(id);
    setTestResults(t => ({ ...t, [id]: result }));
    setTesting(t => ({ ...t, [id]: false }));
  }

  async function handleDeleteProvider(id: string) { await removeP(id); }

  // ---- Model handlers ----
  function openNewModel() {
    setEditingModel(null);
    setShowModelForm(true);
    setModelForm({ ...DEFAULT_MODEL_FORM, provider_id: activeProviders[0]?.id || '' });
    setModelError('');
  }

  function openEditModel(m: Model) {
    setEditingModel(m);
    setShowModelForm(true);
    setModelForm({
      provider_id: m.provider_id,
      model_id: m.model_id,
      display_name: m.display_name,
      type: m.type,
      capabilities: { ...(m.capabilities || { chat: true, vision: false, reasoning: false, image_gen: false, tool_calling: false, embedding: false, rerank: false }) },
      default_params: { ...(m.default_params || {}) },
      is_default_per_type: m.is_default_per_type,
      is_active: m.is_active,
    });
    setModelError('');
  }

  async function saveModel() {
    setModelError(''); setModelSaving(true);
    try {
      if (editingModel) {
        await updateM(editingModel.id, modelForm);
      } else {
        await createM(modelForm);
      }
      setEditingModel(null);
      setShowModelForm(false);
      setEditingModel(null);
    } catch (err: any) { setModelError(err.message); }
    finally { setModelSaving(false); }
  }

  function cancelModelForm() {
    setShowModelForm(false);
    setEditingModel(null);
    setModelError('');
  }

  async function handleDeleteModel(id: string) { await removeM(id); }

  // ---- Pull models ----
  async function fetchRemoteModels() {
    if (!pullProvider) return;
    setPullLoading(true); setPullError(''); setPullModels([]); setSelectedPulls(new Set());
    try {
      const token = localStorage.getItem('token');
      const res = await window.fetch(`/api/providers/${pullProvider}/remote-models`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setPullError(data?.error?.message || 'Failed'); return; }
      const existing = new Set(models.filter(m => m.provider_id === pullProvider).map(m => m.model_id));
      setPullModels((data.models || []).filter((m: any) => !existing.has(m.id)));
    } catch (err: any) { setPullError(err.message); }
    finally { setPullLoading(false); }
  }

  function togglePullSelect(id: string) {
    setSelectedPulls(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function importSelected() {
    if (selectedPulls.size === 0) return;
    setPullImporting(true); setPullError('');
    try {
      const toImport = pullModels.filter(m => selectedPulls.has(m.id)).map(m => ({
        provider_id: pullProvider, model_id: m.id, display_name: m.id, type: 'chat' as ModelType,
        capabilities: { chat: true, vision: false, reasoning: false, image_gen: false, tool_calling: false, embedding: false, rerank: false },
        default_params: { temperature: 0.7, max_tokens: 4096, top_p: 1.0 },
        is_default_per_type: false, is_active: true,
      }));
      await batchCreate(toImport);
      setShowPullSection(false); setPullModels([]);
    } catch (err: any) { setPullError(err.message); }
    finally { setPullImporting(false); }
  }

  const activeProviders = providers.filter(p => p.is_active);
  const providerOptions = activeProviders.map(p => ({ value: p.id, label: p.name }));
  const modelTypeOptions = MODEL_TYPES.map(t => ({ value: t.value, label: t.label }));
  const canSaveProvider = Boolean(provForm.name.trim() && provForm.base_url.trim() && (editingProv || provForm.api_key.trim()));
  const canSaveModel = Boolean(modelForm.provider_id && modelForm.model_id.trim() && modelForm.display_name.trim());

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">服务商与模型</h2>
            <p className="app-subtitle">{providers.length} 个服务商，{models.length} 个模型</p>
          </div>
        </header>

      <div className="ui-segmented">
        {[
          { key: 'providers' as Tab, label: '服务商' },
          { key: 'models' as Tab, label: '模型' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-sm px-4 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* === PROVIDERS TAB === */}
      {tab === 'providers' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
          {/* Inline form */}
          <div className="ui-surface p-4 sm:p-5 xl:sticky xl:top-5 xl:self-start">
            <h3 className="mb-4 font-medium">{editingProv ? '编辑服务商' : '添加服务商'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">名称</label>
                <input type="text" value={provForm.name} onChange={e => setProvForm(f => ({ ...f, name: e.target.value }))}
                  className="ui-input w-full" placeholder="OpenAI" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input type="url" value={provForm.base_url} onChange={e => setProvForm(f => ({ ...f, base_url: e.target.value }))}
                  className="ui-input w-full" placeholder="https://api.openai.com/v1" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">
                  API Key {editingProv && <span className="text-muted-foreground">(留空则保持不变)</span>}
                </label>
                <input type="password" value={provForm.api_key} onChange={e => setProvForm(f => ({ ...f, api_key: e.target.value }))}
                  className="ui-input w-full" placeholder={editingProv ? '••••••••' : 'sk-...'} />
              </div>
              <div className="sm:col-span-2 flex items-end gap-4">
                <CheckboxCard
                  checked={provForm.is_active}
                  onCheckedChange={checked => setProvForm(f => ({ ...f, is_active: checked }))}
                  label="启用服务商"
                  className="w-full sm:w-auto"
                />
              </div>
            </div>
            {provError && <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{provError}</div>}
            <div className="mt-4 flex gap-2">
              <button onClick={saveProvider} disabled={provSaving || !canSaveProvider}
                className="ui-primary-button">
                <Save className="h-4 w-4" />{provSaving ? '保存中...' : (editingProv ? '更新' : '添加')}
              </button>
              {editingProv && (
                <button onClick={() => setEditingProv(null)}
                  className="ui-ghost-button">取消</button>
              )}
            </div>
          </div>

          {/* Provider list */}
          <div className="space-y-2">
          {pLoading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />)}</div>
          ) : providers.length === 0 ? (
            <div className="ui-surface border-dashed p-10 text-center text-sm text-muted-foreground">暂无服务商，请添加</div>
          ) : (
            <div className="space-y-2">
              {providers.map(p => (
                <div key={p.id} className={cn('ui-surface p-4', !p.is_active && 'opacity-60')}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="ui-chip">{models.filter(m => m.provider_id === p.id).length} 模型</span>
                        {!p.is_active && <span className="ui-chip">已禁用</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.base_url}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleTest(p.id)} disabled={testing[p.id]}
                        className="ui-icon-button" title="测试连接">
                        {testing[p.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                      </button>
                      <button onClick={() => openEditProvider(p)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
                      <ConfirmAction onConfirm={() => handleDeleteProvider(p.id)} title="删除" confirmLabel="删除">
                        <Trash2 className="h-4 w-4" />
                      </ConfirmAction>
                    </div>
                  </div>
                  {testResults[p.id] && (
                    <div className={cn('mt-3 rounded-md p-2 text-xs', testResults[p.id].status === 'ok' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200')}>
                      {testResults[p.id].status === 'ok' ? <span className="flex items-center gap-1"><Check className="h-3 w-3" />已连接！{testResults[p.id].model_count} 个模型可用</span>
                        : <span className="flex items-center gap-1"><X className="h-3 w-3" />{testResults[p.id].message || '连接失败'}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* === MODELS TAB === */}
      {tab === 'models' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,440px)_1fr]">
          <div className="space-y-5">
          {/* Pull models section */}
          <div className="ui-surface p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">从服务商拉取模型</h3>
              <button onClick={() => { setShowPullSection(!showPullSection); if (!showPullSection && activeProviders[0]) setPullProvider(activeProviders[0].id); }}
                className="ui-ghost-button px-2 py-1">{showPullSection ? '收起' : '展开'}</button>
            </div>
            {showPullSection && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-3">
                  <SelectMenu
                    value={pullProvider}
                    options={providerOptions}
                    onChange={setPullProvider}
                    placeholder="选择服务商"
                    disabled={providerOptions.length === 0}
                    className="flex-1"
                  />
                  <button onClick={fetchRemoteModels} disabled={pullLoading || !pullProvider}
                    className="ui-primary-button">
                    {pullLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '获取'}
                  </button>
                </div>
                {pullError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{pullError}</div>}
                {pullModels.length > 0 && (
                  <>
                    <label className={cn('ui-check-card', selectedPulls.size === pullModels.length && 'is-checked')}>
                      <input type="checkbox" checked={selectedPulls.size === pullModels.length} onChange={() =>
                        setSelectedPulls(selectedPulls.size === pullModels.length ? new Set() : new Set(pullModels.map(m => m.id)))
                      } className="ui-checkbox" />
                      全选 ({pullModels.length} 个模型)
                    </label>
                    <div className="max-h-40 divide-y overflow-y-auto rounded-md border">
                      {pullModels.map(m => (
                        <label key={m.id} className={cn('ui-check-row justify-start px-3 py-2', selectedPulls.has(m.id) && 'is-checked')}>
                          <input type="checkbox" checked={selectedPulls.has(m.id)} onChange={() => togglePullSelect(m.id)} className="ui-checkbox" />
                          <span className="font-medium">{m.id}</span>
                        </label>
                      ))}
                    </div>
                    <button onClick={importSelected} disabled={selectedPulls.size === 0 || pullImporting}
                      className="ui-primary-button">
                      {pullImporting ? '导入中...' : `导入 ${selectedPulls.size} 个模型`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Model form */}
          <div className="ui-surface p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{editingModel ? '编辑模型' : '添加模型'}</h3>
              {!editingModel && (
                <button onClick={openNewModel} className="ui-primary-button px-3 py-1.5">
                  <Plus className="h-4 w-4" />新建
                </button>
              )}
            </div>

            {showModelForm && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {providerOptions.length === 0 && (
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">先添加一个服务商</p>
                      <p className="mt-0.5 text-xs text-primary/80">模型需要绑定到服务商后才能保存。</p>
                    </div>
                    <button type="button" onClick={() => setTab('providers')} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium hover:bg-primary/10">
                      去添加
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">服务商</label>
                  <SelectMenu
                    value={modelForm.provider_id}
                    options={providerOptions}
                    onChange={providerId => setModelForm(f => ({ ...f, provider_id: providerId }))}
                    placeholder="选择服务商"
                    disabled={providerOptions.length === 0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Model ID</label>
                  <input type="text" value={modelForm.model_id} onChange={e => setModelForm(f => ({ ...f, model_id: e.target.value }))}
                    className="ui-input w-full" placeholder="gpt-4o" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">显示名称</label>
                  <input type="text" value={modelForm.display_name} onChange={e => setModelForm(f => ({ ...f, display_name: e.target.value }))}
                    className="ui-input w-full" placeholder="GPT-4o" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">类型</label>
                  <SelectMenu<ModelType>
                    value={modelForm.type}
                    options={modelTypeOptions}
                    onChange={type => setModelForm(f => ({ ...f, type }))}
                  />
                </div>

                {/* Capabilities */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">模型能力</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {MODEL_CAP_LABELS.map(({ key, label, icon: Icon }) => (
                      <CheckboxCard
                        key={key}
                        checked={modelForm.capabilities[key] || false}
                        onCheckedChange={checked => setModelForm(f => ({ ...f, capabilities: { ...f.capabilities, [key]: checked } }))}
                        label={label}
                        icon={Icon}
                      />
                    ))}
                  </div>
                </div>

                {/* Default params */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">默认参数</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Temperature</label>
                      <input type="number" step="0.1" min="0" max="2" value={modelForm.default_params.temperature ?? ''}
                        onChange={e => setModelForm(f => ({ ...f, default_params: { ...f.default_params, temperature: parseFloat(e.target.value) || undefined } }))}
                        className="ui-input w-full px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Max Tokens</label>
                      <input type="number" value={modelForm.default_params.max_tokens ?? ''}
                        onChange={e => setModelForm(f => ({ ...f, default_params: { ...f.default_params, max_tokens: parseInt(e.target.value) || undefined } }))}
                        className="ui-input w-full px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Top P</label>
                      <input type="number" step="0.1" min="0" max="1" value={modelForm.default_params.top_p ?? ''}
                        onChange={e => setModelForm(f => ({ ...f, default_params: { ...f.default_params, top_p: parseFloat(e.target.value) || undefined } }))}
                        className="ui-input w-full px-2 py-1.5" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <CheckboxCard
                    checked={modelForm.is_default_per_type}
                    onCheckedChange={checked => setModelForm(f => ({ ...f, is_default_per_type: checked }))}
                    label={`设为 ${modelForm.type} 类型默认`}
                  />
                  <CheckboxCard
                    checked={modelForm.is_active}
                    onCheckedChange={checked => setModelForm(f => ({ ...f, is_active: checked }))}
                    label="启用模型"
                  />
                </div>

                {modelError && <div className="sm:col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{modelError}</div>}

                <div className="sm:col-span-2 flex gap-2">
                  <button onClick={saveModel} disabled={modelSaving || !canSaveModel}
                    className="ui-primary-button">
                    <Save className="h-4 w-4" />{modelSaving ? '保存中...' : (editingModel ? '更新' : '添加')}
                  </button>
                  {(editingModel || showModelForm) && (
                    <button onClick={cancelModelForm} className="ui-ghost-button">取消</button>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Model list */}
          <div className="space-y-2">
          {mLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}</div>
          ) : models.length === 0 ? (
            <div className="ui-surface border-dashed p-10 text-center text-sm text-muted-foreground">暂无模型</div>
          ) : (
            <div className="space-y-1">
              {models.map(m => (
                <div key={m.id} className={cn(
                  'ui-surface flex items-center justify-between p-3',
                  editingModel?.id === m.id && 'ring-2 ring-ring',
                  !m.is_active && 'opacity-60'
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.display_name}</span>
                      <span className="text-xs text-muted-foreground">{m.model_id}</span>
                      <span className="ui-chip">{MODEL_TYPES.find(t => t.value === m.type)?.label || m.type}</span>
                      {m.is_default_per_type && <span className="ui-chip border-primary/20 bg-primary/10 text-primary">默认</span>}
                      {/* Capability badges */}
                      {MODEL_CAP_LABELS.filter(c => (m.capabilities as any)?.[c.key]).map(c => (
                        <span key={c.key} className="text-muted-foreground" title={c.label}><c.icon /></span>
                      ))}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {providers.find(p => p.id === m.provider_id)?.name}
                      {m.default_params.temperature != null && ` · T:${m.default_params.temperature}`}
                      {m.default_params.max_tokens != null && ` · ${m.default_params.max_tokens}t`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button onClick={() => openEditModel(m)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
                    <ConfirmAction onConfirm={() => handleDeleteModel(m.id)} title="删除" confirmLabel="删除">
                      <Trash2 className="h-4 w-4" />
                    </ConfirmAction>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
