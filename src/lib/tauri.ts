import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  Category,
  CategoryWithMemos,
  CreateCategoryInput,
  CreateMemoInput,
  MoveMemoInput,
  ReorderCategoriesInput,
  ReorderMemosInput,
  SetBackgroundColorInput,
  SetCategoryCollapsedInput,
  UpdateCategoryInput,
  UpdateMemoInput,
} from "../types";

export const api = {
  listCategoriesWithMemos(): Promise<CategoryWithMemos[]> {
    return invoke("list_categories_with_memos");
  },

  getAppSettings(): Promise<AppSettings> {
    return invoke("get_app_settings");
  },

  setBackgroundColor(input: SetBackgroundColorInput): Promise<void> {
    return invoke("set_background_color", { input });
  },

  createCategory(input: CreateCategoryInput): Promise<Category> {
    return invoke("create_category", { input });
  },

  updateCategory(input: UpdateCategoryInput): Promise<Category> {
    return invoke("update_category", { input });
  },

  setCategoryCollapsed(input: SetCategoryCollapsedInput): Promise<Category> {
    return invoke("set_category_collapsed", { input });
  },

  deleteCategory(id: string): Promise<void> {
    return invoke("delete_category", { id });
  },

  reorderCategories(input: ReorderCategoriesInput): Promise<void> {
    return invoke("reorder_categories", { input });
  },

  reorderMemos(input: ReorderMemosInput): Promise<void> {
    return invoke("reorder_memos", { input });
  },

  createMemo(input: CreateMemoInput) {
    return invoke("create_memo", { input });
  },

  updateMemo(input: UpdateMemoInput) {
    return invoke("update_memo", { input });
  },

  deleteMemo(id: string): Promise<void> {
    return invoke("delete_memo", { id });
  },

  moveMemo(input: MoveMemoInput): Promise<void> {
    return invoke("move_memo", { input });
  },
} as const;


