use anyhow::Result;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

// ── Embedded FFmpeg binary ──────────────────

#[cfg(all(ffmpeg_bundled, target_os = "windows"))]
const FFMPEG_EMBEDDED: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/binaries/ffmpeg.exe"));

#[cfg(all(ffmpeg_bundled, not(target_os = "windows")))]
const FFMPEG_EMBEDDED: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/binaries/ffmpeg"));

fn ffmpeg_bin_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

fn extract_ffmpeg() -> Option<PathBuf> {
    #[cfg(not(ffmpeg_bundled))]
    return None;

    #[cfg(ffmpeg_bundled)]
    {
        let dest_dir = std::env::temp_dir().join("RenderCanvasToVideo");
        let dest_path = dest_dir.join(ffmpeg_bin_name());

        if dest_path.is_file()
            && dest_path.metadata().map(|m| m.len()).unwrap_or(0) == FFMPEG_EMBEDDED.len() as u64
        {
            return Some(dest_path);
        }

        let _ = std::fs::create_dir_all(&dest_dir);
        let mut f = std::fs::File::create(&dest_path).ok()?;
        f.write_all(FFMPEG_EMBEDDED).ok()?;
        drop(f);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&dest_path, std::fs::Permissions::from_mode(0o755));
        }

        Some(dest_path)
    }
}

fn find_system_ffmpeg() -> Option<PathBuf> {
    // 1. Next to the executable (bundled side-by-side, legacy)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let bundled = parent.join(ffmpeg_bin_name());
            if bundled.is_file() {
                return Some(bundled);
            }
            if cfg!(target_os = "macos") {
                let mac = parent.join("../Resources/ffmpeg");
                if mac.is_file() {
                    return Some(mac);
                }
            }
        }
    }

    // 2. FFMPEG_PATH env var
    if let Ok(path) = std::env::var("FFMPEG_PATH") {
        let p = PathBuf::from(&path);
        if p.is_file() {
            return Some(p);
        }
    }

    // 3. Common system paths
    let common: &[&str] = if cfg!(target_os = "windows") {
        &[
            "ffmpeg.exe",
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
        ]
    } else {
        &[
            "ffmpeg",
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/opt/homebrew/bin/ffmpeg",
        ]
    };

    for p in common {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some(path);
        }
    }

    // 4. which / where
    let which = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    if let Ok(out) = Command::new(which).arg("ffmpeg").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let path = PathBuf::from(p);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    None
}

fn find_ffmpeg() -> Option<PathBuf> {
    static CACHED: OnceLock<Option<PathBuf>> = OnceLock::new();
    CACHED
        .get_or_init(|| extract_ffmpeg().or_else(find_system_ffmpeg))
        .clone()
}

// ── FFmpeg process wrapper ──────────────────

pub struct FfmpegProcess {
    process: std::process::Child,
    stderr_output: Option<Vec<u8>>,
}

impl FfmpegProcess {
    pub fn spawn(
        width: u32,
        height: u32,
        fps: u32,
        output_path: &str,
        codec: &str,
        pix_fmt: &str,
        extra_args: &[String],
        hwaccel: Option<&str>,
    ) -> std::result::Result<Self, String> {
        let ffmpeg = find_ffmpeg().ok_or_else(|| {
            let os = std::env::consts::OS;
            let install = match os {
                "linux" => "sudo apt install ffmpeg",
                "macos" => "brew install ffmpeg",
                "windows" => "descarga ffmpeg desde https://ffmpeg.org/download.html y añádelo al PATH",
                _ => "instala ffmpeg desde https://ffmpeg.org/download.html",
            };
            format!(
                "FFmpeg no encontrado.\nInstálalo:\n  {}\n\nO define FFMPEG_PATH apuntando al binario.",
                install
            )
        })?;

        let mut cmd = Command::new(&ffmpeg);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.arg("-y");
        if let Some(hw) = hwaccel {
            if !hw.is_empty() {
                cmd.args(["-hwaccel", hw]);
            }
        }
        cmd.args([
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-r",
            &fps.to_string(),
            "-s",
            &format!("{}x{}", width, height),
            "-i",
            "-",
            "-vcodec",
            codec,
            "-pix_fmt",
            pix_fmt,
        ]);
        for arg in extra_args {
            cmd.arg(arg);
        }
        cmd.arg(output_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        cmd.spawn()
            .map_err(|e| format!("Error al ejecutar FFmpeg ({}): {}", ffmpeg.display(), e))
            .map(|process| FfmpegProcess {
                process,
                stderr_output: None,
            })
    }

    pub fn write_frame(&mut self, data: &[u8]) -> Result<()> {
        if let Some(ref mut stdin) = self.process.stdin {
            stdin.write_all(data)?;
        }
        Ok(())
    }

    pub fn wait(&mut self) -> Result<std::process::ExitStatus> {
        let status = self.process.wait()?;
        self.collect_stderr();
        Ok(status)
    }

    pub fn kill(&mut self) -> Result<()> {
        let _ = self.process.kill();
        let _ = self.process.wait();
        self.collect_stderr();
        Ok(())
    }

    pub fn close_stdin(&mut self) -> Result<()> {
        if let Some(mut stdin) = self.process.stdin.take() {
            stdin.flush()?;
            drop(stdin);
        }
        Ok(())
    }

    pub fn stderr_string(&self) -> Option<String> {
        self.stderr_output
            .as_ref()
            .and_then(|b| String::from_utf8(b.clone()).ok())
    }

    fn collect_stderr(&mut self) {
        if let Some(mut stderr) = self.process.stderr.take() {
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf);
            if !buf.is_empty() {
                self.stderr_output = Some(buf);
            }
        }
    }
}
