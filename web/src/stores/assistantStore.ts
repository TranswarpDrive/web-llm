import { create } from 'zustand';
import { api } from '@/services/api';
import type { Assistant, ModelParams } from '@/types';

export interface AssistantFormData {
  name: string;
  emoji: string;
  system_prompt: string;
  default_model_id?: string | null;
  params: ModelParams;
  is_default: boolean;
}

interface AssistantState {
  assistants: Assistant[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (data: AssistantFormData) => Promise<void>;
  update: (id: string, data: Partial<AssistantFormData>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  assistants: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getAssistants();
      set({ assistants: data, loading: false });
    } catch (err: any) {
      set({ error: err?.error?.message || 'Failed to load assistants', loading: false });
    }
  },

  create: async (data) => {
    try {
      await api.createAssistant(data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to create assistant');
    }
  },

  update: async (id, data) => {
    try {
      await api.updateAssistant(id, data as any);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to update assistant');
    }
  },

  remove: async (id) => {
    try {
      await api.deleteAssistant(id);
      await get().fetch();
    } catch (err: any) {
      throw new Error(err?.error?.message || 'Failed to delete assistant');
    }
  },
}));
