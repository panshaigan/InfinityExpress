//! Game directory backup and restore.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const BACKUP_PROGRESS_EVENT: &str = "weidu-backup-progress";

pub const SAFE_EXCLUDE_DIRS: &[&str] = &["movies", "music"];

/// Folder / entry names that must not be used as snapshot names.
const RESERVED_NAMES: &[&str] = &["vanilla", "baseline", "snapshots", "manifest.json"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupProgress {
  pub phase: String,
  pub message: String,
  pub files_done: u64,
  pub bytes_done: u64,
  pub files_total: u64,
  pub bytes_total: u64,
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
  /// Full unmodded game copy. Legacy JSON key `baseline` is accepted on read.
  #[serde(default, alias = "baseline")]
  pub vanilla: Option<BackupEntry>,
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

fn progress(
  phase: impl Into<String>,
  message: impl Into<String>,
  files_done: u64,
  bytes_done: u64,
  files_total: u64,
  bytes_total: u64,
) -> BackupProgress {
  BackupProgress {
    phase: phase.into(),
    message: message.into(),
    files_done,
    bytes_done,
    files_total,
    bytes_total,
  }
}

fn manifest_path(backup_root: &Path, game_key: &str) -> PathBuf {
  backup_root.join(game_key).join("manifest.json")
}

fn empty_manifest(game_key: &str) -> BackupManifest {
  BackupManifest {
    game_key: game_key.to_string(),
    vanilla: None,
    snapshots: Vec::new(),
  }
}

fn read_manifest_file(backup_root: &Path, game_key: &str) -> Result<BackupManifest, String> {
  let path = manifest_path(backup_root, game_key);
  if !path.is_file() {
    return Ok(empty_manifest(game_key));
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

fn is_reserved_name(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  RESERVED_NAMES.iter().any(|r| lower == *r)
}

fn normalize_kind(kind: &str) -> Result<&'static str, String> {
  match kind.trim().to_ascii_lowercase().as_str() {
    "vanilla" | "baseline" => Ok("vanilla"),
    "snapshot" => Ok("snapshot"),
    other => Err(format!("Unknown backup kind: {other}")),
  }
}

/// Migrate legacy `baseline/` + `snapshots/` layout and rewrite manifest paths/kinds.
fn migrate_layout(backup_root: &Path, game_key: &str) -> Result<BackupManifest, String> {
  let game_root = backup_root.join(game_key);
  if !game_root.exists() {
    return Ok(empty_manifest(game_key));
  }

  let baseline_dir = game_root.join("baseline");
  let vanilla_dir = game_root.join("vanilla");
  if baseline_dir.is_dir() && !vanilla_dir.exists() {
    fs::rename(&baseline_dir, &vanilla_dir).map_err(|e| e.to_string())?;
  }

  let snapshots_dir = game_root.join("snapshots");
  if snapshots_dir.is_dir() {
    for entry in fs::read_dir(&snapshots_dir).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      let name = entry.file_name();
      let name_str = name.to_string_lossy();
      if is_reserved_name(&name_str) {
        continue;
      }
      let dest = game_root.join(&name);
      if !dest.exists() {
        fs::rename(entry.path(), &dest).map_err(|e| e.to_string())?;
      }
    }
    // Drop empty snapshots folder; ignore if not empty (collision left behind).
    let _ = fs::remove_dir(&snapshots_dir);
  }

  let mut manifest = read_manifest_file(backup_root, game_key)?;
  manifest.game_key = game_key.to_string();

  if let Some(ref mut v) = manifest.vanilla {
    v.kind = "vanilla".into();
    v.name = "vanilla".into();
    v.path = vanilla_dir.to_string_lossy().into_owned();
  } else if vanilla_dir.is_dir() {
    // On-disk vanilla without manifest entry (legacy or orphan).
    let meta = vanilla_dir.metadata().ok();
    let created = meta
      .and_then(|m| m.created().ok())
      .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
      .map(|d| {
        let secs = d.as_secs();
        let days = secs / 86_400;
        let day_secs = secs % 86_400;
        let (y, m, d) = civil_from_days(days as i64);
        let hh = day_secs / 3600;
        let mm = (day_secs % 3600) / 60;
        let ss = day_secs % 60;
        format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
      })
      .unwrap_or_else(iso_timestamp);
    manifest.vanilla = Some(BackupEntry {
      kind: "vanilla".into(),
      name: "vanilla".into(),
      path: vanilla_dir.to_string_lossy().into_owned(),
      created_at: created,
      exclude_safe_dirs: false,
    });
  }

  for snap in &mut manifest.snapshots {
    snap.kind = "snapshot".into();
    let flat = game_root.join(&snap.name);
    let nested = game_root.join("snapshots").join(&snap.name);
    if flat.is_dir() {
      snap.path = flat.to_string_lossy().into_owned();
    } else if nested.is_dir() {
      snap.path = nested.to_string_lossy().into_owned();
    } else {
      snap.path = flat.to_string_lossy().into_owned();
    }
  }

  // Discover flat snapshot dirs not listed in the manifest.
  if game_root.is_dir() {
    for entry in fs::read_dir(&game_root).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      if !entry.path().is_dir() {
        continue;
      }
      let name = entry.file_name().to_string_lossy().to_string();
      if is_reserved_name(&name) {
        continue;
      }
      if manifest.snapshots.iter().any(|s| s.name == name) {
        continue;
      }
      let meta = entry.metadata().ok();
      let created = meta
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| {
          let secs = d.as_secs();
          let days = secs / 86_400;
          let day_secs = secs % 86_400;
          let (y, m, day) = civil_from_days(days as i64);
          let hh = day_secs / 3600;
          let mm = (day_secs % 3600) / 60;
          let ss = day_secs % 60;
          format!("{y:04}-{m:02}-{day:02}T{hh:02}:{mm:02}:{ss:02}Z")
        })
        .unwrap_or_else(iso_timestamp);
      manifest.snapshots.push(BackupEntry {
        kind: "snapshot".into(),
        name: name.clone(),
        path: entry.path().to_string_lossy().into_owned(),
        created_at: created,
        exclude_safe_dirs: false,
      });
    }
  }

  manifest
    .snapshots
    .sort_by(|a, b| a.created_at.cmp(&b.created_at));
  write_manifest(backup_root, &manifest)?;
  Ok(manifest)
}

fn read_manifest(backup_root: &Path, game_key: &str) -> Result<BackupManifest, String> {
  migrate_layout(backup_root, game_key)
}

fn should_exclude(name: &str, exclude_safe: bool) -> bool {
  if !exclude_safe {
    return false;
  }
  let lower = name.to_ascii_lowercase();
  SAFE_EXCLUDE_DIRS.iter().any(|d| lower == *d)
}

fn measure_filtered(from: &Path, exclude_safe: bool) -> Result<(u64, u64), String> {
  let mut files = 0u64;
  let mut bytes = 0u64;
  measure_filtered_into(from, exclude_safe, &mut files, &mut bytes)?;
  Ok((files, bytes))
}

fn measure_filtered_into(
  from: &Path,
  exclude_safe: bool,
  files: &mut u64,
  bytes: &mut u64,
) -> Result<(), String> {
  for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let name_str = entry.file_name().to_string_lossy().to_string();
    if should_exclude(&name_str, exclude_safe) {
      continue;
    }
    let src = entry.path();
    if src.is_dir() {
      measure_filtered_into(&src, exclude_safe, files, bytes)?;
    } else {
      let meta = src.metadata().map_err(|e| e.to_string())?;
      *files += 1;
      *bytes += meta.len();
    }
  }
  Ok(())
}

fn copy_filtered(
  app: &AppHandle,
  from: &Path,
  to: &Path,
  exclude_safe: bool,
  files: &Arc<AtomicU64>,
  bytes: &Arc<AtomicU64>,
  files_total: u64,
  bytes_total: u64,
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
      copy_filtered(
        app,
        &src,
        &dst,
        exclude_safe,
        files,
        bytes,
        files_total,
        bytes_total,
      )?;
    } else {
      let meta = src.metadata().map_err(|e| e.to_string())?;
      fs::copy(&src, &dst).map_err(|e| e.to_string())?;
      let fd = files.fetch_add(1, Ordering::SeqCst) + 1;
      let bd = bytes.fetch_add(meta.len(), Ordering::SeqCst) + meta.len();
      emit_progress(
        app,
        progress("copy", name_str, fd, bd, files_total, bytes_total),
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

/// Run a blocking remove off the async runtime; UI shows indeterminate progress from the start emit.
async fn remove_path_with_progress(
  app: &AppHandle,
  path: PathBuf,
  phase: &str,
  message: &str,
) -> Result<(), String> {
  emit_progress(app, progress(phase, message, 0, 0, 0, 0));
  tauri::async_runtime::spawn_blocking(move || {
    if path.is_dir() {
      fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else if path.exists() {
      fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
      Ok(())
    }
  })
  .await
  .map_err(|e| format!("Remove task failed: {e}"))?
}

async fn wipe_dir_with_progress(
  app: &AppHandle,
  dir: PathBuf,
  phase: &str,
  message: &str,
) -> Result<(), String> {
  emit_progress(app, progress(phase, message, 0, 0, 0, 0));
  tauri::async_runtime::spawn_blocking(move || wipe_dir_contents(&dir))
    .await
    .map_err(|e| format!("Wipe task failed: {e}"))?
}

fn iso_timestamp() -> String {
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  let days = secs / 86_400;
  let day_secs = secs % 86_400;
  let (y, m, d) = civil_from_days(days as i64);
  let hh = day_secs / 3600;
  let mm = (day_secs % 3600) / 60;
  let ss = day_secs % 60;
  format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

/// Days since Unix epoch → Gregorian Y-M-D (Howard Hinnant algorithm).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
  let z = z + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = (z - era * 146_097) as u64;
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
  let y = (yoe as i64) + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = if m <= 2 { y + 1 } else { y };
  (y as i32, m as u32, d as u32)
}

fn fallback_snapshot_name() -> String {
  let stamp = iso_timestamp();
  let compact = stamp
    .chars()
    .filter(|c| c.is_ascii_digit())
    .collect::<String>();
  if compact.len() >= 14 {
    format!(
      "snapshot-{}-{}",
      &compact[0..8],
      &compact[8..14]
    )
  } else {
    format!("snapshot-{stamp}")
  }
}

fn resolve_under(parent: &Path, child: &Path) -> Result<PathBuf, String> {
  let parent_canon = fs::canonicalize(parent).map_err(|e| e.to_string())?;
  let child_canon = fs::canonicalize(child).map_err(|e| e.to_string())?;
  if child_canon == parent_canon || !child_canon.starts_with(&parent_canon) {
    return Err("Backup path escapes backup root".into());
  }
  Ok(child_canon)
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

  let kind = normalize_kind(&input.kind)?;
  let _ = migrate_layout(&backup_root, game_key)?;

  let created_at = iso_timestamp();
  let (dest, entry_name) = match kind {
    "vanilla" => (
      backup_root.join(game_key).join("vanilla"),
      "vanilla".to_string(),
    ),
    "snapshot" => {
      let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(fallback_snapshot_name);
      if is_reserved_name(&name) {
        return Err(format!("Snapshot name \"{name}\" is reserved"));
      }
      if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Snapshot name must be a single path segment".into());
      }
      (backup_root.join(game_key).join(&name), name)
    }
    _ => unreachable!(),
  };

  if dest.exists() {
    remove_path_with_progress(
      &app,
      dest.clone(),
      "delete",
      "Removing previous backup…",
    )
    .await?;
  }

  emit_progress(
    &app,
    progress(
      "scan",
      format!("Measuring {}", source.display()),
      0,
      0,
      0,
      0,
    ),
  );

  let (files_total, bytes_total) = measure_filtered(&source, input.exclude_safe_dirs)?;

  emit_progress(
    &app,
    progress(
      "start",
      format!("Backing up {}", source.display()),
      0,
      0,
      files_total,
      bytes_total,
    ),
  );

  let files = Arc::new(AtomicU64::new(0));
  let bytes = Arc::new(AtomicU64::new(0));
  let app_copy = app.clone();
  let source_copy = source.clone();
  let dest_copy = dest.clone();
  let exclude = input.exclude_safe_dirs;
  let files_c = Arc::clone(&files);
  let bytes_c = Arc::clone(&bytes);
  tauri::async_runtime::spawn_blocking(move || {
    copy_filtered(
      &app_copy,
      &source_copy,
      &dest_copy,
      exclude,
      &files_c,
      &bytes_c,
      files_total,
      bytes_total,
    )
  })
  .await
  .map_err(|e| format!("Backup copy task failed: {e}"))??;

  let entry = BackupEntry {
    kind: kind.to_string(),
    name: entry_name.clone(),
    path: dest.to_string_lossy().into_owned(),
    created_at,
    exclude_safe_dirs: input.exclude_safe_dirs,
  };

  let mut manifest = read_manifest(&backup_root, game_key)?;
  manifest.game_key = game_key.to_string();
  match kind {
    "vanilla" => manifest.vanilla = Some(entry.clone()),
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
    progress(
      "done",
      "Backup complete",
      files.load(Ordering::SeqCst),
      bytes.load(Ordering::SeqCst),
      files_total,
      bytes_total,
    ),
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

  wipe_dir_with_progress(
    &app,
    target.clone(),
    "delete",
    "Cleaning game folder…",
  )
  .await?;

  emit_progress(
    &app,
    progress(
      "scan",
      format!("Measuring {}", backup.display()),
      0,
      0,
      0,
      0,
    ),
  );

  let (files_total, bytes_total) = measure_filtered(&backup, false)?;

  emit_progress(
    &app,
    progress(
      "restore",
      format!("Restoring to {}", target.display()),
      0,
      0,
      files_total,
      bytes_total,
    ),
  );

  let files = Arc::new(AtomicU64::new(0));
  let bytes = Arc::new(AtomicU64::new(0));
  let app_copy = app.clone();
  let backup_copy = backup.clone();
  let target_copy = target.clone();
  let files_c = Arc::clone(&files);
  let bytes_c = Arc::clone(&bytes);
  tauri::async_runtime::spawn_blocking(move || {
    copy_filtered(
      &app_copy,
      &backup_copy,
      &target_copy,
      false,
      &files_c,
      &bytes_c,
      files_total,
      bytes_total,
    )
  })
  .await
  .map_err(|e| format!("Restore copy task failed: {e}"))??;

  emit_progress(
    &app,
    progress(
      "done",
      "Restore complete",
      files.load(Ordering::SeqCst),
      bytes.load(Ordering::SeqCst),
      files_total,
      bytes_total,
    ),
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

#[tauri::command]
pub async fn delete_backup(
  app: AppHandle,
  backup_root: String,
  game_key: String,
  backup_path: String,
) -> Result<(), String> {
  let root = PathBuf::from(backup_root.trim());
  let key = game_key.trim().to_string();
  let path = PathBuf::from(backup_path.trim());
  if key.is_empty() {
    return Err("Game key is required".into());
  }
  if root.as_os_str().is_empty() {
    return Err("Backup directory is not set".into());
  }
  if !path.exists() {
    return Err(format!("Backup not found: {}", path.display()));
  }

  let _ = migrate_layout(&root, &key)?;
  let game_root = root.join(&key);
  let safe = resolve_under(&game_root, &path)?;

  let mut manifest = read_manifest(&root, &key)?;
  let matches = |entry_path: &str| {
    Path::new(entry_path) == path
      || fs::canonicalize(entry_path)
        .ok()
        .is_some_and(|p| p == safe)
  };
  if manifest.vanilla.as_ref().is_some_and(|b| matches(&b.path)) {
    manifest.vanilla = None;
  }
  manifest.snapshots.retain(|s| !matches(&s.path));
  write_manifest(&root, &manifest)?;

  remove_path_with_progress(&app, safe, "delete", "Removing backup…").await?;

  emit_progress(
    &app,
    progress("done", "Backup deleted", 0, 0, 0, 0),
  );
  Ok(())
}
