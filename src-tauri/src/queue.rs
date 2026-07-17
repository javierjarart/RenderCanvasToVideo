use crate::capture::create_capture_webview;
use crate::server::ProjectServer;
use crate::state::AppState;
use crate::FfmpegProcess;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::Manager;

pub struct QueueProcessor;

impl QueueProcessor {
    pub fn start(app_handle: tauri::AppHandle) {
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                let app = app_handle.clone();
                let state: Option<tauri::State<'_, Mutex<AppState>>> =
                    app.try_state::<Mutex<AppState>>();
                let state = match state {
                    Some(s) => s,
                    None => continue,
                };

                let job_index = { state.lock().ok().and_then(|mut s| s.next_queued_job()) };

                if let Some(idx) = job_index {
                    let result = Self::process_job(&app, &state, idx).await;
                    if let Err(e) = result {
                        if let Ok(mut s) = state.lock() {
                            if let Some(job) = s.jobs.get_mut(idx) {
                                job.info.status = "error".into();
                                job.info.error = Some(e.clone());
                                s.add_log("error", format!("Job error: {}", e));
                            }
                        }
                    }
                }
            }
        });
    }

    async fn process_job(
        app: &tauri::AppHandle,
        state: &tauri::State<'_, Mutex<AppState>>,
        job_index: usize,
    ) -> Result<(), String> {
        let (params, project_name, output_filename, job_id) = {
            let s = state.lock().map_err(|e| e.to_string())?;
            let job = s.jobs.get(job_index).ok_or("Job not found")?;
            (
                job.info.params.clone(),
                job.info.project_name.clone(),
                job.info.output_filename.clone(),
                job.info.id.clone(),
            )
        };

        let project_path = params
            .custom_project_path
            .as_deref()
            .filter(|p| !p.is_empty())
            .or_else(|| params.project.as_deref())
            .ok_or_else(|| "Se requiere custom_project_path".to_string())?
            .to_string();

        let width = params.width;
        let height = params.height;
        let fps = params.fps;
        let duration = params.duration;
        let total_frames = fps * duration;
        let codec = params.codec.clone().unwrap_or_else(|| "libx264".into());
        let pix_fmt = params.pix_fmt.clone().unwrap_or_else(|| "yuv420p".into());
        let bg_color = params.bg_color.clone().unwrap_or_else(|| "#000000".into());
        let canvas_selector = params.canvas_selector.clone().unwrap_or_default();
        let filters = params.filters.clone().unwrap_or_default();
        let hwaccel = params.hwaccel.clone();
        let entry_point = params.project_entry.clone();

        let renders_dir = std::env::current_dir()
            .map(|p| p.join("renders").to_string_lossy().to_string())
            .unwrap_or_else(|_| "renders".into());

        std::fs::create_dir_all(&renders_dir).map_err(|e| e.to_string())?;

        let output_path = format!("{}/{}", renders_dir, output_filename);

        let extra_args = {
            let s = state.lock().map_err(|e| e.to_string())?;
            s.build_extra_args(&params)
        };

        {
            let mut s = state.lock().map_err(|e| e.to_string())?;
            s.add_log("log", format!("═══ Procesando job [{}]: {}", &job_id[..8], project_name));
            s.add_log("log", format!("Resolución: {}x{}, FPS: {}, Duración: {}s, Total: {} cuadros", width, height, fps, duration, total_frames));
            s.add_log("log", format!("Codec: {} | PixFmt: {}", codec, pix_fmt));
            if !filters.is_empty() {
                s.add_log("log", format!("Filtros: {}", filters));
            }
            if let Some(ref ep) = entry_point {
                s.add_log("log", format!("Entry: {}", ep));
            }
            if let Some(ref hw) = hwaccel {
                if !hw.is_empty() {
                    s.add_log("log", format!("HW Accel: {}", hw));
                }
            }
            s.add_log("log", format!("Salida: {}", output_path));
            if let Some(job) = s.jobs.get_mut(job_index) {
                job.info.status = "rendering".into();
                job.info.progress = 0;
                job.info.total = total_frames;
            }
        }

        let server_shutdown = Arc::new(AtomicBool::new(false));
        let project_port = match ProjectServer::start(&project_path, entry_point.as_deref(), server_shutdown.clone()) {
            Ok(server) => {
                let mut s = state.lock().map_err(|e| e.to_string())?;
                s.add_log("log", format!("Servidor de proyecto iniciado en puerto {}", server.port));
                if let Some(job) = s.jobs.get_mut(job_index) {
                    job.project_server_port = Some(server.port);
                    job.server_shutdown = Some(server_shutdown);
                }
                server.port
            }
            Err(e) => {
                let mut s = state.lock().map_err(|e| e.to_string())?;
                s.add_log("error", format!("Error al iniciar servidor: {}", e));
                if let Some(job) = s.jobs.get_mut(job_index) {
                    job.info.status = "error".into();
                    job.info.error = Some(e.to_string());
                }
                return Err(e.to_string());
            }
        };

        match FfmpegProcess::spawn(width, height, fps, &output_path, &codec, &pix_fmt, &extra_args, hwaccel.as_deref())
        {
            Ok(ff) => {
                let mut s = state.lock().map_err(|e| e.to_string())?;
                if let Some(job) = s.jobs.get_mut(job_index) {
                    job.ffmpeg_process = Some(Mutex::new(ff));
                    job.rendered_file_path = Some(output_path);
                }
            }
            Err(e) => {
                let mut s = state.lock().map_err(|e| e.to_string())?;
                s.add_log("error", format!("Error al iniciar FFmpeg: {}", e));
                if let Some(job) = s.jobs.get_mut(job_index) {
                    job.info.status = "error".into();
                    job.info.error = Some(e.to_string());
                }
                return Err(e.to_string());
            }
        };

        let project_url = format!("http://127.0.0.1:{}", project_port);

        let _ = create_capture_webview(
            app,
            &project_url,
            fps,
            total_frames,
            &bg_color,
            &canvas_selector,
            width,
            height,
            &job_id,
        );

        let _ = app.emit(
            "render-started",
            serde_json::json!({
                "jobId": job_id,
                "projectUrl": project_url,
                "totalFrames": total_frames,
                "fps": fps,
                "width": width,
                "height": height,
                "projectName": project_name,
            }),
        );

        Ok(())
    }
}
