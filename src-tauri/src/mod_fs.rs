use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
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

/// True when the path is a file with length greater than zero.
#[tauri::command]
pub fn file_is_nonempty(path: String) -> Result<bool, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Ok(false);
  }
  let p = PathBuf::from(trimmed);
  if !p.is_file() {
    return Ok(false);
  }
  let len = fs::metadata(&p).map_err(|e| e.to_string())?.len();
  Ok(len > 0)
}

/// Read up to the last `max_bytes` of a UTF-8 text file (install log tails, etc.).
#[tauri::command]
pub fn read_text_file_tail(path: String, max_bytes: u64) -> Result<String, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if !p.is_file() {
    return Err("File not found".into());
  }
  let cap = max_bytes.max(1);
  let mut file = File::open(&p).map_err(|e| e.to_string())?;
  let len = file.metadata().map_err(|e| e.to_string())?.len();
  if len == 0 {
    return Ok(String::new());
  }
  let start = len.saturating_sub(cap);
  file.seek(SeekFrom::Start(start))
    .map_err(|e| e.to_string())?;
  let mut buf = Vec::new();
  file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
  let mut text = String::from_utf8_lossy(&buf).into_owned();
  if start > 0 {
    if let Some(idx) = text.find('\n') {
      text = text[idx + 1..].to_string();
    } else {
      text.clear();
    }
  }
  Ok(text)
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

/// Write a UTF-8 text file, creating parent directories as needed.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if let Some(parent) = p.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  }
  fs::write(&p, contents).map_err(|e| e.to_string())
}

/// Append UTF-8 text to a file, creating parent directories and the file as needed.
#[tauri::command]
pub fn append_text_file(path: String, contents: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if let Some(parent) = p.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  }
  let mut file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&p)
    .map_err(|e| e.to_string())?;
  file.write_all(contents.as_bytes()).map_err(|e| e.to_string())
}

/// Create a directory (and parents) if missing.
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  fs::create_dir_all(trimmed).map_err(|e| e.to_string())
}

/// Validate a folder path that may be created: existing path must be a directory;
/// if missing, its parent must already be an existing directory.
#[tauri::command]
pub fn validate_creatable_dir(path: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if p.exists() {
    if p.is_dir() {
      return Ok(());
    }
    return Err("Path exists but is not a folder".into());
  }

  let parent = p.parent().filter(|parent| !parent.as_os_str().is_empty());
  let Some(parent) = parent else {
    return Err("Enter a full folder path".into());
  };
  if !parent.exists() {
    return Err("Parent folder does not exist".into());
  }
  if !parent.is_dir() {
    return Err("Parent path is not a folder".into());
  }
  Ok(())
}

/// True when `game_dir` contains a WeiDU.log file (case-insensitive name).
pub(crate) fn dir_has_weidu_log(dir: &Path) -> Result<bool, String> {
  if !dir.is_dir() {
    return Ok(false);
  }
  // Direct check is case-insensitive on Windows; also scan for other platforms.
  if dir.join("weidu.log").is_file() || dir.join("WeiDU.log").is_file() {
    return Ok(true);
  }
  let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
      continue;
    }
    if entry
      .file_name()
      .to_string_lossy()
      .eq_ignore_ascii_case("weidu.log")
    {
      return Ok(true);
    }
  }
  Ok(false)
}

/// True when `game_dir` contains a WeiDU.log file (case-insensitive name).
#[tauri::command]
pub fn game_dir_has_weidu_log(game_dir: String) -> Result<bool, String> {
  dir_has_weidu_log(&PathBuf::from(game_dir.trim()))
}

/// True when the path does not exist or is an empty directory.
#[tauri::command]
pub fn dir_is_empty(path: String) -> Result<bool, String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Path is required".into());
  }
  let p = PathBuf::from(trimmed);
  if !p.exists() {
    return Ok(true);
  }
  if !p.is_dir() {
    return Err("Path exists but is not a folder".into());
  }
  let mut entries = fs::read_dir(&p).map_err(|e| e.to_string())?;
  Ok(entries.next().is_none())
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
  use super::{read_text_file_tail, validate_folder_name};
  use std::io::Write;
  use tempfile::NamedTempFile;

  #[test]
  fn read_text_file_tail_returns_last_bytes() {
    let mut file = NamedTempFile::new().unwrap();
    write!(file, "line one\nline two\nline three\n").unwrap();
    let path = file.path().to_string_lossy().into_owned();
    let tail = read_text_file_tail(path, 20).unwrap();
    assert!(tail.contains("line three"));
    assert!(!tail.contains("line one"));
  }

  #[test]
  fn rejects_path_separators_and_traversal() {
    assert!(validate_folder_name("").is_err());
    assert!(validate_folder_name("..").is_err());
    assert!(validate_folder_name("a/b").is_err());
    assert!(validate_folder_name("a\\b").is_err());
    assert!(validate_folder_name("EET").is_ok());
  }
}
