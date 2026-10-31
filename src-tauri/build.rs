fn main() {
    // Git checkouts made on Windows do not retain the executable bit. Set it
    // before Tauri copies this resource into Linux packages (including AppImage).
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = "resources/weidu/linux-amd64/weidu";
        println!("cargo:rerun-if-changed={path}");
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .expect("failed to make bundled Linux WeiDU executable");
    }
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
