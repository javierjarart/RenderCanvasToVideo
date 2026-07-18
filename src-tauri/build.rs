fn main() {
    println!("cargo::rustc-check-cfg=cfg(ffmpeg_bundled)");
    tauri_build::build();

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let binaries = std::path::Path::new(&manifest_dir).join("binaries");

    let ffmpeg_bin = if binaries.join("ffmpeg.exe").exists() {
        "ffmpeg.exe"
    } else if binaries.join("ffmpeg").exists() {
        "ffmpeg"
    } else {
        ""
    };

    if !ffmpeg_bin.is_empty() {
        println!("cargo:rustc-cfg=ffmpeg_bundled");
        println!("cargo:rustc-env=FFMPEG_BIN_NAME={}", ffmpeg_bin);
        println!("cargo:rerun-if-changed={}", binaries.join(ffmpeg_bin).display());
    }
}
