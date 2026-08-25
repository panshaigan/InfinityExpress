//! Helpers for spawning external CLI tools without flashing a console window.

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Hide the child console on Windows. Stdio pipes still work.
pub fn configure_headless(cmd: &mut Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}
