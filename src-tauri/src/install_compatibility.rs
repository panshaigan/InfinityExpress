//! Target-game checks: a Linux host may be modding a Windows/Proton game.
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, PartialEq)]
enum GameBinary {
    Windows,
    Linux,
    Unknown,
}

fn game_binary(game: &Path) -> GameBinary {
    let mut windows = false;
    let mut linux = false;
    let Ok(entries) = std::fs::read_dir(game) else {
        return GameBinary::Unknown;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if !matches!(
            name.as_str(),
            "baldur.exe"
                | "icewind.exe"
                | "torment.exe"
                | "baldursgate"
                | "baldursgateii"
                | "icewinddale"
                | "torment"
        ) {
            continue;
        }
        let mut header = [0u8; 4];
        if File::open(entry.path())
            .and_then(|mut f| f.read_exact(&mut header))
            .is_err()
        {
            continue;
        }
        windows |= header.starts_with(b"MZ");
        linux |= header == *b"\x7fELF";
    }
    match (windows, linux) {
        (true, false) => GameBinary::Windows,
        (false, true) => GameBinary::Linux,
        _ => GameBinary::Unknown, // mixed folders are ambiguous; do not guess
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityRequest {
    step_id: String,
    game_dir: String,
    component_id: String,
    mod_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityIssue {
    pub step_id: String,
    pub action: String,
    pub reason: String,
}

fn windows_only(component_id: &str, mod_id: &str) -> Option<&'static str> {
    let component = component_id.to_ascii_lowercase();
    if component.starts_with("bubb_revert_pathfinding:")
        || mod_id.eq_ignore_ascii_case("bubb_revert_pathfinding")
    {
        Some("Bubb's pathfinding revert")
    } else if component.starts_with("eeex:") || mod_id.eq_ignore_ascii_case("eeex") {
        Some("EEex")
    } else {
        None
    }
}

fn check(request: CompatibilityRequest) -> Option<CompatibilityIssue> {
    let label = windows_only(&request.component_id, &request.mod_id)?;
    let (action, reason) = match game_binary(Path::new(&request.game_dir)) {
        GameBinary::Windows => return None,
        GameBinary::Linux if label != "EEex" => ("skip", format!("{label} patches Windows executables and does not apply to this native Linux game. Skipped before staging.")),
        GameBinary::Linux => ("block", "EEex requires a Windows game executable (on Linux, use a Windows installation through Proton/Wine). Deselect EEex and its dependent components for a native Linux game.".into()),
        GameBinary::Unknown => ("block", format!("Cannot determine the target game's executable platform for {label}. Select a game folder containing one unambiguous Windows or native Linux game executable.")),
    };
    Some(CompatibilityIssue {
        step_id: request.step_id,
        action: action.into(),
        reason,
    })
}

#[tauri::command]
pub fn check_install_compatibility(requests: Vec<CompatibilityRequest>) -> Vec<CompatibilityIssue> {
    requests.into_iter().filter_map(check).collect()
}

/// Enforce the same boundary for direct staging and cached install calls.
pub fn require_compatible(game: &Path, mod_id: &str) -> Result<(), String> {
    match check(CompatibilityRequest {
        step_id: String::new(),
        game_dir: game.display().to_string(),
        component_id: format!("{mod_id}:0"),
        mod_id: mod_id.into(),
    }) {
        Some(issue) => Err(issue.reason),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(game: &Path, id: &str) -> CompatibilityRequest {
        CompatibilityRequest {
            step_id: "single:0000".into(),
            game_dir: game.display().to_string(),
            component_id: id.into(),
            mod_id: "download-id".into(),
        }
    }
    #[test]
    fn native_targets_skip_pathfinding_but_block_eeex() {
        let game = tempfile::tempdir().unwrap();
        std::fs::write(game.path().join("BaldursGateII"), b"\x7fELFtest").unwrap();
        assert_eq!(
            check(request(game.path(), "bubb_revert_pathfinding:0"))
                .unwrap()
                .action,
            "skip"
        );
        assert_eq!(
            check(request(game.path(), "EEex:1")).unwrap().action,
            "block"
        );
        assert!(check(request(game.path(), "cdtweaks:0")).is_none());
        assert!(require_compatible(game.path(), "EEex").is_err());
    }
    #[test]
    fn windows_targets_are_allowed_independent_of_host_os() {
        let game = tempfile::tempdir().unwrap();
        std::fs::write(game.path().join("BALDUR.EXE"), b"MZtest").unwrap();
        assert!(check(request(game.path(), "EEex:1")).is_none());
        assert!(check(request(game.path(), "bubb_revert_pathfinding:0")).is_none());
        std::fs::write(game.path().join("BaldursGate"), b"\x7fELFtest").unwrap();
        assert_eq!(
            check(request(game.path(), "EEex:1")).unwrap().action,
            "block"
        );
    }
    #[test]
    fn missing_or_unrecognized_binaries_do_not_allow_executable_patches() {
        let game = tempfile::tempdir().unwrap();
        assert_eq!(
            check(request(game.path(), "EEex:1")).unwrap().action,
            "block"
        );
        std::fs::write(game.path().join("Baldur.exe"), b"not a game").unwrap();
        assert_eq!(
            check(request(game.path(), "bubb_revert_pathfinding:0"))
                .unwrap()
                .action,
            "block"
        );
    }
}
