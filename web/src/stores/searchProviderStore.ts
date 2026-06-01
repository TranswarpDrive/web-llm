import { create } from 'zustand';
import { api } from '@/services/api';
import type { SearchProvider, SearchEngine } from '@/types';

export interface SearchProviderFormData {
  name: string;
  engine: SearchEngine;
  api_key?: string;
  base_url?: string;
  is_active: boolean;
  is_default: boolean;
}

interface SearchProviderState {
  providers: SearchProvider[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (data: SearchProviderFormData) => Promise<void>;
  update: (id: string, data: Partial<SearchProviderFormData>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<{ status: string; message?: string; result_count?: number }>;
}

export const useSearchProviderStore = create<SearchProviderState>((set, get) => ({
  providers: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getSearchProviders();
      set({ providers: data, loading: false });
    } catch (err: any) {
      set({ error: err?.error?.message || 'Failed to load search providers', loading: false });
    }
  },

  create: async (data) => {
    try {
      await api.createSearchProvider(data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to create search provider');
    }
  },

  update: async (id, data) => {
    try {
      await api.updateSearchProvider(id, data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to update search provider');
    }
  },

  remove: async (id) => {
    try {
      await api.deleteSearchProvider(id);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to delete search provider');
    }
  },

  testConnection: async (id) => {
    const res = await fetch(`/api/search-providers/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    return res.json();
  },
}));
