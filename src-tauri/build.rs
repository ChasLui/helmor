use std::env;
use std::path::{Path, PathBuf};

const GITHUB_CLIENT_ID_KEY: &str = "HELMOR_GITHUB_CLIENT_ID";
const UPDATER_ENDPOINTS_KEY: &str = "HELMOR_UPDATER_ENDPOINTS";
const UPDATER_PUBKEY_KEY: &str = "HELMOR_UPDATER_PUBKEY";

fn main() {
    // Windows target: embed Common-Controls v6 manifest for EVERY link
    // invocation (bins + lib test + [[test]] + examples + benches).
    // `rustc-link-arg-tests` only covers integration tests under
    // `tests/*.rs`, not the lib-under-test binary (`helmor_lib-HASH.exe`)
    // that nextest lists first; that one aborts with
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) because the v5 comctl32
    // stub lacks the v6 entry points that tauri 2 imports.
    //
    // Using bare `rustc-link-arg` would normally duplicate tauri-winres's
    // bin manifest (CVT1100 / LNK1123). We side-step that by telling
    // `tauri_build::try_build` to skip its default manifest; the content
    // we embed is byte-identical to tauri-build's default (both just
    // declare the Common-Controls v6 dependency), so production bins end
    // up with the same manifest they had before — only now tests get it
    // too.
    //
    // See windows-app-manifest.xml for the upstream issue links. Keyed on
    // CARGO_CFG_TARGET_OS so cross-compiles from non-Windows hosts to
    // Windows still hit this branch, and Windows-hosted builds targeting
    // non-Windows take the default path.
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        let manifest_dir =
            env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR should be set");
        let manifest_path = Path::new(&manifest_dir).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest_path.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            manifest_path.display()
        );

        tauri_build::try_build(
            tauri_build::Attributes::new()
                .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
        )
        .expect("failed to run tauri-build");
    } else {
        tauri_build::build();
    }

    println!("cargo:rerun-if-changed=build.rs");

    for env_path in candidate_env_paths() {
        // Only watch files that exist. Watching a missing file makes Cargo
        // treat the fingerprint as permanently stale, which forces a full
        // recompile of the crate on every single `cargo build` invocation.
        if env_path.exists() {
            println!("cargo:rerun-if-changed={}", env_path.display());
        }
        load_env_var(&env_path, GITHUB_CLIENT_ID_KEY);
        load_env_var(&env_path, UPDATER_ENDPOINTS_KEY);
        load_env_var(&env_path, UPDATER_PUBKEY_KEY);
    }
}

fn candidate_env_paths() -> Vec<PathBuf> {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR should be set"));
    let mut paths = vec![manifest_dir.join(".env.local")];

    if let Some(repo_root) = manifest_dir.parent() {
        paths.push(repo_root.join(".env.local"));
        // Lowest-priority fallback: committed `.env.example` provides defaults
        // for public values (e.g. GitHub Device Flow client ID) so a fresh
        // `cargo build` works without any manual `cp .env.example .env.local`.
        paths.push(repo_root.join(".env.example"));
    }

    paths
}

fn load_env_var(path: &Path, key: &str) {
    if env::var_os(key).is_some() || !path.exists() {
        return;
    }

    let Ok(iter) = dotenvy::from_path_iter(path) else {
        return;
    };

    for item in iter.flatten() {
        if item.0 == key {
            println!("cargo:rustc-env={}={}", item.0, item.1);
            break;
        }
    }
}
