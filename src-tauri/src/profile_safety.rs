//! Immutable component catalogs and pre-migration/pre-update recovery checkpoints.
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn profile_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(feature = "desktop-smoke")]
    if let Some(profile) = std::env::var_os("IE_SMOKE_PROFILE") {
        let profile = PathBuf::from(profile);
        if !profile.is_absolute() {
            return Err("Smoke profile must be absolute".into());
        }
        return Ok(profile.join("profile-data"));
    }
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

fn catalog_path(root: &Path, revision: &str) -> Result<PathBuf, String> {
    if revision.len() != 64
        || !revision
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("Invalid component catalog revision".into());
    }
    Ok(root.join("catalogs").join(format!("{revision}.xml")))
}

fn save_catalog(root: &Path, revision: &str, xml: &str) -> Result<(), String> {
    let path = catalog_path(root, revision)?;
    if path.exists() {
        if fs::read_to_string(&path).map_err(|e| e.to_string())? != xml {
            return Err("Saved component catalog is damaged; refusing to replace it".into());
        }
        return Ok(());
    }
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(xml.as_bytes()).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist_noclobber(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn restore_catalog(root: &Path, revision: &str, xml: &str) -> Result<(), String> {
    let path = catalog_path(root, revision)?;
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(xml.as_bytes()).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn checkpoint(root: &Path, snapshot: &str) -> Result<String, String> {
    let mut value: serde_json::Value = serde_json::from_str(snapshot).map_err(|e| e.to_string())?;
    if value["version"] != 1 || !value["entries"].is_object() {
        return Err("Invalid profile checkpoint".into());
    }
    let entries = value["entries"].as_object().unwrap();
    if entries
        .iter()
        .any(|(key, value)| !key.starts_with("infinity-express.") || !value.is_string())
    {
        return Err("Invalid profile entries".into());
    }
    // Make every checkpoint self-contained, including older projects' route definitions.
    let mut catalogs = serde_json::Map::new();
    let dir = root.join("catalogs");
    if dir.exists() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|s| s.to_str()) == Some("xml") {
                let revision = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .ok_or("Invalid catalog filename")?;
                catalog_path(root, revision)?;
                let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
                catalogs.insert(revision.to_string(), xml.into());
            }
        }
    }
    value["catalogs"] = catalogs.into();
    let backup_dir = root.join("profile-backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let mut file = tempfile::Builder::new()
        .prefix("profile-")
        .suffix(".json")
        .tempfile_in(backup_dir)
        .map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(&mut file, &value).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    let (_, path) = file.keep().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn save_catalog_snapshot(
    app: tauri::AppHandle,
    revision: String,
    xml: String,
) -> Result<(), String> {
    let root = profile_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || save_catalog(&root, &revision, &xml))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_catalog_snapshot(
    app: tauri::AppHandle,
    revision: String,
) -> Result<String, String> {
    let root = profile_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::read_to_string(catalog_path(&root, &revision)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Explicit recovery after the UI verifies the backup's content hashes.
#[tauri::command]
pub async fn restore_catalog_snapshot(
    app: tauri::AppHandle,
    revision: String,
    xml: String,
) -> Result<(), String> {
    let root = profile_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || restore_catalog(&root, &revision, &xml))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_profile_checkpoint(
    app: tauri::AppHandle,
    snapshot: String,
) -> Result<String, String> {
    let root = profile_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || checkpoint(&root, &snapshot))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_immutable_and_rejects_traversal() {
        let root = tempfile::tempdir().unwrap();
        let revision = "a".repeat(64);
        save_catalog(root.path(), &revision, "original").unwrap();
        save_catalog(root.path(), &revision, "original").unwrap();
        assert!(save_catalog(root.path(), &revision, "replacement").is_err());
        for bad in ["../catalog", "", &"G".repeat(64)] {
            assert!(catalog_path(root.path(), bad).is_err());
        }
        assert_eq!(
            fs::read_to_string(catalog_path(root.path(), &revision).unwrap()).unwrap(),
            "original"
        );
        restore_catalog(root.path(), &revision, "verified recovery XML").unwrap();
        assert_eq!(
            fs::read_to_string(catalog_path(root.path(), &revision).unwrap()).unwrap(),
            "verified recovery XML"
        );
    }

    #[test]
    fn checkpoints_are_unique_and_include_previous_catalogs_and_raw_entries() {
        let root = tempfile::tempdir().unwrap();
        let revision = "b".repeat(64);
        save_catalog(root.path(), &revision, "old XML").unwrap();
        let snapshot = r#"{"version":1,"entries":{"infinity-express.projects-v1":"raw bytes"},"modsCsv":"new CSV"}"#;
        let first = checkpoint(root.path(), snapshot).unwrap();
        let second = checkpoint(root.path(), snapshot).unwrap();
        assert_ne!(first, second);
        let value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(first).unwrap()).unwrap();
        assert_eq!(value["catalogs"][revision], "old XML");
        assert_eq!(
            value["entries"]["infinity-express.projects-v1"],
            "raw bytes"
        );
        assert_eq!(value["modsCsv"], "new CSV");
        assert!(checkpoint(
            root.path(),
            r#"{"version":1,"entries":{"foreign-key":"secret"}}"#
        )
        .is_err());
    }
}
