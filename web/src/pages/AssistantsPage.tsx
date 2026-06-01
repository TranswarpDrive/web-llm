import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Save, Wand2 } from 'lucide-react';
import { CheckboxCard, ConfirmAction, SelectMenu, type SelectOption } from '@/components/FormControls';
import { useAssistantStore, type AssistantFormData } from '@/stores/assistantStore';
import { api } from '@/services/api';
import type { Assistant, Model, Provider, ModelParams } from '@/types';
import { PROMPT_VARIABLES, renderPromptVariables } from '@/lib/promptVariables';

const DEFAULT_PARAMS: ModelParams = { temperature: 0.7, max_tokens: 4096, top_p: 1.0 };

const DEFAULT_FORM: AssistantFormData = {
  name: '', emoji: '', system_prompt: '', default_model_id: null, params: { ...DEFAULT_PARAMS }, is_default: false,
};

export function AssistantsPage() {
  const { assistants, loading, fetch: fetchAssistants, create, update, remove } = useAssistantStore();
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Assistant | null>(null);
  const [form, setForm] = useState<AssistantFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { fetchAssistants(); }, [fetchAssistants]);
  useEffect(() => {
    Promise.all([api.getModels(), api.getProviders()])
      .then(([m, p]) => { setModels(m); setProviders(p); })
      .catch(() => {});
  }, []);

  const modelOptions: SelectOption[] = useMemo(() => {
    const nameById = new Map(providers.map(p => [p.id, p.name]));
    const chatModels = models.filter(m => m.is_active && (m.type === 'chat' || m.type === 'vision' || m.type === 'reasoning' || m.capabilities?.chat));
    return [{ value: '', label: '不指定（用当前对话模型）' }, ...chatModels.map(m => ({ value: m.id, label: `${nameById.get(m.provider_id) || '未知'} / ${m.display_name}` }))];
  }, [models, providers]);

  const selectedModelName = models.find(m => m.id === form.default_model_id)?.display_name;
  const preview = renderPromptVariables(form.system_prompt, { model: selectedModelName || '当前模型' });

  function openNew() {
    setEditing(null);
    setForm({ ...DEFAULT_FORM, params: { ...DEFAULT_PARAMS } });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(a: Assistant) {
    setEditing(a);
    setForm({
      name: a.name, emoji: a.emoji || '', system_prompt: a.system_prompt || '',
      default_model_id: a.default_model_id || null,
      params: { ...DEFAULT_PARAMS, ...(a.params || {}) },
      is_default: a.is_default,
    });
    setFormError('');
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditing(null); setFormError(''); }

  function insertVariable(token: string) {
    setForm(f => ({ ...f, system_prompt: f.system_prompt ? `${f.system_prompt}${token}` : token }));
  }

  async function handleSave() {
    setFormError(''); setSaving(true);
    try {
      const payload: AssistantFormData = { ...form, default_model_id: form.default_model_id || null };
      if (editing) await update(editing.id, payload);
      else await create(payload);
      setShowForm(false); setEditing(null);
    } catch (err: any) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  const canSave = Boolean(form.name.trim());

  return (
    <div className="app-page">
      <div className="app-page-inner-wide">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">助手</h2>
            <p className="app-subtitle">{assistants.length} 个助手，打包系统提示词、默认模型与参数</p>
          </div>
          <button onClick={openNew} className="ui-primary-button">
            <Plus className="h-4 w-4" />新建助手
          </button>
        </header>

        {showForm && (
          <section className="ui-surface space-y-4 p-4 sm:p-5">
            <h3 className="font-medium">{editing ? '编辑助手' : '新建助手'}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[88px_1fr]">
              <div>
                <label className="mb-1 block text-sm font-medium">图标</label>
                <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  className="ui-input w-full text-center text-lg" placeholder="🤖" maxLength={4} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">名称</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="ui-input w-full" placeholder="代码助手" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium">系统提示词</label>
                <div className="flex flex-wrap gap-1">
                  {PROMPT_VARIABLES.map(v => (
                    <button key={v.token} type="button" onClick={() => insertVariable(v.token)}
                      className="ui-chip px-1.5 py-0.5 text-[11px] hover:bg-accent" title={v.label}>
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                className="ui-input min-h-[140px] w-full resize-y" placeholder="你是一个乐于助人的助手。现在是 {datetime}，当前模型是 {model}。" />
              {form.system_prompt.includes('{') && (
                <p className="mt-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                  预览：{preview || '（空）'}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">默认模型</label>
              <SelectMenu value={form.default_model_id || ''} options={modelOptions}
                onChange={v => setForm(f => ({ ...f, default_model_id: v || null }))} placeholder="不指定" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">默认参数</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Temperature</label>
                  <input type="number" step="0.1" min="0" max="2" value={form.params.temperature ?? ''}
                    onChange={e => setForm(f => ({ ...f, params: { ...f.params, temperature: parseFloat(e.target.value) || undefined } }))}
                    className="ui-input w-full px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Max Tokens</label>
                  <input type="number" value={form.params.max_tokens ?? ''}
                    onChange={e => setForm(f => ({ ...f, params: { ...f.params, max_tokens: parseInt(e.target.value) || undefined } }))}
                    className="ui-input w-full px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Top P</label>
                  <input type="number" step="0.1" min="0" max="1" value={form.params.top_p ?? ''}
                    onChange={e => setForm(f => ({ ...f, params: { ...f.params, top_p: parseFloat(e.target.value) || undefined } }))}
                    className="ui-input w-full px-2 py-1.5" />
                </div>
              </div>
            </div>

            <CheckboxCard checked={form.is_default} onCheckedChange={c => setForm(f => ({ ...f, is_default: c }))} label="设为默认助手" />

            {formError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={handleSave} disabled={saving || !canSave} className="ui-primary-button">
                <Save className="h-4 w-4" />{saving ? '保存中...' : (editing ? '更新' : '创建')}
              </button>
              <button onClick={cancelForm} className="ui-ghost-button">取消</button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />)}</div>
        ) : assistants.length === 0 ? (
          <div className="ui-surface border-dashed p-12 text-center text-sm text-muted-foreground">
            暂无助手。新建后可在对话中一键套用提示词、模型与参数。
          </div>
        ) : (
          <div className="grid gap-3">
            {assistants.map(a => {
              const modelName = models.find(m => m.id === a.default_model_id)?.display_name;
              return (
                <article key={a.id} className="ui-surface p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-lg">
                        {a.emoji || <Wand2 className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{a.name}</span>
                          {a.is_default && <span className="ui-chip border-primary/20 bg-primary/10 text-primary">默认</span>}
                          {modelName && <span className="ui-chip">{modelName}</span>}
                        </div>
                        {a.system_prompt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.system_prompt}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEdit(a)} className="ui-icon-button" title="编辑"><Pencil className="h-4 w-4" /></button>
                      <ConfirmAction onConfirm={() => remove(a.id)} title="删除" confirmLabel="删除">
                        <Trash2 className="h-4 w-4" />
                      </ConfirmAction>
                    </div>
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
