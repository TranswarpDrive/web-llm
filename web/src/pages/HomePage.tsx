import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Database, MessageSquarePlus, Send, Settings, Wrench } from 'lucide-react';
import { api } from '@/services/api';
import { getUserPreferences } from '@/lib/userPreferences';

export function HomePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleNewChat() {
    setCreating(true);
    try {
      const prefs = getUserPreferences();
      const data: { title?: string; model_id?: string } = draft.trim() ? { title: draft.trim().slice(0, 40) } : {};
      if (prefs.defaultConversationModelId) {
        const models = await api.getModels().catch(() => []);
        if (models.some(model => model.id === prefs.defaultConversationModelId && model.is_active)) {
          data.model_id = prefs.defaultConversationModelId;
        }
      }
      const conv = await api.createConversation(data);
      navigate(`/chat/${conv.id}`);
    } catch {
      // handled by API client
    }
    setCreating(false);
  }

  return (
    <div className="flex min-h-full flex-col bg-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">今天想聊什么？</h2>
          <p className="mt-2 text-sm text-muted-foreground">选择模型、接入知识库和工具，然后开始一段新的工作流。</p>
        </div>

        <div className="rounded-2xl border bg-card p-2 shadow-[0_18px_55px_rgba(15,23,42,0.12)]">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleNewChat();
              }
            }}
            placeholder="新对话从这里开始"
            rows={2}
            className="min-h-[72px] w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none"
          />
          <div className="flex items-center justify-between border-t px-1.5 pt-2">
            <div className="flex items-center gap-1.5">
              <Link to="/providers" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Settings className="h-4 w-4" /> 服务商
              </Link>
              <Link to="/knowledge-bases" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Database className="h-4 w-4" /> 知识库
              </Link>
              <Link to="/mcp" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <Wrench className="h-4 w-4" /> MCP
              </Link>
            </div>
            <button
              onClick={handleNewChat}
              disabled={creating}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              title="新对话"
            >
              {draft.trim() ? <Send className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {[
            ['整理资料', '把文档变成清晰提纲'],
            ['知识库问答', '基于资料回答问题'],
            ['工具调用', '用 MCP 扩展能力'],
          ].map(([title, text]) => (
            <button
              key={title}
              onClick={() => setDraft(text)}
              className="rounded-md border bg-background px-3 py-3 text-left text-sm transition hover:bg-accent"
            >
              <span className="block font-medium">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
