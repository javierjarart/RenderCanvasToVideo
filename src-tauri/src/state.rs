use crate::ffmpeg::FfmpegProcess;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobInfo {
    pub id: String,
    pub status: String,
    pub progress: u32,
    pub total: u32,
    pub file_url: Option<String>,
    pub error: Option<String>,
    pub params: RenderParams,
    pub project_name: String,
    pub output_filename: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogResponse {
    pub logs: Vec<LogEntry>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderParams {
    pub project: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration: u32,
    pub bg_color: Option<String>,
    pub custom_project_path: Option<String>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub pix_fmt: Option<String>,
    pub codec_params: Option<std::collections::HashMap<String, String>>,
    pub crf: Option<u32>,
    pub color_primaries: Option<String>,
    pub color_trc: Option<String>,
    pub color_space: Option<String>,
    pub canvas_selector: Option<String>,
    pub filters: Option<String>,
    pub hwaccel: Option<String>,
}

pub struct ActiveJob {
    pub info: JobInfo,
    pub ffmpeg_process: Option<Mutex<FfmpegProcess>>,
    pub cancel_flag: Arc<AtomicBool>,
    pub server_shutdown: Option<Arc<AtomicBool>>,
    pub rendered_file_path: Option<String>,
    pub project_server_port: Option<u16>,
}

impl ActiveJob {
    pub fn new(info: JobInfo) -> Self {
        ActiveJob {
            info,
            ffmpeg_process: None,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            server_shutdown: None,
            rendered_file_path: None,
            project_server_port: None,
        }
    }
}

pub struct AppState {
    pub jobs: Vec<ActiveJob>,
    pub max_concurrent: usize,
    pub log_buffer: Vec<LogEntry>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            jobs: Vec::new(),
            max_concurrent: 1,
            log_buffer: Vec::with_capacity(2000),
        }
    }

    pub fn add_log(&mut self, level: &str, message: String) {
        self.log_buffer.push(LogEntry {
            timestamp: Local::now().format("%H:%M:%S").to_string(),
            level: level.into(),
            message,
        });
        if self.log_buffer.len() > 2000 {
            self.log_buffer.drain(0..self.log_buffer.len() - 2000);
        }
    }

    pub fn add_job(&mut self, params: RenderParams) -> String {
        let project_path = params.custom_project_path.as_deref().unwrap_or("");
        let project_name = std::path::Path::new(project_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "proyecto".into());

        let container = params.container.clone().unwrap_or_else(|| ".mp4".into());
        let output_filename = format!(
            "Render_{}_{}{}",
            project_name,
            Local::now().format("%Y%m%d_%H%M%S"),
            container
        );

        let id = uuid::Uuid::new_v4().to_string();
        let info = JobInfo {
            id: id.clone(),
            status: "queued".into(),
            progress: 0,
            total: 0,
            file_url: None,
            error: None,
            params,
            project_name,
            output_filename,
            created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };

        self.jobs.push(ActiveJob::new(info));
        id
    }

    pub fn next_queued_job(&mut self) -> Option<usize> {
        let rendering_count = self
            .jobs
            .iter()
            .filter(|j| j.info.status == "rendering")
            .count();

        if rendering_count >= self.max_concurrent {
            return None;
        }

        self.jobs
            .iter()
            .position(|j| j.info.status == "queued")
    }

    pub fn get_jobs_info(&self) -> Vec<JobInfo> {
        self.jobs.iter().map(|j| j.info.clone()).collect()
    }

    pub fn remove_completed(&mut self) {
        self.jobs.retain(|j| {
            j.info.status == "queued" || j.info.status == "rendering"
        });
    }

    pub fn build_extra_args(&self, params: &RenderParams) -> Vec<String> {
        let mut args = Vec::new();
        let crf = params.crf.unwrap_or_else(|| {
            if params.codec.as_deref() == Some("libx265") {
                28
            } else {
                18
            }
        });
        args.push("-crf".to_string());
        args.push(crf.to_string());

        if let Some(ref p) = params.codec_params {
            for (k, v) in p {
                args.push(format!("-{}", k));
                args.push(v.clone());
            }
        }
        if let Some(ref p) = params.color_primaries {
            args.push("-color_primaries".to_string());
            args.push(p.clone());
        }
        if let Some(ref t) = params.color_trc {
            args.push("-color_trc".to_string());
            args.push(t.clone());
        }
        if let Some(ref s) = params.color_space {
            args.push("-colorspace".to_string());
            args.push(s.clone());
        }
        if let Some(ref f) = params.filters {
            if !f.is_empty() {
                args.push("-vf".to_string());
                args.push(f.clone());
            }
        }
        args
    }
}
