mod mod_acquire;
mod mod_fs;
mod weidu_backup;
mod weidu_install;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .manage(mod_acquire::AcquireCancelFlag::new())
    .manage(weidu_install::RunningWeidu::new())
    .invoke_handler(tauri::generate_handler![
      mod_fs::list_subdir_names,
      mod_fs::read_text_file,
      mod_fs::remove_mod_dir,
      mod_acquire::probe_mod_remote,
      mod_acquire::scrape_mod_page_meta,
      mod_acquire::acquire_mod,
      mod_acquire::cancel_mod_acquire,
      weidu_install::list_weidu_components,
      weidu_install::list_weidu_languages,
      weidu_install::run_weidu_step,
      weidu_install::run_weidu_force_uninstall,
      weidu_install::send_weidu_stdin,
      weidu_install::cancel_weidu_step,
      weidu_install::stage_mod_into_game_dir,
      weidu_install::cleanup_install_artifacts,
      weidu_install::read_game_weidu_log,
      weidu_install::read_game_exe_version,
      weidu_backup::backup_game_dir,
      weidu_backup::restore_game_dir,
      weidu_backup::list_backups,
      weidu_backup::create_named_backup,
      weidu_backup::delete_backup,
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
