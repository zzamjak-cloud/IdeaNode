use crate::db::{get_memo_category_and_position, next_position, now_timestamp_ms, DbState};
use crate::models::{
    AppSettings, Category, CategoryWithMemos, CreateCategoryInput, CreateMemoInput, Memo,
    MoveMemoInput, ReorderCategoriesInput, ReorderMemosInput, SetBackgroundColorInput,
    SetCategoryArchivedInput, SetCategoryCollapsedInput, UpdateCategoryInput, UpdateMemoInput,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

fn row_to_category(row: &rusqlite::Row<'_>) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        emoji: row.get(1)?,
        title: row.get(2)?,
        color: row.get(3)?,
        position: row.get(4)?,
        archived: row.get::<_, i64>(5)? != 0,
        is_todo: row.get::<_, i64>(6)? != 0,
        is_collapsed: row.get::<_, i64>(7)? != 0,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn row_to_memo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Memo> {
    Ok(Memo {
        id: row.get(0)?,
        category_id: row.get(1)?,
        emoji: row.get(2)?,
        title: row.get(3)?,
        color: row.get(4)?,
        date_ymd: row.get(5)?,
        content_md: row.get(6)?,
        todo_done: row.get::<_, i64>(7)? != 0,
        position: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[tauri::command]
pub fn list_categories_with_memos(state: tauri::State<'_, DbState>) -> Result<Vec<CategoryWithMemos>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at
             FROM categories
             ORDER BY position ASC",
        )
        .map_err(|e| format!("query categories error: {e}"))?;

    let categories_iter = stmt
        .query_map([], row_to_category)
        .map_err(|e| format!("map categories error: {e}"))?;

    let mut out: Vec<CategoryWithMemos> = Vec::new();
    for cat in categories_iter {
        let category = cat.map_err(|e| format!("read category error: {e}"))?;

        let mut memo_stmt = conn
            .prepare(
                "SELECT id, category_id, emoji, title, color, date_ymd, content_md, todo_done, position, created_at, updated_at
                 FROM memos
                 WHERE category_id = ?1
                 ORDER BY position ASC",
            )
            .map_err(|e| format!("query memos error: {e}"))?;

        let memo_iter = memo_stmt
            .query_map(params![&category.id], row_to_memo)
            .map_err(|e| format!("map memos error: {e}"))?;

        let mut memos: Vec<Memo> = Vec::new();
        for m in memo_iter {
            memos.push(m.map_err(|e| format!("read memo error: {e}"))?);
        }

        out.push(CategoryWithMemos { category, memos });
    }

    Ok(out)
}

#[tauri::command]
pub fn create_category(
    state: tauri::State<'_, DbState>,
    input: CreateCategoryInput,
) -> Result<Category, String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    let id = Uuid::new_v4().to_string();
    let ts = now_timestamp_ms();
    let position = next_position(&tx, "categories", None)?;

    tx.execute(
        "INSERT INTO categories (id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, 0, ?7, ?8)",
        params![
            &id,
            input.emoji.as_deref().unwrap_or(""),
            &input.title,
            &input.color,
            position,
            if input.is_todo { 1 } else { 0 },
            ts,
            ts
        ],
    )
    .map_err(|e| format!("insert category error: {e}"))?;

    let category = tx
        .query_row(
            "SELECT id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at
             FROM categories WHERE id = ?1",
            params![&id],
            row_to_category,
        )
        .map_err(|e| format!("fetch category error: {e}"))?;

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(category)
}

#[tauri::command]
pub fn update_category(
    state: tauri::State<'_, DbState>,
    input: UpdateCategoryInput,
) -> Result<Category, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let ts = now_timestamp_ms();

    conn.execute(
        "UPDATE categories SET emoji = ?1, title = ?2, color = ?3, updated_at = ?4 WHERE id = ?5",
        params![&input.emoji, &input.title, &input.color, ts, &input.id],
    )
    .map_err(|e| format!("update category error: {e}"))?;

    conn.query_row(
        "SELECT id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at
         FROM categories WHERE id = ?1",
        params![&input.id],
        row_to_category,
    )
    .map_err(|e| format!("fetch category error: {e}"))
}

#[tauri::command]
pub fn set_category_archived(
    state: tauri::State<'_, DbState>,
    input: SetCategoryArchivedInput,
) -> Result<Category, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let ts = now_timestamp_ms();
    let archived_int: i64 = if input.archived { 1 } else { 0 };

    conn.execute(
        "UPDATE categories SET archived = ?1, updated_at = ?2 WHERE id = ?3",
        params![archived_int, ts, &input.id],
    )
    .map_err(|e| format!("set archived error: {e}"))?;

    conn.query_row(
        "SELECT id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at
         FROM categories WHERE id = ?1",
        params![&input.id],
        row_to_category,
    )
    .map_err(|e| format!("fetch category error: {e}"))
}

#[tauri::command]
pub fn set_category_collapsed(
    state: tauri::State<'_, DbState>,
    input: SetCategoryCollapsedInput,
) -> Result<Category, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let ts = now_timestamp_ms();
    let collapsed_int: i64 = if input.is_collapsed { 1 } else { 0 };

    conn.execute(
        "UPDATE categories SET is_collapsed = ?1, updated_at = ?2 WHERE id = ?3",
        params![collapsed_int, ts, &input.id],
    )
    .map_err(|e| format!("set collapsed error: {e}"))?;

    conn.query_row(
        "SELECT id, emoji, title, color, position, archived, is_todo, is_collapsed, created_at, updated_at
         FROM categories WHERE id = ?1",
        params![&input.id],
        row_to_category,
    )
    .map_err(|e| format!("fetch category error: {e}"))
}

#[tauri::command]
pub fn delete_category(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    conn.execute("DELETE FROM categories WHERE id = ?1", params![&id])
        .map_err(|e| format!("delete category error: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn reorder_categories(
    state: tauri::State<'_, DbState>,
    input: ReorderCategoriesInput,
) -> Result<(), String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    let ts = now_timestamp_ms();
    for (idx, id) in input.ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE categories SET position = ?1, updated_at = ?2 WHERE id = ?3",
            params![idx as i64, ts, id],
        )
        .map_err(|e| format!("reorder category error: {e}"))?;
    }

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reorder_memos(
    state: tauri::State<'_, DbState>,
    input: ReorderMemosInput,
) -> Result<(), String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    let ts = now_timestamp_ms();
    for (idx, memo_id) in input.ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE memos
             SET position = ?1, updated_at = ?2
             WHERE id = ?3 AND category_id = ?4",
            params![idx as i64, ts, memo_id, &input.category_id],
        )
        .map_err(|e| format!("reorder memos error: {e}"))?;
    }

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_app_settings(state: tauri::State<'_, DbState>) -> Result<AppSettings, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    let bg: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'background_color'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("get settings error: {e}"))?;

    Ok(AppSettings {
        background_color: bg.unwrap_or_else(|| "".to_string()),
    })
}

#[tauri::command]
pub fn set_background_color(
    state: tauri::State<'_, DbState>,
    input: SetBackgroundColorInput,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    conn.execute(
        "INSERT INTO settings(key, value) VALUES('background_color', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![&input.background_color],
    )
    .map_err(|e| format!("set settings error: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn create_memo(state: tauri::State<'_, DbState>, input: CreateMemoInput) -> Result<Memo, String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    let id = Uuid::new_v4().to_string();
    let ts = now_timestamp_ms();
    let position = next_position(&tx, "memos", Some(("category_id", &input.category_id)))?;

    tx.execute(
        "INSERT INTO memos (id, category_id, emoji, title, color, date_ymd, content_md, todo_done, position, created_at, updated_at)
         VALUES (
          ?1, ?2, ?3, ?4, ?5,
           COALESCE(NULLIF(?6, ''), strftime('%Y-%m-%d', ?9/1000, 'unixepoch', 'localtime')),
          ?7, 0, ?8, ?9, ?10
         )",
        params![
            &id,
            &input.category_id,
            input.emoji.as_deref().unwrap_or(""),
            &input.title,
            &input.color,
            input.date_ymd.as_deref(),
            &input.content_md,
            position,
            ts,
            ts
        ],
    )
    .map_err(|e| format!("insert memo error: {e}"))?;

    let memo = tx
        .query_row(
            "SELECT id, category_id, emoji, title, color, date_ymd, content_md, todo_done, position, created_at, updated_at
             FROM memos WHERE id = ?1",
            params![&id],
            row_to_memo,
        )
        .map_err(|e| format!("fetch memo error: {e}"))?;

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(memo)
}

#[tauri::command]
pub fn update_memo(state: tauri::State<'_, DbState>, input: UpdateMemoInput) -> Result<Memo, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;
    let ts = now_timestamp_ms();

    conn.execute(
        "UPDATE memos
         SET emoji = ?1, title = ?2, color = ?3, date_ymd = ?4, content_md = ?5, todo_done = ?6, updated_at = ?7
         WHERE id = ?8",
        params![
            &input.emoji,
            &input.title,
            &input.color,
            &input.date_ymd,
            &input.content_md,
            if input.todo_done { 1 } else { 0 },
            ts,
            &input.id
        ],
    )
    .map_err(|e| format!("update memo error: {e}"))?;

    conn.query_row(
        "SELECT id, category_id, emoji, title, color, date_ymd, content_md, todo_done, position, created_at, updated_at
         FROM memos WHERE id = ?1",
        params![&input.id],
        row_to_memo,
    )
    .map_err(|e| format!("fetch memo error: {e}"))
}

#[tauri::command]
pub fn delete_memo(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    // Compact positions in the category after delete.
    if let Some((cat_id, pos)) = get_memo_category_and_position(&tx, &id)? {
        tx.execute("DELETE FROM memos WHERE id = ?1", params![&id])
            .map_err(|e| format!("delete memo error: {e}"))?;
        tx.execute(
            "UPDATE memos SET position = position - 1
             WHERE category_id = ?1 AND position > ?2",
            params![cat_id, pos],
        )
        .map_err(|e| format!("compact positions error: {e}"))?;
    }

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn move_memo(state: tauri::State<'_, DbState>, input: MoveMemoInput) -> Result<(), String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "db mutex poisoned".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("tx begin error: {e}"))?;

    let Some((from_category_id, from_pos)) = get_memo_category_and_position(&tx, &input.memo_id)? else {
        return Err("memo not found".to_string());
    };

    // Remove gap in source category.
    tx.execute(
        "UPDATE memos SET position = position - 1
         WHERE category_id = ?1 AND position > ?2",
        params![&from_category_id, from_pos],
    )
    .map_err(|e| format!("compact source positions error: {e}"))?;

    // Append to target category.
    let new_pos = next_position(&tx, "memos", Some(("category_id", &input.to_category_id)))?;
    let ts = now_timestamp_ms();

    tx.execute(
        "UPDATE memos SET category_id = ?1, position = ?2, updated_at = ?3 WHERE id = ?4",
        params![&input.to_category_id, new_pos, ts, &input.memo_id],
    )
    .map_err(|e| format!("move memo error: {e}"))?;

    tx.commit().map_err(|e| format!("tx commit error: {e}"))?;
    Ok(())
}


