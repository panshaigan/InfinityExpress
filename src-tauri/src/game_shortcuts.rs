use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::Manager;

fn game_dir(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("No game folder configured.".into());
    }
    let dir = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    if !dir.is_dir() {
        return Err("Game folder is not a directory.".into());
    }
    Ok(dir)
}

fn documents_name(lua: &str) -> Result<String, String> {
    let pattern = regex::Regex::new(r#"(?m)^\s*engine_name\s*=\s*["']([^"']+)["']"#).unwrap();
    let name = pattern
        .captures(lua)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .ok_or("Could not read the savegame folder name from engine.lua.")?;
    if name.trim().is_empty() || name == "." || name == ".." || name.contains(['/', '\\', ':']) {
        return Err("Invalid savegame folder name in engine.lua.".into());
    }
    Ok(name.to_owned())
}

#[tauri::command]
pub fn game_documents_path(app: tauri::AppHandle, game_path: String) -> Result<String, String> {
    let dir = game_dir(&game_path)?;
    let lua = std::fs::read_to_string(dir.join("engine.lua"))
        .map_err(|e| format!("Cannot read engine.lua: {e}"))?;
    let path = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join(documents_name(&lua)?);
    if !path.is_dir() {
        return Err(format!(
            "Savegame folder does not exist yet: {}. Start the game once first.",
            path.display()
        ));
    }
    Ok(path.to_string_lossy().into_owned())
}

fn launch_exe(dir: &Path, game_key: &str) -> Result<PathBuf, String> {
    let normal = match game_key {
        "bg1" | "bg2" => "Baldur.exe",
        "iwd" => "Icewind.exe",
        "pst" => "Torment.exe",
        _ => return Err("Unknown game type.".into()),
    };
    // The loader is installed alongside the game executable by EEex.
    let loader = dir.join("InfinityLoader.exe");
    let exe = if loader.is_file() {
        loader
    } else if game_key == "bg2" {
        crate::weidu_install::find_named_game_exe(dir, normal)
            .ok_or("Game executable not found: Baldur.exe or BaldurII.exe")?
    } else {
        dir.join(normal)
    };
    if !exe.is_file() {
        return Err(format!("Game executable not found: {}", exe.display()));
    }
    Ok(exe)
}

#[tauri::command]
pub fn launch_project_game(game_path: String, game_key: String) -> Result<(), String> {
    let dir = game_dir(&game_path)?;
    let exe = launch_exe(&dir, &game_key)?;
    let mut command = Command::new(exe);
    command
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::process_util::configure_headless(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not launch game: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_custom_engine_name_and_rejects_paths() {
        assert_eq!(
            documents_name("-- comment\nengine_name = \"EET saves\"\n").unwrap(),
            "EET saves"
        );
        assert_eq!(
            documents_name("engine_name='BG saves'").unwrap(),
            "BG saves"
        );
        for input in [
            "engine_name = '../escape'",
            "engine_name = 'C:\\escape'",
            "-- engine_name = 'ignored'",
            "engine_name = '..'",
        ] {
            assert!(documents_name(input).is_err());
        }
    }

    #[test]
    fn selects_loader_before_normal_exe_and_requires_known_game() {
        let dir = tempfile::tempdir().unwrap();
        assert!(launch_exe(dir.path(), "bg2").is_err());
        std::fs::write(dir.path().join("BaldurII.exe"), "").unwrap();
        assert_eq!(
            launch_exe(dir.path(), "bg2").unwrap(),
            dir.path().join("BaldurII.exe")
        );
        assert!(launch_exe(dir.path(), "bg1").is_err());
        std::fs::write(dir.path().join("Baldur.exe"), "").unwrap();
        assert_eq!(
            launch_exe(dir.path(), "bg2").unwrap(),
            dir.path().join("Baldur.exe")
        );
        std::fs::write(dir.path().join("InfinityLoader.exe"), "").unwrap();
        assert_eq!(
            launch_exe(dir.path(), "bg2").unwrap(),
            dir.path().join("InfinityLoader.exe")
        );
        std::fs::remove_file(dir.path().join("Baldur.exe")).unwrap();
        assert_eq!(
            launch_exe(dir.path(), "bg2").unwrap(),
            dir.path().join("InfinityLoader.exe")
        );
        assert!(launch_exe(dir.path(), "unknown").is_err());
    }
}
