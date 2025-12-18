export type ID = string;

export type Category = {
  id: ID;
  emoji: string;
  title: string;
  color: string;
  position: number;
  archived: boolean;
  is_todo: boolean;
  is_collapsed: boolean;
  created_at: number;
  updated_at: number;
};

export type Memo = {
  id: ID;
  category_id: ID;
  emoji: string;
  title: string;
  color: string;
  date_ymd: string;
  content_md: string;
  todo_done: boolean;
  position: number;
  created_at: number;
  updated_at: number;
};

export type CategoryWithMemos = {
  category: Category;
  memos: Memo[];
};

export type CreateCategoryInput = {
  emoji?: string;
  title: string;
  color: string;
  is_todo: boolean;
};

export type UpdateCategoryInput = {
  id: ID;
  emoji: string;
  title: string;
  color: string;
};

export type SetCategoryCollapsedInput = {
  id: ID;
  is_collapsed: boolean;
};

export type SetCategoryArchivedInput = {
  id: ID;
  archived: boolean;
};

export type ReorderCategoriesInput = {
  ordered_ids: ID[];
};

export type ReorderMemosInput = {
  category_id: ID;
  ordered_ids: ID[];
};

export type AppSettings = {
  background_color: string;
};

export type SetBackgroundColorInput = {
  background_color: string;
};

export type CreateMemoInput = {
  category_id: ID;
  emoji?: string;
  title: string;
  color: string;
  date_ymd?: string;
  content_md: string;
};

export type UpdateMemoInput = {
  id: ID;
  emoji: string;
  title: string;
  color: string;
  date_ymd: string;
  content_md: string;
  todo_done: boolean;
};

export type MoveMemoInput = {
  memo_id: ID;
  to_category_id: ID;
};


