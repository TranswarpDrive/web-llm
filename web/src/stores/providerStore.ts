import { create } from 'zustand';
import { api } from '@/services/api';
import type { Provider } from '@/types';

interface ProviderState {
  providers: Provider[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (data: ProviderFormData) => Promise<void>;
  update: (id: string, data: Partial<ProviderFormData>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<{ status: string; message?: string; model_count?: number }>;
}

export interface ProviderFormData {
  name: string;
  base_url: string;
  api_key: string;
  capabilities: {
    chat: boolean;
    vision: boolean;
    embedding: boolean;
    rerank: boolean;
  };
  is_active: boolean;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getProviders();
      set({ providers: data, loading: false });
    } catch (err: any) {
      set({ error: err?.error?.message || 'Failed to load providers', loading: false });
    }
  },

  create: async (data) => {
    try {
      await api.createProvider(data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to create provider');
    }
  },

  update: async (id, data) => {
    try {
      await api.updateProvider(id, data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to update provider');
    }
  },

  remove: async (id) => {
    try {
      await api.deleteProvider(id);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to delete provider');
    }
  },

  testConnection: async (id) => {
    const res = await fetch(`/api/providers/${id}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });
    return res.json();
  },
}));
