import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Bot, Check, Cloud, Database, Download, Monitor, Moon, RefreshCw, Sparkles, Sun, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectMenu, type SelectOption } from '@/components/FormControls';
import { api } from '@/services/api';
import type { Model, Provider } from '@/types';
import {
  getUserPreferences,
  resetUserPrompts,
  saveUserPreferences,
  type UserPreferences,
} from '@/lib/userPreferences';

const THEMES = [
  { v: 'light', l: '浅色', icon: Sun },
  { v: 'dark', l: '深色', icon: Moon },
  { v: 'system', l: '系统', icon: Monitor },
];

export function SettingsPage() {
  const user = useAuthStore(s => s.user);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [preferences, setPreferences] = useState<UserPreferences>(() => getUserPreferences());
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([api.getModels(), api.getProviders()])
      .then(([modelData, providerData]) => {
        setModels(modelData);
        setProviders(providerData);
      })
      .catch(() => setMsg('模型列表加载失败'));
  }, []);

  function saveTheme(t: string) {
    setTheme(t);
    localStorage.setItem('theme', t);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else if (t === 'light') document.documentElement.classList.remove('dark');
    else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }

  async function handleExportConfig() {
    try {
      const res = await fetch('/api/config/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ action: 'export' }),
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'webllm-config.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      setMsg('配置已导出');
    } catch { setMsg('导出失败'); }
  }

  async function handleImportConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        await fetch('/api/config/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ action: 'import', config }),
        });
        setMsg('配置已导入');
      } catch { setMsg('导入失败'); }
    };
    input.click();
  }

  function updatePreferences(next: Partial<UserPreferences>, showSaved = true) {
    setPreferences(saveUserPreferences(next));
    if (showSaved) setMsg('设置已保存');
  }

  function handleResetPrompts() {
    setPreferences(resetUserPrompts());
    setMsg('提示词已恢复默认');
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 3000); return () => clearTimeout(t); } }, [msg]);

  const providerNameById = new Map(providers.map(provider => [provider.id, provider.name]));
  const chatModelOptions = buildModelOptions(models.filter(isChatLikeModel), providerNameById);
  const visionModelOptions = buildModelOptions(models.filter(model => model.is_active && (model.capabilities?.vision || model.type === 'vision')), providerNameById);

  return (
    <div className="app-page">
      <div className="app-page-inner max-w-3xl">
        <header className="app-page-header">
          <div>
            <h2 className="app-title">设置</h2>
            <p className="app-subtitle">登录用户: {user?.username || '-'}</p>
          </div>
        </header>

        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">外观</h3>
              <p className="mt-1 text-sm text-muted-foreground">选择界面主题</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {THEMES.map(t => {
              const Icon = t.icon;
              const active = theme === t.v;
              return (
                <button
                  key={t.v}
                  onClick={() => saveTheme(t.v)}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:bg-accent',
                    active && 'border-primary bg-primary/10 text-primary'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {t.l}
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="font-medium">模型默认值</h3>
              <p className="mt-1 text-sm text-muted-foreground">新对话、标题生成和图片 OCR 的默认模型</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">默认对话模型</span>
              <SelectMenu
                value={preferences.defaultConversationModelId}
                options={chatModelOptions}
                onChange={value => updatePreferences({ defaultConversationModelId: value })}
                placeholder="未设置"
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-sm font-medium">标题生成模型</span>
              <SelectMenu
                value={preferences.titleGenerationModelId}
                options={chatModelOptions}
                onChange={value => updatePreferences({ titleGenerationModelId: value })}
                placeholder="未设置"
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-sm font-medium">OCR 模型</span>
              <SelectMenu
                value={preferences.ocrModelId}
                options={visionModelOptions}
                onChange={value => updatePreferences({ ocrModelId: value })}
                placeholder="未设置"
              />
              <span className="text-xs text-muted-foreground">当前对话模型不支持识图时，会先用 OCR 模型识别图片，再把识别结果加入当前消息。</span>
            </div>
          </div>
        </section>

        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <div>
                <h3 className="font-medium">提示词</h3>
                <p className="mt-1 text-sm text-muted-foreground">标题生成与 OCR 识图的默认指令</p>
              </div>
            </div>
            <button onClick={handleResetPrompts} className="ui-secondary-button px-2.5 py-1.5">
              <RefreshCw className="h-3.5 w-3.5" />恢复默认
            </button>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">标题生成提示词</span>
              <textarea
                value={preferences.titleGenerationPrompt}
                onChange={event => updatePreferences({ titleGenerationPrompt: event.target.value }, false)}
                className="ui-input min-h-[128px] w-full resize-y"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm font-medium">OCR 提示词</span>
              <textarea
                value={preferences.ocrPrompt}
                onChange={event => updatePreferences({ ocrPrompt: event.target.value }, false)}
                className="ui-input min-h-[168px] w-full resize-y"
              />
            </label>
          </div>
        </section>

        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">配置管理</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={handleExportConfig} className="ui-secondary-button justify-start">
              <Download className="h-4 w-4" />导出配置
            </button>
            <button onClick={handleImportConfig} className="ui-secondary-button justify-start">
              <Upload className="h-4 w-4" />导入配置
            </button>
          </div>
        </section>

        <section className="ui-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">存储</h3>
          </div>
          <p className="text-sm text-muted-foreground">数据存储在 Supabase Postgres，API keys 经 AES-256-GCM 加密后存储。</p>
        </section>
      </div>

      {msg && (
        <div className="fixed bottom-4 right-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">{msg}</div>
      )}
    </div>
  );
}

function isChatLikeModel(model: Model) {
  return model.is_active && (model.type === 'chat' || model.type === 'vision' || model.type === 'reasoning' || model.capabilities?.chat);
}

function buildModelOptions(models: Model[], providerNameById: Map<string, string>): SelectOption[] {
  return [
    { value: '', label: '未设置' },
    ...models.map(model => ({
      value: model.id,
      label: `${providerNameById.get(model.provider_id) || '未知服务商'} / ${model.display_name}`,
    })),
  ];
}
