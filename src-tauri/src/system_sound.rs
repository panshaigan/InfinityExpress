//! Play short OS system sounds (Windows notification aliases).

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SystemSoundKind {
  Success,
  Error,
}

#[tauri::command]
pub fn play_system_sound(kind: SystemSoundKind) {
  #[cfg(windows)]
  {
    play_windows(kind);
  }
  #[cfg(not(windows))]
  {
    let _ = kind;
  }
}

#[cfg(windows)]
fn play_windows(kind: SystemSoundKind) {
  // winmm PlaySoundW — SND_ALIAS | SND_ASYNC
  const SND_ASYNC: u32 = 0x0001;
  const SND_ALIAS: u32 = 0x0001_0000;

  #[link(name = "winmm")]
  extern "system" {
    fn PlaySoundW(psz_sound: *const u16, hmod: isize, fdw_sound: u32) -> i32;
  }

  let alias_name = match kind {
    // Default notification / balloon sound
    SystemSoundKind::Success => "SystemNotification",
    SystemSoundKind::Error => "SystemHand",
  };
  let alias: Vec<u16> = alias_name
    .encode_utf16()
    .chain(std::iter::once(0))
    .collect();

  unsafe {
    let _ = PlaySoundW(alias.as_ptr(), 0, SND_ALIAS | SND_ASYNC);
  }
}
