//! Read PE FileVersion without shelling out to PowerShell.

use std::path::Path;

/// Return the executable's FileVersion string (e.g. `"2.6.6.0"`), or an error.
pub fn read_exe_file_version(path: &Path) -> Result<String, String> {
    #[cfg(windows)]
    {
        read_windows(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Exe version probe is only supported on Windows".into())
    }
}

#[cfg(windows)]
fn read_windows(path: &Path) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;

    #[repr(C)]
    struct VsFixedFileInfo {
        dw_signature: u32,
        dw_struc_version: u32,
        dw_file_version_ms: u32,
        dw_file_version_ls: u32,
        dw_product_version_ms: u32,
        dw_product_version_ls: u32,
        dw_file_flags_mask: u32,
        dw_file_flags: u32,
        dw_file_os: u32,
        dw_file_type: u32,
        dw_file_subtype: u32,
        dw_file_date_ms: u32,
        dw_file_date_ls: u32,
    }

    #[link(name = "version")]
    extern "system" {
        fn GetFileVersionInfoSizeW(lptstr_filename: *const u16, lpdw_handle: *mut u32) -> u32;
        fn GetFileVersionInfoW(
            lptstr_filename: *const u16,
            dw_handle: u32,
            dw_len: u32,
            lp_data: *mut u8,
        ) -> i32;
        fn VerQueryValueW(
            p_block: *const u8,
            lp_sub_block: *const u16,
            lplp_buffer: *mut *mut core::ffi::c_void,
            pu_len: *mut u32,
        ) -> i32;
    }

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut handle = 0u32;
        let size = GetFileVersionInfoSizeW(wide.as_ptr(), &mut handle);
        if size == 0 {
            return Err("Failed to read exe version: no version resource".into());
        }
        let mut buf = vec![0u8; size as usize];
        if GetFileVersionInfoW(wide.as_ptr(), 0, size, buf.as_mut_ptr()) == 0 {
            return Err("Failed to read exe version: GetFileVersionInfo failed".into());
        }

        let root: Vec<u16> = "\\\0".encode_utf16().collect();
        let mut info_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut info_len = 0u32;
        if VerQueryValueW(buf.as_ptr(), root.as_ptr(), &mut info_ptr, &mut info_len) == 0
            || info_ptr.is_null()
            || (info_len as usize) < std::mem::size_of::<VsFixedFileInfo>()
        {
            return Err("Failed to read exe version: VerQueryValue failed".into());
        }

        let info = &*(info_ptr as *const VsFixedFileInfo);
        let major = (info.dw_file_version_ms >> 16) & 0xffff;
        let minor = info.dw_file_version_ms & 0xffff;
        let build = (info.dw_file_version_ls >> 16) & 0xffff;
        let revision = info.dw_file_version_ls & 0xffff;
        let version = format!("{major}.{minor}.{build}.{revision}");
        if version == "0.0.0.0" {
            return Err("Exe FileVersion was empty".into());
        }
        Ok(version)
    }
}
