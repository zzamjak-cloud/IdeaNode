use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn init_db(app: &tauri::AppHandle) -> Result<DbState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("create_dir_all error: {e}"))?;

    let db_path: PathBuf = app_data_dir.join("ideanode.sqlite3");
    let conn = Connection::open(db_path).map_err(|e| format!("db open error: {e}"))?;

    // Important: ensure FK constraints are enforced.
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("pragma error: {e}"))?;

    migrate(&conn)?;

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let mut current_version: i64 = conn
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|e| format!("read user_version error: {e}"))?;

    loop {
        match current_version {
            0 => {
                conn.execute_batch(
                    r#"
                    BEGIN;
                    CREATE TABLE IF NOT EXISTS categories (
                      id TEXT PRIMARY KEY,
                      emoji TEXT NOT NULL DEFAULT '',
                      title TEXT NOT NULL,
                      color TEXT NOT NULL,
                      position INTEGER NOT NULL,
                      is_collapsed INTEGER NOT NULL DEFAULT 0,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS memos (
                      id TEXT PRIMARY KEY,
                      category_id TEXT NOT NULL,
                      emoji TEXT NOT NULL DEFAULT '',
                      title TEXT NOT NULL,
                      color TEXT NOT NULL,
                      date_ymd TEXT NOT NULL,
                      content_md TEXT NOT NULL,
                      position INTEGER NOT NULL,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL,
                      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS settings (
                      key TEXT PRIMARY KEY,
                      value TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_categories_position ON categories(position);
                    CREATE INDEX IF NOT EXISTS idx_memos_category_position ON memos(category_id, position);

                    PRAGMA user_version = 4;
                    COMMIT;
                    "#,
                )
                .map_err(|e| format!("migration v0->v4 error: {e}"))?;
                current_version = 4;
            }
            1 => {
                conn.execute_batch(
                    r#"
                    BEGIN;
                    ALTER TABLE memos ADD COLUMN date_ymd TEXT NOT NULL DEFAULT '';
                    UPDATE memos
                    SET date_ymd = strftime('%Y-%m-%d', created_at/1000, 'unixepoch', 'localtime')
                    WHERE date_ymd = '';
                    PRAGMA user_version = 2;
                    COMMIT;
                    "#,
                )
                .map_err(|e| format!("migration v1->v2 error: {e}"))?;
                current_version = 2;
            }
            2 => {
                conn.execute_batch(
                    r#"
                    BEGIN;
                    ALTER TABLE categories ADD COLUMN emoji TEXT NOT NULL DEFAULT '';
                    CREATE TABLE IF NOT EXISTS settings (
                      key TEXT PRIMARY KEY,
                      value TEXT NOT NULL
                    );
                    PRAGMA user_version = 3;
                    COMMIT;
                    "#,
                )
                .map_err(|e| format!("migration v2->v3 error: {e}"))?;
                current_version = 3;
            }
            3 => {
                conn.execute_batch(
                    r#"
                    BEGIN;
                    ALTER TABLE memos ADD COLUMN emoji TEXT NOT NULL DEFAULT '';
                    PRAGMA user_version = 4;
                    COMMIT;
                    "#,
                )
                .map_err(|e| format!("migration v3->v4 error: {e}"))?;
                current_version = 4;
            }
            _ => break,
        }
    }

    Ok(())
}

pub fn next_position(conn: &Connection, table: &str, where_clause: Option<(&str, &str)>) -> Result<i64, String> {
    let sql = match where_clause {
        Some((col, _)) => format!("SELECT COALESCE(MAX(position), -1) + 1 FROM {table} WHERE {col} = ?1"),
        None => format!("SELECT COALESCE(MAX(position), -1) + 1 FROM {table}"),
    };

    let pos: i64 = match where_clause {
        Some((_col, val)) => conn
            .query_row(&sql, params![val], |row| row.get(0))
            .map_err(|e| format!("next_position error: {e}"))?,
        None => conn
            .query_row(&sql, [], |row| row.get(0))
            .map_err(|e| format!("next_position error: {e}"))?,
    };

    Ok(pos)
}

pub fn touch_updated_at(conn: &Connection, table: &str, id: &str) -> Result<(), String> {
    let ts = now_ms();
    let sql = format!("UPDATE {table} SET updated_at = ?1 WHERE id = ?2");
    conn.execute(&sql, params![ts, id])
        .map_err(|e| format!("touch_updated_at error: {e}"))?;
    Ok(())
}

pub fn now_timestamp_ms() -> i64 {
    now_ms()
}

pub fn get_memo_category_and_position(
    conn: &Connection,
    memo_id: &str,
) -> Result<Option<(String, i64)>, String> {
    conn.query_row(
        "SELECT category_id, position FROM memos WHERE id = ?1",
        params![memo_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| format!("get memo meta error: {e}"))
}


