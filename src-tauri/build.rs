fn main() {
    println!("cargo::rustc-check-cfg=cfg(ffmpeg_bundled)");
    tauri_build::build();

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let binaries = std::path::Path::new(&manifest_dir).join("binaries");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let ffmpeg_name = if target_os == "windows" { "ffmpeg.exe" } else { "ffmpeg" };
    let ffmpeg_path = binaries.join(ffmpeg_name);

    if ffmpeg_path.exists() {
        println!("cargo:rustc-cfg=ffmpeg_bundled");
        println!("cargo:rerun-if-changed={}", ffmpeg_path.display());
    }
}
