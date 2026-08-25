//! Resolve bundled third-party binaries shipped in Tauri resources.

use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

fn resolve_resource(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(relative, BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve bundled resource {relative}: {e}"))
}

/// Strip Windows `\\?\` verbatim prefix from canonicalize'd resource paths.
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

fn validate_executable(path: &Path, label: &str) -> Result<String, String> {
    if !path.is_file() {
        return Err(format!("Bundled {label} not found: {}", path.display()));
    }
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn bundled_weidu_path(app: AppHandle) -> Result<String, String> {
    let path = strip_verbatim_prefix(&resolve_resource(&app, "weidu/weidu.exe")?);
    validate_executable(&path, "WeiDU executable")
}

pub fn bundled_7z_path(app: &AppHandle) -> Option<PathBuf> {
    let path = resolve_resource(app, "7zip/7z.exe").ok()?;
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}
