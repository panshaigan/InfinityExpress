use std::sync::atomic::{AtomicBool, Ordering};

static FRESH_INSTALL_CONSUMED: AtomicBool = AtomicBool::new(false);

fn env_flag_truthy(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

/// Returns true once per process when `IE_FRESH_INSTALL` is set to a truthy value.
/// Subsequent calls return false so a post-clear reload does not loop.
#[tauri::command]
pub fn take_fresh_install_env_flag() -> bool {
    // An inherited development environment variable must never wipe release data.
    if !cfg!(debug_assertions) {
        return false;
    }
    if FRESH_INSTALL_CONSUMED.swap(true, Ordering::SeqCst) {
        return false;
    }
    match std::env::var("IE_FRESH_INSTALL") {
        Ok(v) => env_flag_truthy(&v),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::env_flag_truthy;

    #[test]
    fn truthy_values() {
        for v in ["1", "true", "TRUE", " yes ", "on"] {
            assert!(env_flag_truthy(v), "{v}");
        }
    }

    #[test]
    fn falsy_values() {
        for v in ["", "0", "false", "no", "off", "maybe"] {
            assert!(!env_flag_truthy(v), "{v}");
        }
    }
}
