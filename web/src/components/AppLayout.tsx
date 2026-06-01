import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatView } from '@/pages/ChatView';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { SearchProvidersPage } from '@/pages/SearchProvidersPage';
import { AssistantsPage } from '@/pages/AssistantsPage';
import { KnowledgeBasesPage } from '@/pages/KnowledgeBasesPage';
import { McpPage } from '@/pages/McpPage';
import { ExportPage } from '@/pages/ExportPage';
import { HomePage } from '@/pages/HomePage';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r bg-background transition-transform lg:static lg:translate-x-0',
          'lg:w-[280px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          theme={theme}
          onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
        {/* Mobile header */}
        <div className="flex items-center gap-2 border-b bg-card px-4 py-2 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="打开侧边栏"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold">WebLLM</span>
        </div>

        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat/:id" element={<ChatView />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/providers/:id" element={<ProvidersPage />} />
            <Route path="/models" element={<ProvidersPage />} />
            <Route path="/knowledge-bases" element={<KnowledgeBasesPage />} />
            <Route path="/knowledge-bases/:id" element={<KnowledgeBasesPage />} />
            <Route path="/search-providers" element={<SearchProvidersPage />} />
            <Route path="/assistants" element={<AssistantsPage />} />
            <Route path="/mcp" element={<McpPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
