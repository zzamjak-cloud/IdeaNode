use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub emoji: String,
    pub title: String,
    pub color: String,
    pub position: i64,
    pub is_collapsed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memo {
    pub id: String,
    pub category_id: String,
    pub emoji: String,
    pub title: String,
    pub color: String,
    pub date_ymd: String,
    pub content_md: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryWithMemos {
    pub category: Category,
    pub memos: Vec<Memo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCategoryInput {
    pub emoji: Option<String>,
    pub title: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCategoryInput {
    pub id: String,
    pub emoji: String,
    pub title: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetCategoryCollapsedInput {
    pub id: String,
    pub is_collapsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderCategoriesInput {
    pub ordered_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderMemosInput {
    pub category_id: String,
    pub ordered_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub background_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetBackgroundColorInput {
    pub background_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemoInput {
    pub category_id: String,
    pub emoji: Option<String>,
    pub title: String,
    pub color: String,
    pub date_ymd: Option<String>,
    pub content_md: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemoInput {
    pub id: String,
    pub emoji: String,
    pub title: String,
    pub color: String,
    pub date_ymd: String,
    pub content_md: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveMemoInput {
    pub memo_id: String,
    pub to_category_id: String,
}


