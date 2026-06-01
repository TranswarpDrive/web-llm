import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProviderStore, type ProviderFormData } from '@/stores/providerStore';
import { useModelStore, type ModelFormData } from '@/stores/modelStore';
import type { Provider, Model, ModelType, ModelCapabilities } from '@/types';
import { Plus, Pencil, Trash2, Loader2, Save, Eye, Brain, Image, Wrench, Hash, ArrowUpDown, AlertCircle, Cpu, Bot, ChevronRight, Wifi, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CheckboxCard, ConfirmAction, SelectMenu } from '@/components/FormControls';

const MODEL_CAP_LABELS: { key: keyof ModelCapabilities; label: string; icon: React.ElementType }[] = [
  { key: 'chat', label: '对话', icon: MessageIcon },
  { key: 'vision', label: '识图', icon: Eye },
  { key: 'reasoning', label: '思考', icon: Brain },
  { key: 'image_gen', label: '生图', icon: Image },
  { key: 'tool_calling', label: '工具调用', icon: Wrench },
  { key: 'embedding', label: '嵌入', icon: Hash },
  { key: 'rerank', label: '重排序', icon: ArrowUpDown },
];

function MessageIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Small capability chips (icon + label) for a model. */
function CapabilityChips({ caps }: { caps?: ModelCapabilities }) {
  const active = MODEL_CAP_LABELS.filter(c => (caps as any)?.[c.key]);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(({ key, label, icon: Icon }) => (
        <span key={key} className="ui-chip gap-1 px-1.5 py-0.5 text-[11px]">
          <Icon className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
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

const EMPTY_CAPS: ModelCapabilities = { chat: true, vision: false, reasoning: false, image_gen: false, tool_calling: false, embedding: false, rerank: false };

const DEFAULT_MODEL_FORM: ModelFormData = {
  provider_id: '', model_id: '', display_name: '', type: 'chat',
  capabilities: { ...EMPTY_CAPS },
  default_params: { temperature: 0.7, max_tokens: 4096, top_p: 1.0 },
  is_default_per_type: false, is_active: true,
};

// Special selection sentinel for the aggregated "all models" view.
const ALL = '__all__';

export function ProvidersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  const { providers, loading: pLoading, fetch: fetchProviders, create: createP, update: updateP, remove: removeP, testConnection } = useProviderStore();
  const { models, loading: mLoading, fetch: fetchModels, create: createM, update: updateM, remove: removeM, batchCreate } = useModelStore();

  // Master-detail selection: ALL | providerId
  const [selected, setSelected] = useState<string>(location.pathname === '/models' ? ALL : (params.id || ''));
  const [adding, setAdding] = useState(false);

  // Provider form state
  const [editingProv, setEditingProv] = useState<Provider | null>(null);
  const [provForm, setProvForm] = useState<ProviderFormData>(DEFAULT_PROVIDER_FORM);
  const [provSaving, setProvSaving] = useState(false);
  const [provError, setProvError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; message?: string; model_count?: number } | null>(null);
  // Advanced: custom request headers / body
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>([]);
  const [bodyText, setBodyText] = useState('');
  const [bodyError, setBodyError] = useState('');

  // Model form state
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormData>(DEFAULT_MODEL_FORM);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState('');

  // Pull models state
  const [pullModels, setPullModels] = useState<Array<{ id: string; owned_by: string }>>([]);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullError, setPullError] = useState('');
  const [selectedPulls, setSelectedPulls] = useState<Set<string>>(new Set());
  const [pullImporting, setPullImporting] = useState(false);
  const [showPullSection, setShowPullSection] = useState(false);

  useEffect(() => { fetchProviders(); fetchModels(); }, [fetchProviders, fetchModels]);

  // Sync selection with the route. /models -> all models; /providers/:id -> that provider;
  // /providers -> first provider (or the add form when there are none).
  useEffect(() => {
    if (location.pathname === '/models') { setSelected(ALL); setAdding(false); return; }
    if (params.id) { setSelected(params.id); setAdding(false); return; }
    // bare /providers
    setSelected(prev => (prev && prev !== ALL ? prev : (providers[0]?.id || '')));
  }, [location.pathname, params.id, providers]);

  // Load the provider form whenever the selected provider changes.
  useEffect(() => {
    if (adding || selected === ALL) return;
    const p = providers.find(x => x.id === selected);
    if (p) {
      setEditingProv(p);
      setProvForm({ name: p.name, base_url: p.base_url, api_key: '', is_active: p.is_active });
      setProvError('');
      setHeaderRows(Object.entries(p.custom_headers || {}).map(([key, value]) => ({ key, value: String(value) })));
      setBodyText(p.custom_body && Object.keys(p.custom_body).length > 0 ? JSON.stringify(p.custom_body, null, 2) : '');
    }
    // reset model form when switching providers
    setShowModelForm(false); setEditingModel(null); setModelError('');
    setPullModels([]); setShowPullSection(false); setPullError('');
    setTestResult(null); setBodyError(''); setShowAdvanced(false);
  }, [selected, adding, providers]);

  const activeProviders = providers.filter(p => p.is_active);
  const providerOptions = activeProviders.map(p => ({ value: p.id, label: p.name }));
  const modelTypeOptions = MODEL_TYPES.map(t => ({ value: t.value, label: t.label }));
  const selectedProvider = providers.find(p => p.id === selected);
  const detailModels = useMemo(() => models.filter(m => m.provider_id === selected), [models, selected]);

  // ---- Navigation helpers ----
  function selectProvider(id: string) { navigate(`/providers/${id}`); }
  function selectAll() { navigate('/models'); }
  function startAddProvider() {
    setAdding(true);
    setEditingProv(null);
    setProvForm(DEFAULT_PROVIDER_FORM);
    setProvError('');
    setShowModelForm(false);
    setHeaderRows([]); setBodyText(''); setBodyError(''); setShowAdvanced(false); setTestResult(null);
  }

  // ---- Provider handlers ----
  // Build custom_headers / custom_body from the advanced editor; throws on invalid JSON.
  function buildCustomRequest() {
    const custom_headers: Record<string, string> = {};
    for (const { key, value } of headerRows) {
      const k = key.trim();
      if (k) custom_headers[k] = value;
    }
    let custom_body: Record<string, unknown> = {};
    const trimmed = bodyText.trim();
    if (trimmed) {
      let parsed: unknown;
      try { parsed = JSON.parse(trimmed); }
      catch { throw new Error('自定义请求体不是合法的 JSON'); }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('自定义请求体必须是 JSON 对象');
      }
      custom_body = parsed as Record<string, unknown>;
    }
    return { custom_headers, custom_body };
  }

  async function saveProvider() {
    setProvError(''); setBodyError('');
    let customReq: { custom_headers: Record<string, string>; custom_body: Record<string, unknown> };
    try { customReq = buildCustomRequest(); }
    catch (err: any) { setBodyError(err.message); setShowAdvanced(true); return; }

    setProvSaving(true);
    try {
      if (editingProv && !adding) {
        const data: Partial<ProviderFormData> = { ...provForm, ...customReq };
        if (!data.api_key) delete (data as any).api_key;
        await updateP(editingProv.id, data);
      } else {
        if (!provForm.api_key) throw new Error('API key is required');
        await createP({ ...provForm, ...customReq });
        setAdding(false);
      }
    } catch (err: any) { setProvError(err.message); }
    finally { setProvSaving(false); }
  }

  async function handleTest(id: string) {
    setTesting(true); setTestResult(null);
    try {
      const result = await testConnection(id);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ status: 'error', message: err?.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  }

  async function handleDeleteProvider(id: string) {
    await removeP(id);
    navigate('/providers');
  }

  // ---- Model handlers ----
  function openNewModel(providerId: string) {
    setEditingModel(null);
    setShowModelForm(true);
    setModelForm({ ...DEFAULT_MODEL_FORM, capabilities: { ...EMPTY_CAPS }, provider_id: providerId || activeProviders[0]?.id || '' });
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
      capabilities: { ...(m.capabilities || EMPTY_CAPS) },
      default_params: { ...(m.default_params || {}) },
      is_default_per_type: m.is_default_per_type,
      is_active: m.is_active,
    });
    setModelError('');
  }

  async function saveModel() {
    setModelError(''); setModelSaving(true);
    try {
      if (editingModel) await updateM(editingModel.id, modelForm);
      else await createM(modelForm);
      setEditingModel(null);
      setShowModelForm(false);
    } catch (err: any) { setModelError(err.message); }
    finally { setModelSaving(false); }
  }

  function cancelModelForm() {
    setShowModelForm(false);
    setEditingModel(null);
    setModelError('');
  }

  async function handleDeleteModel(id: string) { await removeM(id); }

  // ---- Pull models (scoped to a provider) ----
  async function fetchRemoteModels(providerId: string) {
    if (!providerId) return;
    setPullLoading(true); setPullError(''); setPullModels([]); setSelectedPulls(new Set());
    try {
      const token = localStorage.getItem('token');
      const res = await window.fetch(`/api/providers/${providerId}/remote-models`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setPullError(data?.error?.message || 'Failed'); return; }
      const existing = new Set(models.filter(m => m.provider_id === providerId).map(m => m.model_id));
      setPullModels((data.models || []).filter((m: any) => !existing.has(m.id)));
    } catch (err: any) { setPullError(err.message); }
    finally { setPullLoading(false); }
  }

  function togglePullSelect(id: string) {
    setSelectedPulls(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function importSelected(providerId: string) {
    if (selectedPulls.size === 0) return;
    setPullImporting(true); setPullError('');
    try {
      const toImport = pullModels.filter(m => selectedPulls.has(m.id)).map(m => ({
        provider_id: providerId, model_id: m.id, display_name: m.id, type: 'chat' as ModelType,
        capabilities: { ...EMPTY_CAPS },
        default_params: { temperature: 0.7, max_tokens: 4096, top_p: 1.0 },
        is_default_per_type: false, is_active: true,
      }));
      await batchCreate(toImport);
      setShowPullSection(false); setPullModels([]);
    } catch (err: any) { setPullError(err.message); }
    finally { setPullImporting(false); }
  }

  const canSaveProvider = Boolean(provForm.name.trim() && provForm.base_url.trim() && ((editingProv && !adding) || provForm.api_key.trim()));
  const canSaveModel = Boolean(modelForm.provider_id && modelForm.model_id.trim() && modelForm.display_name.trim());

  // ---- Model form block (shared between provider detail and all-models view) ----
  function renderModelForm(lockProvider: boolean) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {providerOptions.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary sm:col-span-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">先添加一个服务商</p>
              <p className="mt-0.5 text-xs text-primary/80">模型需要绑定到服务商后才能保存。</p>
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">服务商</label>
          <SelectMenu
            value={modelForm.provider_id}
            options={providerOptions}
            onChange={providerId => setModelForm(f => ({ ...f, provider_id: providerId }))}
            placeholder="选择服务商"
            disabled={lockProvider || providerOptions.length === 0}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Model ID</label>
          <input type="text" value={modelForm.model_id} onChange={e => setModelForm(f => ({ ...f, model_id: e.target.value }))}
            className="ui-input w-full" placeholder="gpt-4o" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">显示名称</label>
          <input type="text" value={modelForm.display_name} onChange={e => setModelForm(f => ({ ...f, display_name: e.target.value }))}
            className="ui-input w-full" placeholder="GPT-4o" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">类型</label>
          <SelectMenu<ModelType>
            value={modelForm.type}
            options={modelTypeOptions}
            onChange={type => setModelForm(f => ({ ...f, type }))}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium">模型能力</label>
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

        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium">默认参数</label>
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

        {modelError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{modelError}</div>}

        <div className="flex gap-2 sm:col-span-2">
          <button onClick={saveModel} disabled={modelSaving || !canSaveModel} className="ui-primary-button">
            <Save className="h-4 w-4" />{modelSaving ? '保存中...' : (editingModel ? '更新' : '添加')}
          </button>
          <button onClick={cancelModelForm} className="ui-ghost-button">取消</button>
        </div>
      </div>
    );
  }

  // ---- A single model row (called as a function, not a JSX component, to avoid remounts) ----
  function modelRow(m: Model, showProvider = false) {
    return (
      <div key={m.id} className={cn(
        'ui-surface flex items-start justify-between gap-2 p-3',
        editingModel?.id === m.id && 'ring-2 ring-ring',
        !m.is_active && 'opacity-60'
      )}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{m.display_name}</span>
            <span className="text-xs text-muted-foreground">{m.model_id}</span>
            <span className="ui-chip">{MODEL_TYPES.find(t => t.value === m.type)?.label || m.type}</span>
            {m.is_default_per_type && <span className="ui-chip border-primary/20 bg-primary/10 text-primary">默认</span>}
          </div>
          <div className="mt-1.5"><CapabilityChips caps={m.capabilities} /></div>
          <div className="mt-1 text-xs text-muted-foreground">
            {showProvider && (providers.find(p => p.id === m.provider_id)?.name || '未知服务商')}
            {m.default_params.temperature != null && `${showProvider ? ' · ' : ''}T:${m.default_params.temperature}`}
            {m.default_params.max_tokens != null && ` · ${m.default_params.max_tokens}t`}
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <button onClick={() => openEditModel(m)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
          <ConfirmAction onConfirm={() => handleDeleteModel(m.id)} title="删除" confirmLabel="删除">
            <Trash2 className="h-4 w-4" />
          </ConfirmAction>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">服务商与模型</h2>
            <p className="app-subtitle">{providers.length} 个服务商，{models.length} 个模型</p>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
          {/* ===== Left: master list ===== */}
          <nav className="space-y-1 xl:sticky xl:top-5 xl:self-start">
            <button
              onClick={selectAll}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                selected === ALL && !adding ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
              )}
            >
              <Bot className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">全部模型</span>
              <span className="text-[11px] text-muted-foreground">{models.length}</span>
            </button>

            <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">服务商</div>

            {pLoading ? (
              <div className="space-y-1">{[1, 2, 3].map(i => <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />)}</div>
            ) : (
              providers.map(p => {
                const count = models.filter(m => m.provider_id === p.id).length;
                const active = selected === p.id && !adding;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProvider(p.id)}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                      active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                      !p.is_active && 'opacity-60'
                    )}
                  >
                    <Cpu className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
                    <span className="ui-chip px-1.5 py-0.5 text-[11px]">{count}</span>
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition', active && 'text-foreground')} />
                  </button>
                );
              })
            )}

            <button
              onClick={startAddProvider}
              className={cn(
                'mt-1 flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-sm transition-colors',
                adding ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">添加服务商</span>
            </button>
          </nav>

          {/* ===== Right: detail ===== */}
          <div className="min-w-0">
            {adding || (selected !== ALL && selectedProvider) || (selected !== ALL && providers.length === 0) ? (
              providerDetail()
            ) : selected === ALL ? (
              allModelsView()
            ) : (
              <div className="ui-surface border-dashed p-10 text-center text-sm text-muted-foreground">
                {pLoading ? '加载中...' : '选择左侧的服务商，或点击「添加服务商」'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ===== Detail: a single provider (settings + its models) =====
  function providerDetail() {
    // No selected provider (e.g. fresh account with none yet) behaves like adding.
    const addMode = adding || !selectedProvider;
    return (
      <div className="space-y-5">
        {/* Provider settings (inline edit) */}
        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-medium">{addMode ? '添加服务商' : `编辑服务商 · ${selectedProvider?.name || ''}`}</h3>
            {!addMode && selectedProvider && (
              <ConfirmAction onConfirm={() => handleDeleteProvider(selectedProvider.id)} title="删除服务商" confirmLabel="删除">
                <Trash2 className="h-4 w-4" />
              </ConfirmAction>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">名称</label>
              <input type="text" value={provForm.name} onChange={e => setProvForm(f => ({ ...f, name: e.target.value }))}
                className="ui-input w-full" placeholder="OpenAI" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Base URL</label>
              <input type="url" value={provForm.base_url} onChange={e => setProvForm(f => ({ ...f, base_url: e.target.value }))}
                className="ui-input w-full" placeholder="https://api.openai.com/v1" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                API Key {!addMode && <span className="text-muted-foreground">(留空则保持不变)</span>}
              </label>
              <input type="password" value={provForm.api_key} onChange={e => setProvForm(f => ({ ...f, api_key: e.target.value }))}
                className="ui-input w-full" placeholder={!addMode ? '••••••••' : 'sk-...'} />
            </div>
            <div className="sm:col-span-2">
              <CheckboxCard
                checked={provForm.is_active}
                onCheckedChange={checked => setProvForm(f => ({ ...f, is_active: checked }))}
                label="启用服务商"
                className="w-full sm:w-auto"
              />
            </div>

            {/* Advanced: custom request headers / body */}
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn('h-4 w-4 transition', showAdvanced && 'rotate-90')} />
                自定义请求
                {(headerRows.length > 0 || bodyText.trim()) && <span className="ui-chip px-1.5 py-0.5 text-[11px]">已配置</span>}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 rounded-md border bg-background p-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-sm font-medium">自定义请求头</label>
                      <button
                        type="button"
                        onClick={() => setHeaderRows(rows => [...rows, { key: '', value: '' }])}
                        className="ui-ghost-button px-2 py-1 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />添加请求头
                      </button>
                    </div>
                    {headerRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">为该服务商的所有请求附加额外 HTTP 头（如代理鉴权）。</p>
                    ) : (
                      <div className="space-y-2">
                        {headerRows.map((row, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              value={row.key}
                              onChange={e => setHeaderRows(rows => rows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                              className="ui-input w-full px-2 py-1.5" placeholder="Header 名称"
                            />
                            <input
                              value={row.value}
                              onChange={e => setHeaderRows(rows => rows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                              className="ui-input w-full px-2 py-1.5" placeholder="值"
                            />
                            <button
                              type="button"
                              onClick={() => setHeaderRows(rows => rows.filter((_, idx) => idx !== i))}
                              className="ui-icon-button shrink-0" title="移除"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium">自定义请求体 (JSON)</label>
                    <textarea
                      value={bodyText}
                      onChange={e => { setBodyText(e.target.value); if (bodyError) setBodyError(''); }}
                      className="ui-input min-h-[96px] w-full resize-y font-mono text-xs"
                      placeholder={'{\n  "enable_thinking": true\n}'}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">合并进 /chat/completions 请求体；model、messages、stream 等字段不会被覆盖。</p>
                    {bodyError && <p className="mt-1 text-xs text-destructive">{bodyError}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
          {provError && <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{provError}</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={saveProvider} disabled={provSaving || !canSaveProvider} className="ui-primary-button">
              <Save className="h-4 w-4" />{provSaving ? '保存中...' : (addMode ? '添加' : '更新')}
            </button>
            {!addMode && selectedProvider && (
              <button onClick={() => handleTest(selectedProvider.id)} disabled={testing} className="ui-secondary-button">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                {testing ? '测试中...' : '测试连接'}
              </button>
            )}
            {adding && <button onClick={() => { setAdding(false); navigate('/providers'); }} className="ui-ghost-button">取消</button>}
          </div>
          {testResult && (
            <div className={cn(
              'mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm',
              testResult.status === 'ok'
                ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
            )}>
              {testResult.status === 'ok'
                ? <><Check className="h-4 w-4" />已连接！{testResult.model_count} 个模型可用</>
                : <><X className="h-4 w-4" />{testResult.message || '连接失败'}</>}
            </div>
          )}
        </section>

        {/* Models belonging to this provider */}
        {!addMode && selectedProvider && (
          <section className="ui-surface p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-medium">模型 <span className="text-sm font-normal text-muted-foreground">({detailModels.length})</span></h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowPullSection(v => !v); if (!showPullSection) fetchRemoteModels(selectedProvider.id); }}
                  className="ui-ghost-button px-2.5 py-1.5 text-sm"
                >
                  {showPullSection ? '收起拉取' : '拉取模型'}
                </button>
                <button onClick={() => openNewModel(selectedProvider.id)} className="ui-primary-button px-3 py-1.5">
                  <Plus className="h-4 w-4" />新建
                </button>
              </div>
            </div>

            {/* Pull-from-provider section */}
            {showPullSection && (
              <div className="mb-4 space-y-3 rounded-md border bg-background p-3">
                {pullLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />获取远端模型...</div>
                ) : pullError ? (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{pullError}</div>
                ) : pullModels.length === 0 ? (
                  <div className="text-sm text-muted-foreground">没有可导入的新模型。</div>
                ) : (
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
                    <button onClick={() => importSelected(selectedProvider.id)} disabled={selectedPulls.size === 0 || pullImporting} className="ui-primary-button">
                      {pullImporting ? '导入中...' : `导入 ${selectedPulls.size} 个模型`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Model form */}
            {showModelForm && (
              <div className="mb-4 rounded-md border bg-background p-3 sm:p-4">
                {renderModelForm(true)}
              </div>
            )}

            {/* Model list */}
            {mLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}</div>
            ) : detailModels.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">该服务商暂无模型，点击「新建」或「拉取模型」</div>
            ) : (
              <div className="space-y-2">
                {detailModels.map(m => modelRow(m))}
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  // ===== Detail: all models across providers =====
  function allModelsView() {
    const grouped = providers
      .map(p => ({ provider: p, list: models.filter(m => m.provider_id === p.id) }))
      .filter(g => g.list.length > 0);
    return (
      <div className="space-y-5">
        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-medium">全部模型 <span className="text-sm font-normal text-muted-foreground">({models.length})</span></h3>
            <button
              onClick={() => openNewModel('')}
              disabled={providerOptions.length === 0}
              className="ui-primary-button px-3 py-1.5"
            >
              <Plus className="h-4 w-4" />新建
            </button>
          </div>

          {showModelForm && (
            <div className="mb-4 rounded-md border bg-background p-3 sm:p-4">
              {renderModelForm(false)}
            </div>
          )}

          {mLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}</div>
          ) : models.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">暂无模型</div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ provider, list }) => (
                <div key={provider.id} className="space-y-2">
                  <button
                    onClick={() => selectProvider(provider.id)}
                    className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
                  >
                    <Cpu className="h-3.5 w-3.5" />{provider.name}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  {list.map(m => modelRow(m))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }
}
