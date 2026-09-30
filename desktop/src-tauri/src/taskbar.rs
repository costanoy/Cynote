//! Keeps Dashnotes apart from Cynote on the Windows taskbar.
//!
//! Both windows live in the same process, and Windows groups taskbar
//! buttons by "AppUserModelID" - which, unless told otherwise, it derives
//! from the process. So Dashnotes piled onto Cynote's button (and onto a
//! pinned Cynote). Giving the Dashnotes window, and the Dashnotes shortcuts,
//! an ID of their own makes the taskbar treat it as a separate app: its own
//! button, its own icon, and pinning it pins Dashnotes (relaunched with
//! `--dashboard`), not Cynote.

use std::path::Path;

use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{E_OUTOFMEMORY, HWND, PROPERTYKEY};
use windows::Win32::Storage::EnhancedStorage::{
    PKEY_AppUserModel_ID, PKEY_AppUserModel_RelaunchCommand, PKEY_AppUserModel_RelaunchDisplayNameResource,
    PKEY_AppUserModel_RelaunchIconResource,
};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemAlloc, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

pub const DASHNOTES_APP_ID: &str = "com.cynote.dashnotes";
const DASHNOTES_NAME: &str = "Dashnotes";

/// Sets a string property. The string is put in COM memory (CoTaskMemAlloc),
/// the way InitPropVariantFromString would: a pointer into Rust's own heap
/// crashed the app with heap corruption when saving a shortcut. Not freed
/// here, since the store may take it over; at worst a few bytes leak.
unsafe fn set_string(store: &IPropertyStore, key: &PROPERTYKEY, value: &str) -> windows::core::Result<()> {
    let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = wide.len() * std::mem::size_of::<u16>();
    let buffer = CoTaskMemAlloc(bytes) as *mut u16;
    if buffer.is_null() {
        return Err(windows::core::Error::from(E_OUTOFMEMORY));
    }
    std::ptr::copy_nonoverlapping(wide.as_ptr(), buffer, wide.len());
    let mut pv = PROPVARIANT::default();
    (*pv.Anonymous.Anonymous).vt = VT_LPWSTR;
    (*pv.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(buffer);
    store.SetValue(key, &pv)
}

/// Runs `f` on a fresh thread with COM initialized - the shell objects used
/// here need it, and this keeps the (brief) work off the UI thread.
fn with_com<F: FnOnce() + Send + 'static>(f: F) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        f();
        if initialized {
            CoUninitialize();
        }
    })
}

/// Gives the Dashnotes window its own taskbar identity (see module docs).
/// `hwnd` is the window's raw handle.
pub fn separate_dashnotes_window(hwnd: isize, exe: &Path, icon: Option<&Path>) {
    let relaunch = format!("\"{}\" --dashboard", exe.display());
    let icon = icon.map(|p| format!("{},0", p.display()));
    unsafe {
        let Ok(store) = SHGetPropertyStoreForWindow::<IPropertyStore>(HWND(hwnd as *mut _)) else { return };
        // The relaunch properties go in first: the taskbar reads them when
        // the ID is set, to know how to pin and relaunch this window.
        let _ = set_string(&store, &PKEY_AppUserModel_RelaunchCommand, &relaunch);
        let _ = set_string(&store, &PKEY_AppUserModel_RelaunchDisplayNameResource, DASHNOTES_NAME);
        if let Some(icon) = &icon {
            let _ = set_string(&store, &PKEY_AppUserModel_RelaunchIconResource, icon);
        }
        let _ = set_string(&store, &PKEY_AppUserModel_ID, DASHNOTES_APP_ID);
        let _ = store.Commit();
    }
}

/// Writes a Dashnotes shortcut carrying the Dashnotes app ID, so launching
/// or pinning it lands on the same taskbar button as the window.
pub fn write_dashnotes_shortcut(
    target: &Path,
    args: &str,
    icon: Option<&Path>,
    output: &Path,
) -> std::thread::JoinHandle<()> {
    let target = target.to_path_buf();
    let args = args.to_string();
    let icon = icon.map(Path::to_path_buf);
    let output = output.to_path_buf();
    with_com(move || unsafe {
        let result = (|| -> windows::core::Result<()> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(&HSTRING::from(target.as_os_str()))?;
            link.SetArguments(&HSTRING::from(args.as_str()))?;
            if let Some(dir) = target.parent() {
                link.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?;
            }
            if let Some(icon) = &icon {
                link.SetIconLocation(&HSTRING::from(icon.as_os_str()), 0)?;
            }
            let store: IPropertyStore = link.cast()?;
            set_string(&store, &PKEY_AppUserModel_ID, DASHNOTES_APP_ID)?;
            store.Commit()?;
            let file: IPersistFile = link.cast()?;
            file.Save(PCWSTR(HSTRING::from(output.as_os_str()).as_ptr()), true)
        })();
        if let Err(e) = result {
            eprintln!("Failed to write shortcut {}: {e}", output.display());
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_shortcut() {
        let dir = std::env::temp_dir().join("cynote-taskbar-test");
        let _ = std::fs::create_dir_all(&dir);
        let out = dir.join("Dashnotes.lnk");
        let _ = std::fs::remove_file(&out);
        let exe = std::env::current_exe().unwrap();
        write_dashnotes_shortcut(&exe, "--dashboard", None, &out).join().unwrap();
        assert!(out.exists());
    }
}
