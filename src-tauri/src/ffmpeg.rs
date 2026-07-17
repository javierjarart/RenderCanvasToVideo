use anyhow::Result;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

pub struct FfmpegProcess {
    process: std::process::Child,
    stderr_output: Option<Vec<u8>>,
}

fn find_ffmpeg() -> Option<PathBuf> {
    // 1. Check next to the executable (bundled with app)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
            let bundled = parent.join(name);
            if bundled.is_file() {
                return Some(bundled);
            }
            // macOS .app bundle: Resources/ffmpeg
            if cfg!(target_os = "macos") {
                let mac = parent.join("../Resources/ffmpeg");
                if mac.is_file() {
                    return Some(mac);
                }
            }
        }
    }

    // 2. FFMPEG_PATH env var
    if let Ok(candidates) = std::env::var("FFMPEG_PATH") {
        let p = PathBuf::from(&candidates);
        if p.is_file() {
            return Some(p);
        }
    }

    // 3. Common system paths
    let common = if cfg!(target_os = "windows") {
        vec![
            "ffmpeg.exe",
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
        ]
    } else {
        vec![
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

    // 4. Try `which` / `where` as last resort
    let which = if cfg!(target_os = "windows") { "where" } else { "which" };
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
                "linux" => "sudo apt install ffmpeg  # o el gestor de paquetes de tu distro",
                "macos" => "brew install ffmpeg",
                "windows" => "descarga ffmpeg desde https://ffmpeg.org/download.html y añádelo al PATH",
                _ => "instala ffmpeg desde https://ffmpeg.org/download.html",
            };
            format!(
                "FFmpeg no encontrado.\nInstálalo:\n  {}\n\nO define la variable FFMPEG_PATH apuntando al binario.",
                install
            )
        })?;

        let mut cmd = Command::new(&ffmpeg);
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
            .map(|process| FfmpegProcess { process, stderr_output: None })
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
