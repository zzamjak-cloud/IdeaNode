mod commands;
mod db;
mod models;

pub use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_state = db::init_db(app.handle())?;
            app.manage(db_state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_categories_with_memos,
            commands::get_app_settings,
            commands::set_background_color,
            commands::create_category,
            commands::update_category,
            commands::set_category_collapsed,
            commands::delete_category,
            commands::reorder_categories,
            commands::reorder_memos,
            commands::create_memo,
            commands::update_memo,
            commands::delete_memo,
            commands::move_memo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
