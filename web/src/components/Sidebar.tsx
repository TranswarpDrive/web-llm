import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useConversationStore } from '@/stores/conversationStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  MessageSquarePlus,
  MessageSquare,
  Settings,
  LogOut,
  Sun,
  Moon,
  Database,
  Cpu,
  X,
  FileDown,
  Server,
  Home,
  Search,
  Archive,
  Pencil,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';

interface SidebarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onClose: () => void;
}

export function Sidebar({ theme, onToggleTheme, onClose }: SidebarProps) {
  const { conversations, loading, loadList, create, update, remove } = useConversationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadList();
  }, [loadList]);

  function handleLogout() {
    useAuthStore.getState().logout();
    navigate('/login');
  }

  async function handleNewChat() {
    try {
      const id = await create();
      navigate(`/chat/${id}`);
      onClose();
    } catch {
      // handled by store
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this conversation?')) return;
    setContextMenu(null);
    await remove(id);
    if (location.pathname === `/chat/${id}`) {
      navigate('/');
    }
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
    if (renameTitle.trim()) {
      await update(id, { title: renameTitle.trim() } as any);
    }
    setRenaming(null);
  }

  const filtered = conversations.filter(c => {
    const matchesSearch = searchQuery
      ? c.title.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    const matchesArchived = showArchived ? c.is_archived : !c.is_archived;
    return matchesSearch && matchesArchived;
  });

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/providers', label: '服务商 & 模型', icon: Cpu },
    { path: '/knowledge-bases', label: '知识库', icon: Database },
    { path: '/mcp', label: 'MCP 服务', icon: Server },
    { path: '/export', label: '导出', icon: FileDown },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  return (
    <div className="flex h-full flex-col" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-bold">WebLLM</h1>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent lg:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* New chat */}
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2">
        {loading ? (
          <div className="space-y-1 px-1">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(conv => (
              <div key={conv.id} className="relative">
                {renaming === conv.id ? (
                  <input
                    value={renameTitle}
                    onChange={e => setRenameTitle(e.target.value)}
                    onBlur={() => handleRename(conv.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(conv.id);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <Link
                    to={`/chat/${conv.id}`}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent group/item',
                      location.pathname === `/chat/${conv.id}` && 'bg-accent'
                    )}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{conv.title || 'New conversation'}</span>
                    {conv.is_archived && (
                      <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <button
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu(contextMenu?.id === conv.id ? null : { id: conv.id, x: 0, y: 0 });
                      }}
                      className="opacity-0 group-hover/item:opacity-100 rounded p-0.5 hover:bg-accent-foreground/10 shrink-0"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </Link>
                )}

                {/* Context menu */}
                {contextMenu?.id === conv.id && (
                  <div
                    className="absolute right-2 top-8 z-50 rounded-md border bg-background shadow-lg py-1 w-40"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => startRename(conv.id, conv.title)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    {!conv.is_archived && (
                      <button
                        onClick={() => handleArchive(conv.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(conv.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Archived toggle */}
      <div className="px-3 py-1">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={cn(
            'flex items-center gap-2 w-full rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent',
            showArchived && 'bg-accent'
          )}
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? 'Show active' : 'Show archived'}
        </button>
      </div>

      {/* Bottom nav */}
      <div className="border-t px-2 py-2">
        <div className="space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
                (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)) &&
                  'bg-accent'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <button
            onClick={onToggleTheme}
            className="rounded-md p-2 hover:bg-accent"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="rounded-md p-2 hover:bg-accent text-muted-foreground"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
