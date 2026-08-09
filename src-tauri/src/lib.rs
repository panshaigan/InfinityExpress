mod mod_acquire;
mod mod_fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .manage(mod_acquire::AcquireCancelFlag::new())
    .invoke_handler(tauri::generate_handler![
      mod_fs::list_subdir_names,
      mod_fs::remove_mod_dir,
      mod_acquire::probe_mod_remote,
      mod_acquire::scrape_mod_page_meta,
      mod_acquire::acquire_mod,
      mod_acquire::cancel_mod_acquire,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
