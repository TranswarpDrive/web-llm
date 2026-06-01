import { useEffect, useMemo, useState, type ElementType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useConversationStore } from '@/stores/conversationStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  Archive,
  BookOpen,
  Bot,
  ChevronDown,
  Cpu,
  Database,
  FileDown,
  Globe,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { generateConversationTitle } from '@/lib/aiTasks';
import { getUserPreferences } from '@/lib/userPreferences';

interface SidebarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onClose: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: ElementType;
  hint?: string;
}

function NavRow({
  item,
  active,
  inset = false,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  inset?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        'group flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
        inset && 'ml-6',
        active
          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.hint && <span className="ml-auto text-[11px] text-muted-foreground">{item.hint}</span>}
    </Link>
  );
}

function NavSection({
  title,
  items,
  defaultOpen = true,
  onClose,
}: {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const location = useLocation();

  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground hover:bg-card/70"
      >
        {title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <div className="space-y-1">
          {items.map(item => (
            <NavRow
              key={item.path}
              item={item}
              active={item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)}
              inset
              onClick={onClose}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function Sidebar({ theme, onToggleTheme, onClose }: SidebarProps) {
  const { conversations, loading, loadList, update, remove } = useConversationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [titleGenerating, setTitleGenerating] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const canGenerateTitle = Boolean(getUserPreferences().titleGenerationModelId);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const workspaceItems: NavItem[] = [
    { path: '/providers', label: '服务商', icon: Cpu },
    { path: '/models', label: '模型', icon: Bot },
  ];

  const capabilityItems: NavItem[] = [
    { path: '/knowledge-bases', label: '知识库', icon: Database },
    { path: '/search-providers', label: '搜索服务', icon: Globe },
    { path: '/mcp', label: 'MCP 工具', icon: Server },
  ];

  const utilityItems: NavItem[] = [
    { path: '/export', label: '导出', icon: FileDown },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  const filtered = useMemo(() => conversations.filter(c => {
    const matchesSearch = searchQuery
      ? c.title.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesArchived = showArchived ? c.is_archived : !c.is_archived;
    return matchesSearch && matchesArchived;
  }), [conversations, searchQuery, showArchived]);

  function handleLogout() {
    useAuthStore.getState().logout();
    navigate('/login');
  }

  function handleNewChat() {
    navigate('/');
    onClose();
  }

  async function handleDelete(id: string) {
    setContextMenu(null);
    await remove(id);
    if (location.pathname === `/chat/${id}`) navigate('/');
  }

  async function handleArchive(id: string) {
    setContextMenu(null);
    await update(id, { is_archived: true } as any);
    loadList();
  }

  function startRename(id: string, currentTitle: string) {
    setRenaming(id);
    setRenameTitle(currentTitle);
    setContextMenu(null);
  }

  async function handleRename(id: string) {
    if (renameTitle.trim()) await update(id, { title: renameTitle.trim() } as any);
    setRenaming(null);
  }

  async function handleRegenerateTitle(id: string) {
    if (!canGenerateTitle || titleGenerating) return;
    setContextMenu(null);
    setTitleGenerating(id);
    try {
      const title = await generateConversationTitle(id);
      await update(id, { title } as any);
    } catch {
      // Keep the menu quiet; the disabled state guides setup when no model is configured.
    } finally {
      setTitleGenerating(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background/95" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between px-3 py-3">
        <Link to="/" onClick={onClose} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-card/70">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            W
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">WebLLM</h1>
            <p className="text-[11px] text-muted-foreground">个人 AI 工作台</p>
          </div>
        </Link>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-card lg:hidden" aria-label="关闭侧边栏">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          新对话
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">最近对话</span>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              'rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground',
              showArchived && 'bg-card text-foreground'
            )}
            title={showArchived ? '显示活跃对话' : '显示归档对话'}
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索对话"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-md border bg-card pl-8 pr-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/15"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {loading ? (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((conv, index) => {
                // Dev mode can return the same placeholder id for multiple created rows.
                // Use a row key for UI state so one row's menu/editing state does not fan out.
                const rowKey = `${conv.id}-${index}`;

                return (
                  <div key={rowKey} className="relative">
                    {renaming === rowKey ? (
                      <input
                        value={renameTitle}
                        onChange={e => setRenameTitle(e.target.value)}
                        onBlur={() => handleRename(conv.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(conv.id);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        className="h-9 w-full rounded-md border bg-card px-2.5 text-sm outline-none focus:border-ring"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <Link
                        to={`/chat/${conv.id}`}
                        onClick={onClose}
                        className={cn(
                          'group flex h-9 items-center gap-2 rounded-md px-2.5 text-sm transition-colors',
                          location.pathname === `/chat/${conv.id}`
                            ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                        )}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{conv.title || '未命名对话'}</span>
                        {conv.is_archived && <Archive className="h-3 w-3 shrink-0" />}
                        <button
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu(contextMenu === rowKey ? null : rowKey);
                          }}
                          className="rounded p-1 opacity-0 hover:bg-accent group-hover:opacity-100"
                          title="更多"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                    )}

                  {contextMenu === rowKey && (
                    <div
                      className="absolute right-1 top-9 z-50 w-48 rounded-md border bg-card p-1 shadow-lg"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => startRename(rowKey, conv.title)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" /> 重命名
                      </button>
                      <button
                        onClick={() => handleRegenerateTitle(conv.id)}
                        disabled={!canGenerateTitle || titleGenerating === conv.id}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        title={canGenerateTitle ? '重新生成标题' : '请先在设置里选择标题生成模型'}
                      >
                        {titleGenerating === conv.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        重新生成标题
                      </button>
                      {!conv.is_archived && (
                        <button
                          onClick={() => handleArchive(conv.id)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Archive className="h-3.5 w-3.5" /> 归档
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(conv.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> 删除
                      </button>
                    </div>
                  )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="rounded-md border border-dashed bg-card/50 px-3 py-4 text-center text-xs text-muted-foreground">
                  {searchQuery ? '没有匹配的对话' : showArchived ? '暂无归档对话' : '还没有对话'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t px-3 py-3">
        <NavSection title="工作区" items={workspaceItems} onClose={onClose} />
        <NavSection title="上下文与工具" items={capabilityItems} onClose={onClose} />
        <NavSection title="输出与偏好" items={utilityItems} defaultOpen={false} onClose={onClose} />
      </div>

      <div className="border-t px-3 py-3">
        <div className="flex items-center gap-2 rounded-md bg-card px-2.5 py-2 shadow-sm ring-1 ring-border">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">admin</p>
            <p className="text-[11px] text-muted-foreground">本地工作区</p>
          </div>
          <button onClick={onToggleTheme} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="切换主题">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={handleLogout} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="退出登录">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
