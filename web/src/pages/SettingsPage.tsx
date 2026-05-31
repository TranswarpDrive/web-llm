import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Database, Cloud, Download, Upload } from 'lucide-react';

export function SettingsPage() {
  const user = useAuthStore(s => s.user);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [msg, setMsg] = useState('');

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

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 3000); return () => clearTimeout(t); } }, [msg]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-sm text-muted-foreground mt-1">登录用户: {user?.username}</p>
      </div>

      {/* Theme */}
      <section className="rounded-lg border p-4">
        <h3 className="font-medium mb-3">外观</h3>
        <div className="flex gap-2">
          {[{ v: 'light', l: '浅色' }, { v: 'dark', l: '深色' }, { v: 'system', l: '跟随系统' }].map(t => (
            <button key={t.v} onClick={() => saveTheme(t.v)}
              className={`rounded-md px-4 py-1.5 text-sm border ${theme === t.v ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </section>

      {/* Config */}
      <section className="rounded-lg border p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Database className="h-4 w-4" />配置管理</h3>
        <p className="text-sm text-muted-foreground mb-3">导出或导入完整配置（服务商、模型、MCP等）</p>
        <div className="flex gap-2">
          <button onClick={handleExportConfig} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent">
            <Download className="h-4 w-4" />导出配置
          </button>
          <button onClick={handleImportConfig} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" />导入配置
          </button>
        </div>
      </section>

      {/* Database info */}
      <section className="rounded-lg border p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2"><Cloud className="h-4 w-4" />存储</h3>
        <p className="text-sm text-muted-foreground">数据存储在 Supabase Postgres，API keys 经 AES-256-GCM 加密后存储。</p>
      </section>

      {msg && (
        <div className="fixed bottom-4 right-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">{msg}</div>
      )}
    </div>
  );
}
