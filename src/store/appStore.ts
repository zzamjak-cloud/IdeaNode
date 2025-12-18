import { create } from "zustand";
import { api } from "../lib/tauri";
import type {
  AppSettings,
  CategoryWithMemos,
  CreateCategoryInput,
  CreateMemoInput,
  MoveMemoInput,
  ReorderCategoriesInput,
  SetCategoryCollapsedInput,
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
  setCategoryCollapsed(input: SetCategoryCollapsedInput): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  reorderCategories(input: ReorderCategoriesInput): Promise<void>;

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
  },

  createCategory: async (input) => {
    await api.createCategory(input);
    await get().refresh();
  },
  updateCategory: async (input) => {
    await api.updateCategory(input);
    await get().refresh();
  },
  setCategoryCollapsed: async (input) => {
    await api.setCategoryCollapsed(input);
    await get().refresh();
  },
  deleteCategory: async (id) => {
    await api.deleteCategory(id);
    await get().refresh();
  },
  reorderCategories: async (input) => {
    await api.reorderCategories(input);
    await get().refresh();
  },

  createMemo: async (input) => {
    await api.createMemo(input);
    await get().refresh();
  },
  updateMemo: async (input) => {
    await api.updateMemo(input);
    await get().refresh();
  },
  deleteMemo: async (id) => {
    await api.deleteMemo(id);
    await get().refresh();
  },
  moveMemo: async (input) => {
    await api.moveMemo(input);
    await get().refresh();
  },
}));


