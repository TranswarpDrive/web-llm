import { create } from 'zustand';
import { api } from '@/services/api';
import type { Conversation, Message, ModelParams } from '@/types';

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  active: Conversation | null;
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  streamingToolCalls: ToolCallState[];
  error: string | null;
  loading: boolean;

  loadList: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  create: () => Promise<string>;
  update: (id: string, data: Partial<Conversation>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  sendMessage: (content: string, opts?: SendOpts) => Promise<void>;
  regenerate: (opts: SendOpts) => Promise<void>;
  cancelStream: () => void;
  editMessage: (msgId: string, content: string) => Promise<void>;
  deleteMessage: (msgId: string) => Promise<void>;
  clearError: () => void;
}

export interface ToolCallState {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface SendOpts {
  providerId: string;
  modelId: string;
  params?: ModelParams;
  tools?: unknown[];
  kbIds?: string[];
}

let abortController: AbortController | null = null;

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeId: null,
  active: null,
  messages: [],
  streaming: false,
  streamingContent: '',
  streamingToolCalls: [],
  error: null,
  loading: false,

  loadList: async () => {
    set({ loading: true });
    try {
      const data = await api.getConversations({ archived: false });
      set({ conversations: data, loading: false });
    } catch { set({ loading: false }); }
  },

  selectConversation: async (id: string) => {
    set({ activeId: id, streamingContent: '', streamingToolCalls: [], error: null });
    try {
      const data = await api.getConversation(id);
      const { messages, ...conv } = data;
      set({ active: conv, messages: messages || [] });
    } catch { set({ error: 'Failed to load conversation' }); }
  },

  create: async () => {
    const conv = await api.createConversation({});
    set(state => ({
      conversations: [conv, ...state.conversations],
      activeId: conv.id, active: conv, messages: [], error: null,
    }));
    return conv.id;
  },

  update: async (id, data) => {
    await api.updateConversation(id, data as any);
    set(state => ({
      conversations: state.conversations.map(c => c.id === id ? { ...c, ...data } : c),
      active: state.active?.id === id ? { ...state.active, ...data } : state.active,
    }));
  },

  remove: async (id) => {
    await api.deleteConversation(id);
    set(state => {
      const next = state.conversations.filter(c => c.id !== id);
      if (state.activeId === id) return { conversations: next, activeId: null, active: null, messages: [] };
      return { conversations: next };
    });
  },

  sendMessage: async (content, opts) => {
    const { activeId: convId, active, messages: prevMessages } = get();
    const providerId = opts?.providerId;
    const modelId = opts?.modelId;
    if (!providerId || !modelId) { set({ error: 'No provider or model selected' }); return; }

    const userMsg: Message = {
      id: `user-${Date.now()}`, conversation_id: convId || '', role: 'user', content, created_at: new Date().toISOString(),
    };
    set(state => ({ messages: [...state.messages, userMsg], streaming: true, streamingContent: '', streamingToolCalls: [], error: null }));

    abortController = new AbortController();
    let fullContent = '';
    const toolCalls: ToolCallState[] = [];

    try {
      // Fetch tool definitions if tools enabled
      let tools: unknown[] | undefined;
      if (opts?.tools?.length) tools = opts.tools;
      if (opts?.kbIds?.length) {
        // KB context prepended - handled in ChatView
        tools = tools || [];
      }

      await api.chatCompletions(
        {
          provider_id: providerId, model_id: modelId, conversation_id: convId,
          messages: [{ role: 'user', content }],
          params: opts?.params || active?.params || {},
          tools,
        },
        (chunkStr) => {
          try {
            const chunk = JSON.parse(chunkStr);
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) { fullContent += delta.content; set({ streamingContent: fullContent }); }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index || 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id || `tc-${idx}`, name: tc.function?.name || '', arguments: '', status: 'pending' };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                toolCalls[idx].status = 'running';
              }
              set({ streamingToolCalls: [...toolCalls] });
            }
          } catch {}
        },
        abortController.signal
      );

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`, conversation_id: convId || '', role: 'assistant',
        content: fullContent, created_at: new Date().toISOString(),
        tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } })),
      };
      set(state => ({ messages: [...state.messages, assistantMsg], streaming: false, streamingContent: '', streamingToolCalls: [] }));
      if (convId) { get().loadList(); get().selectConversation(convId); }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (fullContent) {
          set(state => ({ messages: [...state.messages, { id: `partial-${Date.now()}`, conversation_id: convId || '', role: 'assistant', content: fullContent + '\n\n*(cancelled)*', created_at: new Date().toISOString() }] }));
        }
      } else {
        set({ error: err?.error?.message || err?.message || 'Request failed' });
      }
      set({ streaming: false, streamingContent: '', streamingToolCalls: [] });
    } finally { abortController = null; }
  },

  regenerate: async (opts) => {
    const { messages } = get();
    // Find last user message and remove everything after it
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserIdx === -1) return;
    const actualIdx = messages.length - 1 - lastUserIdx;
    const lastUserMsg = messages[actualIdx];
    const trimmed = messages.slice(0, actualIdx);
    set({ messages: trimmed });
    // Re-send
    await get().sendMessage(typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '', opts);
  },

  cancelStream: () => { abortController?.abort(); },

  editMessage: async (msgId, content) => {
    set(state => ({ messages: state.messages.map(m => m.id === msgId ? { ...m, content } : m) }));
    try { await api.updateMessage(msgId, { content }); } catch {}
  },

  deleteMessage: async (msgId) => {
    set(state => ({ messages: state.messages.filter(m => m.id !== msgId) }));
    try { await api.deleteMessage(msgId); } catch {}
  },

  clearError: () => set({ error: null }),
}));
