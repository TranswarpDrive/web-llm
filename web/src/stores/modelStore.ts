import { create } from 'zustand';
import { api } from '@/services/api';
import type { Model, ModelType, ModelCapabilities } from '@/types';

interface ModelState {
  models: Model[];
  loading: boolean;
  error: string | null;
  fetch: (params?: { provider_id?: string; type?: ModelType }) => Promise<void>;
  create: (data: ModelFormData) => Promise<void>;
  batchCreate: (models: ModelFormData[]) => Promise<void>;
  update: (id: string, data: Partial<ModelFormData>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface ModelFormData {
  provider_id: string;
  model_id: string;
  display_name: string;
  type: ModelType;
  capabilities: ModelCapabilities;
  default_params: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  };
  is_default_per_type: boolean;
  is_active: boolean;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  loading: false,
  error: null,

  fetch: async (params) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getModels(params);
      set({ models: data, loading: false });
    } catch (err: any) {
      set({ error: err?.error?.message || 'Failed to load models', loading: false });
    }
  },

  create: async (data) => {
    try {
      await api.createModel(data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to create model');
    }
  },

  batchCreate: async (models) => {
    const errors: string[] = [];
    for (const m of models) {
      try {
        await api.createModel(m as any);
      } catch (err: any) {
        errors.push(`${m.model_id}: ${err?.error?.message || err.message || 'Failed'}`);
      }
    }
    await get().fetch();
    if (errors.length) throw new Error(errors.join('; '));
  },

  update: async (id, data) => {
    try {
      await api.updateModel(id, data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to update model');
    }
  },

  remove: async (id) => {
    try {
      await api.deleteModel(id);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to delete model');
    }
  },
}));
