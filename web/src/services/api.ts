import type { ApiError, Provider, Model, Conversation, Message, KnowledgeBase, McpServer } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken(): string {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function handleAuthError(res: Response) {
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
}

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = getToken();
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    await handleAuthError(res);

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        error: { type: 'server_error', message: res.statusText },
      }));
      throw error;
    }

    return res.json();
  }

  // Auth
  async getMe() {
    return this.request<{ user: { id: string; username: string } }>('/auth/me');
  }

  // Providers
  async getProviders() {
    return this.request<Provider[]>('/providers');
  }

  async createProvider(data: Omit<Provider, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
    return this.request<Provider>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProvider(id: string, data: Partial<Provider>) {
    return this.request<Provider>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProvider(id: string) {
    return this.request<void>(`/providers/${id}`, { method: 'DELETE' });
  }

  // Models
  async getModels(params?: { provider_id?: string; type?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.provider_id) searchParams.set('provider_id', params.provider_id);
    if (params?.type) searchParams.set('type', params.type);
    const qs = searchParams.toString();
    return this.request<Model[]>(`/models${qs ? `?${qs}` : ''}`);
  }

  async createModel(data: Omit<Model, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
    return this.request<Model>('/models', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateModel(id: string, data: Partial<Model>) {
    return this.request<Model>(`/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteModel(id: string) {
    return this.request<void>(`/models/${id}`, { method: 'DELETE' });
  }

  // Conversations
  async getConversations(params?: { search?: string; archived?: boolean }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.archived) searchParams.set('archived', 'true');
    const qs = searchParams.toString();
    return this.request<Conversation[]>(`/conversations${qs ? `?${qs}` : ''}`);
  }

  async getConversation(id: string) {
    return this.request<Conversation & { messages: Message[] }>(`/conversations/${id}`);
  }

  async createConversation(data: Partial<Conversation>) {
    return this.request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateConversation(id: string, data: Partial<Conversation>) {
    return this.request<Conversation>(`/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteConversation(id: string) {
    return this.request<void>(`/conversations/${id}`, { method: 'DELETE' });
  }

  // Messages
  async addMessage(conversationId: string, data: { role: string; content: string }) {
    return this.request<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMessage(messageId: string, data: { content: string }) {
    return this.request<Message>(`/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMessage(messageId: string) {
    return this.request<void>(`/messages/${messageId}`, { method: 'DELETE' });
  }

  // Chat streaming
  async chatCompletion(body: Record<string, unknown>) {
    return this.request<any>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...body, stream: false }),
    });
  }

  async chatCompletions(
    body: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const token = getToken();
    const url = `${API_BASE}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });

    await handleAuthError(res);

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        error: { type: 'server_error', message: res.statusText },
      }));
      throw error;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        onChunk(data);
      }
    }
  }

  // Knowledge Bases
  async getKnowledgeBases() {
    return this.request<KnowledgeBase[]>('/knowledge-bases');
  }

  async createKnowledgeBase(data: Partial<KnowledgeBase>) {
    return this.request<KnowledgeBase>('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteKnowledgeBase(id: string) {
    return this.request<void>(`/knowledge-bases/${id}`, { method: 'DELETE' });
  }

  // MCP Servers
  async getMcpServers() {
    return this.request<McpServer[]>('/mcp-servers');
  }

  async createMcpServer(data: Partial<McpServer>) {
    return this.request<McpServer>('/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteMcpServer(id: string) {
    return this.request<void>(`/mcp-servers/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
