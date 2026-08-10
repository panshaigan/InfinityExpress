//! Game directory backup and restore.

use crate::mod_fs::copy_recursive;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const BACKUP_PROGRESS_EVENT: &str = "weidu-backup-progress";

pub const SAFE_EXCLUDE_DIRS: &[&str] = &["movies", "music"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupProgress {
  pub phase: String,
  pub message: String,
  pub files_done: u64,
  pub bytes_done: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
  pub kind: String,
  pub name: String,
  pub path: String,
  pub created_at: String,
  pub exclude_safe_dirs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
  pub game_key: String,
  pub baseline: Option<BackupEntry>,
  pub snapshots: Vec<BackupEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupGameInput {
  pub source_dir: String,
  pub backup_root: String,
  pub game_key: String,
  pub kind: String,
  pub name: Option<String>,
  pub exclude_safe_dirs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupGameResult {
  pub path: String,
  pub entry: BackupEntry,
}

fn emit_progress(app: &AppHandle, payload: BackupProgress) {
  let _ = app.emit(BACKUP_PROGRESS_EVENT, &payload);
}

fn manifest_path(backup_root: &Path, game_key: &str) -> PathBuf {
  backup_root.join(game_key).join("manifest.json")
}

fn read_manifest(backup_root: &Path, game_key: &str) -> Result<BackupManifest, String> {
  let path = manifest_path(backup_root, game_key);
  if !path.is_file() {
    return Ok(BackupManifest {
      game_key: game_key.to_string(),
      baseline: None,
      snapshots: Vec::new(),
    });
  }
  let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn write_manifest(backup_root: &Path, manifest: &BackupManifest) -> Result<(), String> {
  let dir = backup_root.join(&manifest.game_key);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join("manifest.json");
  let text = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
  fs::write(path, text).map_err(|e| e.to_string())
}

fn should_exclude(name: &str, exclude_safe: bool) -> bool {
  if !exclude_safe {
    return false;
  }
  let lower = name.to_ascii_lowercase();
  SAFE_EXCLUDE_DIRS.iter().any(|d| lower == *d)
}

fn copy_filtered(
  app: &AppHandle,
  from: &Path,
  to: &Path,
  exclude_safe: bool,
  files: &Arc<AtomicU64>,
  bytes: &Arc<AtomicU64>,
) -> Result<(), String> {
  fs::create_dir_all(to).map_err(|e| e.to_string())?;
  for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let name_str = entry.file_name().to_string_lossy().to_string();
    if should_exclude(&name_str, exclude_safe) {
      continue;
    }
    let src = entry.path();
    let dst = to.join(entry.file_name());
    if src.is_dir() {
      copy_filtered(app, &src, &dst, exclude_safe, files, bytes)?;
    } else {
      let meta = src.metadata().map_err(|e| e.to_string())?;
      fs::copy(&src, &dst).map_err(|e| e.to_string())?;
      let fd = files.fetch_add(1, Ordering::SeqCst) + 1;
      let bd = bytes.fetch_add(meta.len(), Ordering::SeqCst) + meta.len();
      emit_progress(
        app,
        BackupProgress {
          phase: "copy".into(),
          message: name_str,
          files_done: fd,
          bytes_done: bd,
        },
      );
    }
  }
  Ok(())
}

fn wipe_dir_contents(dir: &Path) -> Result<(), String> {
  if !dir.is_dir() {
    return Ok(());
  }
  for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    if path.is_dir() {
      fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else {
      fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

fn timestamp_name() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  format!("backup-{secs}")
}

#[tauri::command]
pub async fn backup_game_dir(
  app: AppHandle,
  input: BackupGameInput,
) -> Result<BackupGameResult, String> {
  let source = PathBuf::from(input.source_dir.trim());
  let backup_root = PathBuf::from(input.backup_root.trim());
  let game_key = input.game_key.trim();
  if game_key.is_empty() {
    return Err("Game key is required".into());
  }
  if !source.is_dir() {
    return Err(format!("Source directory not found: {}", source.display()));
  }
  if backup_root.as_os_str().is_empty() {
    return Err("Backup directory is not set".into());
  }

  let kind = input.kind.trim().to_ascii_lowercase();
  let timestamp = timestamp_name();
  let (dest, entry_name) = match kind.as_str() {
    "baseline" => (
      backup_root.join(game_key).join("baseline"),
      "baseline".to_string(),
    ),
    "snapshot" => {
      let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&timestamp)
        .to_string();
      (
        backup_root.join(game_key).join("snapshots").join(&name),
        name,
      )
    }
    other => return Err(format!("Unknown backup kind: {other}")),
  };

  if dest.exists() {
    fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
  }

  emit_progress(
    &app,
    BackupProgress {
      phase: "start".into(),
      message: format!("Backing up {}", source.display()),
      files_done: 0,
      bytes_done: 0,
    },
  );

  let files = Arc::new(AtomicU64::new(0));
  let bytes = Arc::new(AtomicU64::new(0));
  copy_filtered(
    &app,
    &source,
    &dest,
    input.exclude_safe_dirs,
    &files,
    &bytes,
  )?;

  let entry = BackupEntry {
    kind: kind.clone(),
    name: entry_name.clone(),
    path: dest.to_string_lossy().into_owned(),
    created_at: timestamp,
    exclude_safe_dirs: input.exclude_safe_dirs,
  };

  let mut manifest = read_manifest(&backup_root, game_key)?;
  manifest.game_key = game_key.to_string();
  match kind.as_str() {
    "baseline" => manifest.baseline = Some(entry.clone()),
    "snapshot" => {
      manifest.snapshots.retain(|s| s.name != entry.name);
      manifest.snapshots.push(entry.clone());
      manifest
        .snapshots
        .sort_by(|a, b| a.created_at.cmp(&b.created_at));
    }
    _ => {}
  }
  write_manifest(&backup_root, &manifest)?;

  emit_progress(
    &app,
    BackupProgress {
      phase: "done".into(),
      message: "Backup complete".into(),
      files_done: files.load(Ordering::SeqCst),
      bytes_done: bytes.load(Ordering::SeqCst),
    },
  );

  Ok(BackupGameResult {
    path: dest.to_string_lossy().into_owned(),
    entry,
  })
}

#[tauri::command]
pub fn list_backups(backup_root: String, game_key: String) -> Result<BackupManifest, String> {
  read_manifest(&PathBuf::from(backup_root.trim()), game_key.trim())
}

#[tauri::command]
pub async fn restore_game_dir(
  app: AppHandle,
  backup_path: String,
  target_dir: String,
) -> Result<(), String> {
  let backup = PathBuf::from(backup_path.trim());
  let target = PathBuf::from(target_dir.trim());
  if !backup.is_dir() {
    return Err(format!("Backup not found: {}", backup.display()));
  }
  if target.as_os_str().is_empty() {
    return Err("Target directory is not set".into());
  }
  fs::create_dir_all(&target).map_err(|e| e.to_string())?;

  emit_progress(
    &app,
    BackupProgress {
      phase: "restore".into(),
      message: format!("Restoring to {}", target.display()),
      files_done: 0,
      bytes_done: 0,
    },
  );

  wipe_dir_contents(&target)?;
  copy_recursive(&backup, &target)?;

  emit_progress(
    &app,
    BackupProgress {
      phase: "done".into(),
      message: "Restore complete".into(),
      files_done: 0,
      bytes_done: 0,
    },
  );
  Ok(())
}

#[tauri::command]
pub async fn create_named_backup(
  app: AppHandle,
  input: BackupGameInput,
) -> Result<BackupGameResult, String> {
  let mut snapshot = input;
  snapshot.kind = "snapshot".into();
  backup_game_dir(app, snapshot).await
}
