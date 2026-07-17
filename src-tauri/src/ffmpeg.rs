use anyhow::{Context, Result};
use std::io::{Read, Write};
use std::process::{Command, Stdio};

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
    ) -> Result<Self> {
        let mut cmd = Command::new("ffmpeg");
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

        let process = cmd.spawn().context("Failed to spawn FFmpeg process")?;
        Ok(FfmpegProcess { process, stderr_output: None })
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
