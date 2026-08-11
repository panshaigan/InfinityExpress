use std::fs;
use std::path::{Component, Path, PathBuf};

/// List immediate subdirectory names under `path`.
/// Missing or non-directory paths return an empty list.
#[tauri::command]
pub fn list_subdir_names(path: String) -> Result<Vec<String>, String> {
  let root = PathBuf::from(path.trim());
  if root.as_os_str().is_empty() {
    return Ok(Vec::new());
  }
  if !root.is_dir() {
    return Ok(Vec::new());
  }

  let mut names = Vec::new();
  let entries = fs::read_dir(&root).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if !meta.is_dir() {
      continue;
    }
    if let Some(name) = entry.file_name().to_str() {
      names.push(name.to_string());
    }
  }
  names.sort_unstable();
  Ok(names)
}

/// Read a UTF-8 text file from an absolute path (install logs, etc.).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if !p.is_file() {
    return Err("File not found".into());
  }
  fs::read_to_string(&p).map_err(|e| e.to_string())
}

/// Recursively delete `download_dir/folder_name` after path-safety checks.
/// Folder name match is case-insensitive (uses the on-disk spelling).
#[tauri::command]
pub fn remove_mod_dir(download_dir: String, folder_name: String) -> Result<(), String> {
  let folder = folder_name.trim();
  validate_folder_name(folder)?;

  let download = PathBuf::from(download_dir.trim());
  if download.as_os_str().is_empty() {
    return Err("Mods download directory is not set".into());
  }
  if !download.is_dir() {
    return Err("Mods download directory does not exist".into());
  }

  let actual_name = find_subdir_ci(&download, folder)?;
  let Some(actual_name) = actual_name else {
    return Ok(());
  };

  let target = download.join(&actual_name);
  ensure_under_parent(&download, &target)?;

  if !target.is_dir() {
    return Err(format!("\"{actual_name}\" is not a directory"));
  }

  fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

pub(crate) fn find_subdir_ci(parent: &Path, wanted: &str) -> Result<Option<String>, String> {
  let wanted_lower = wanted.to_lowercase();
  let entries = fs::read_dir(parent).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if !meta.is_dir() {
      continue;
    }
    let name = entry.file_name();
    let Some(name_str) = name.to_str() else {
      continue;
    };
    if name_str.to_lowercase() == wanted_lower {
      return Ok(Some(name_str.to_string()));
    }
  }
  Ok(None)
}

pub(crate) fn validate_folder_name(name: &str) -> Result<(), String> {
  if name.is_empty() {
    return Err("Folder name is required".into());
  }
  if name == "." || name == ".." {
    return Err("Invalid folder name".into());
  }
  if name.contains('/') || name.contains('\\') {
    return Err("Folder name must not contain path separators".into());
  }
  let path = Path::new(name);
  if path.components().count() != 1 {
    return Err("Folder name must be a single path segment".into());
  }
  match path.components().next() {
    Some(Component::Normal(_)) => Ok(()),
    _ => Err("Invalid folder name".into()),
  }
}

#[allow(dead_code)] // Prefer progress-emitting copy helpers in install/backup paths.
pub(crate) fn copy_recursive(from: &Path, to: &Path) -> Result<(), String> {
  if from.is_dir() {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
    }
  } else {
    if let Some(parent) = to.parent() {
      std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(from, to).map_err(|e| e.to_string())?;
  }
  Ok(())
}

pub(crate) fn ensure_under_parent(parent: &Path, child: &Path) -> Result<(), String> {
  let parent_canon = fs::canonicalize(parent).map_err(|e| e.to_string())?;
  let child_canon = if child.exists() {
    fs::canonicalize(child).map_err(|e| e.to_string())?
  } else {
    parent_canon.join(
      child
        .file_name()
        .ok_or_else(|| "Invalid target path".to_string())?,
    )
  };

  if !child_canon.starts_with(&parent_canon) {
    return Err("Refusing to modify a path outside the mods download directory".into());
  }
  if child_canon == parent_canon {
    return Err("Refusing to modify the mods download directory itself".into());
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::validate_folder_name;

  #[test]
  fn rejects_path_separators_and_traversal() {
    assert!(validate_folder_name("").is_err());
    assert!(validate_folder_name("..").is_err());
    assert!(validate_folder_name("a/b").is_err());
    assert!(validate_folder_name("a\\b").is_err());
    assert!(validate_folder_name("EET").is_ok());
  }
}
