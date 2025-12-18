import { create } from "zustand";
import { api } from "../lib/tauri";
import { emit } from "@tauri-apps/api/event";
import type {
  AppSettings,
  CategoryWithMemos,
  CreateCategoryInput,
  CreateMemoInput,
  MoveMemoInput,
  ReorderCategoriesInput,
  ReorderMemosInput,
  SetCategoryCollapsedInput,
  SetCategoryArchivedInput,
  SetBackgroundColorInput,
  UpdateCategoryInput,
  UpdateMemoInput,
} from "../types";

type AppState = {
  loading: boolean;
  error: string | null;
  categories: CategoryWithMemos[];
  settings: AppSettings;

  refresh(): Promise<void>;
  setBackgroundColorLocal(color: string): void;
  saveBackgroundColor(input: SetBackgroundColorInput): Promise<void>;

  createCategory(input: CreateCategoryInput): Promise<void>;
  updateCategory(input: UpdateCategoryInput): Promise<void>;
  setCategoryArchived(input: SetCategoryArchivedInput): Promise<void>;
  setCategoryCollapsed(input: SetCategoryCollapsedInput): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  reorderCategories(input: ReorderCategoriesInput): Promise<void>;
  reorderMemos(input: ReorderMemosInput): Promise<void>;

  createMemo(input: CreateMemoInput): Promise<void>;
  updateMemo(input: UpdateMemoInput): Promise<void>;
  deleteMemo(id: string): Promise<void>;
  moveMemo(input: MoveMemoInput): Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  loading: false,
  error: null,
  categories: [],
  settings: { background_color: "" },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [categories, settings] = await Promise.all([
        api.listCategoriesWithMemos(),
        api.getAppSettings(),
      ]);
      set({ categories, settings, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  setBackgroundColorLocal: (color) => {
    set((s) => ({ settings: { ...s.settings, background_color: color } }));
  },

  saveBackgroundColor: async (input) => {
    await api.setBackgroundColor(input);
    try {
      await emit("ideanode:data_changed");
    } catch {
      // ignore
    }
  },

  createCategory: async (input) => {
    await api.createCategory(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  updateCategory: async (input) => {
    await api.updateCategory(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  setCategoryArchived: async (input) => {
    await api.setCategoryArchived(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  setCategoryCollapsed: async (input) => {
    await api.setCategoryCollapsed(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  deleteCategory: async (id) => {
    await api.deleteCategory(id);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  reorderCategories: async (input) => {
    await api.reorderCategories(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  reorderMemos: async (input) => {
    await api.reorderMemos(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },

  createMemo: async (input) => {
    await api.createMemo(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  updateMemo: async (input) => {
    await api.updateMemo(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  deleteMemo: async (id) => {
    await api.deleteMemo(id);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
  moveMemo: async (input) => {
    await api.moveMemo(input);
    await get().refresh();
    try {
      await emit("ideanode:data_changed");
    } catch {}
  },
}));


