//! Resolves paths to bundled forge CLIs (`gh`, `glab`) shipped inside the
//! `.app` bundle's `Resources/vendor/` tree, and exposes them via env vars
//! so subprocess spawns and AppleScript-driven terminals both pick them up
//! instead of relying on the user's PATH.

use std::path::{Path, PathBuf};

pub const GH_PATH_ENV: &str = "HELMOR_GH_BIN_PATH";
pub const GLAB_PATH_ENV: &str = "HELMOR_GLAB_BIN_PATH";

#[derive(Debug, Default, Clone)]
pub struct BundledForgeCliPaths {
    pub gh: Option<PathBuf>,
    pub glab: Option<PathBuf>,
}

pub fn resolve_bundled_paths() -> BundledForgeCliPaths {
    std::env::current_exe()
        .ok()
        .and_then(|exe| resolve_bundled_paths_for_exe(&exe))
        .unwrap_or_default()
}

fn resolve_bundled_paths_for_exe(exe: &Path) -> Option<BundledForgeCliPaths> {
    let exe_dir = exe.parent()?;
    let contents_dir = exe_dir.parent()?;
    let resources_dir = contents_dir.join("Resources");

    let gh_name = if cfg!(windows) { "gh.exe" } else { "gh" };
    let glab_name = if cfg!(windows) { "glab.exe" } else { "glab" };

    let gh = resources_dir.join(format!("vendor/gh/{gh_name}"));
    let glab = resources_dir.join(format!("vendor/glab/{glab_name}"));

    Some(BundledForgeCliPaths {
        gh: gh.is_file().then_some(gh),
        glab: glab.is_file().then_some(glab),
    })
}

/// Set HELMOR_*_BIN_PATH env vars so `run_command` and the AppleScript
/// terminal helper can find the bundled binaries. Called once at startup.
pub fn install_bundled_env() {
    let paths = resolve_bundled_paths();
    if let Some(gh) = &paths.gh {
        std::env::set_var(GH_PATH_ENV, gh);
    }
    if let Some(glab) = &paths.glab {
        std::env::set_var(GLAB_PATH_ENV, glab);
    }
    tracing::info!(
        gh = ?paths.gh,
        glab = ?paths.glab,
        "Resolved bundled forge CLI paths"
    );
}

/// Returns the absolute bundled path for a forge CLI program name, if one
/// is available. Reads from env vars so dev/test overrides work.
pub fn bundled_path_for(program: &str) -> Option<PathBuf> {
    let env_key = match program {
        "gh" => GH_PATH_ENV,
        "glab" => GLAB_PATH_ENV,
        _ => return None,
    };
    let raw = std::env::var(env_key).ok()?;
    let path = PathBuf::from(raw);
    path.is_file().then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_finds_binaries_under_resources_vendor() {
        let root = tempfile::tempdir().unwrap();
        let exe = root.path().join("Helmor.app/Contents/MacOS/Helmor");
        let vendor = root.path().join("Helmor.app/Contents/Resources/vendor");
        std::fs::create_dir_all(vendor.join("gh")).unwrap();
        std::fs::create_dir_all(vendor.join("glab")).unwrap();
        std::fs::write(vendor.join("gh/gh"), "").unwrap();
        std::fs::write(vendor.join("glab/glab"), "").unwrap();

        let paths = resolve_bundled_paths_for_exe(&exe).unwrap();

        assert_eq!(
            paths.gh.unwrap(),
            root.path()
                .join("Helmor.app/Contents/Resources/vendor/gh/gh")
        );
        assert_eq!(
            paths.glab.unwrap(),
            root.path()
                .join("Helmor.app/Contents/Resources/vendor/glab/glab")
        );
    }

    #[test]
    fn resolve_returns_none_when_binaries_missing() {
        let root = tempfile::tempdir().unwrap();
        let exe = root.path().join("Helmor.app/Contents/MacOS/Helmor");
        let paths = resolve_bundled_paths_for_exe(&exe).unwrap();
        assert!(paths.gh.is_none());
        assert!(paths.glab.is_none());
    }
}
