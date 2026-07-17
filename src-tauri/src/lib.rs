mod admin_api;
mod capture;
mod ffmpeg;
mod queue;
mod server;
mod state;
mod webview2;

use capture::close_capture_webview;
pub use ffmpeg::FfmpegProcess;
use queue::QueueProcessor;
use state::{AppState, JobInfo, LogResponse, RenderParams};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::Emitter;

#[tauri::command]
fn get_status(state: tauri::State<Mutex<AppState>>) -> Result<Vec<JobInfo>, String> {
    state.lock().map(|s| s.get_jobs_info()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_logs(state: tauri::State<Mutex<AppState>>, since: usize) -> Result<LogResponse, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(LogResponse {
        logs: s.log_buffer.iter().skip(since).cloned().collect(),
        total: s.log_buffer.len(),
    })
}

#[tauri::command]
fn render_project(
    state: tauri::State<Mutex<AppState>>,
    params: RenderParams,
) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let job_id = s.add_job(params);
    s.add_log("log", format!("📥 Render añadido a la cola [{}]", &job_id[..8]));
    Ok(job_id)
}

#[tauri::command]
fn send_frame(
    app: tauri::AppHandle,
    state: tauri::State<Mutex<AppState>>,
    job_id: String,
    data: String,
    frame: u32,
    total: u32,
) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let job_idx = s.jobs.iter().position(|j| j.info.id == job_id).ok_or("Job no encontrado")?;

    {
        let job = s.jobs.get_mut(job_idx).ok_or("Job no encontrado")?;
        if job.info.status != "rendering" {
            return Err("El job no está en estado rendering.".into());
        }
        if job.cancel_flag.load(Ordering::SeqCst) {
            return Err("Render cancelado".into());
        }

        let frame_data = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &data,
        )
        .map_err(|e| format!("Error decodificando frame: {}", e))?;

        if let Some(ref ffmpeg) = job.ffmpeg_process {
            let mut ff = ffmpeg.lock().map_err(|e| e.to_string())?;
            ff.write_frame(&frame_data)
                .map_err(|e| format!("Error escribiendo frame: {}", e))?;
        }

        job.info.progress = frame;
    }

    if frame % std::cmp::max(1, total / 10) == 0 || frame == total {
        let name = s.jobs[job_idx].info.project_name.clone();
        let pct = (frame * 100) / total;
        s.add_log("log", format!("[{}] Cuadro {}/{} ({}%)", name, frame, total, pct));
        let _ = app.emit("render-progress", serde_json::json!({
            "jobId": job_id,
            "frame": frame,
            "total": total,
            "progress": pct,
        }));
    }

    Ok("OK".into())
}

#[tauri::command]
fn finalize_render(
    app: tauri::AppHandle,
    state: tauri::State<Mutex<AppState>>,
    job_id: String,
) -> Result<String, String> {
    close_capture_webview(&app);

    let mut s = state.lock().map_err(|e| e.to_string())?;
    let job_idx = s.jobs.iter().position(|j| j.info.id == job_id).ok_or("Job no encontrado")?;

    let name: String;
    let cancelled: bool;

    {
        let job = s.jobs.get_mut(job_idx).ok_or("Job no encontrado")?;
        if job.info.status != "rendering" {
            return Err("El job no está en estado rendering.".into());
        }
        name = job.info.project_name.clone();
        cancelled = job.cancel_flag.load(Ordering::SeqCst);

        if let Some(ref shutdown) = job.server_shutdown {
            shutdown.store(true, Ordering::SeqCst);
        }

        if cancelled {
            job.info.status = "cancelled".into();
            if let Some(ref ffmpeg) = job.ffmpeg_process {
                let mut ff = ffmpeg.lock().map_err(|e| e.to_string())?;
                let _ = ff.kill();
            }
            let _ = app.emit("render-done", job.info.clone());
            s.add_log("log", format!("[{}] Render cancelado.", name));
            return Ok("Render cancelado".into());
        }

        if let Some(ref ffmpeg) = job.ffmpeg_process {
            let mut ff = ffmpeg.lock().map_err(|e| e.to_string())?;
            ff.close_stdin()
                .map_err(|e| format!("Error cerrando FFmpeg: {}", e))?;
            ff.wait()
                .map_err(|e| format!("Error esperando FFmpeg: {}", e))?;
        }

        job.info.status = "done".into();
        job.info.file_url = job.rendered_file_path.clone();
        job.info.progress = job.info.total;
    }

    s.add_log("log", format!("[{}] Render completado exitosamente.", name));

    if let Some(job) = s.jobs.get(job_idx) {
        let _ = app.emit("render-done", job.info.clone());
    }

    Ok("Render completado".into())
}

#[tauri::command]
fn cancel_render(
    app: tauri::AppHandle,
    state: tauri::State<Mutex<AppState>>,
    job_id: String,
) -> Result<String, String> {
    close_capture_webview(&app);

    let mut s = state.lock().map_err(|e| e.to_string())?;
    let job_idx = s.jobs.iter().position(|j| j.info.id == job_id).ok_or("Job no encontrado")?;

    let name: String;
    {
        let job = s.jobs.get_mut(job_idx).ok_or("Job no encontrado")?;
        if job.info.status != "rendering" {
            return Err("El job no está en proceso.".into());
        }
        name = job.info.project_name.clone();
        if let Some(ref shutdown) = job.server_shutdown {
            shutdown.store(true, Ordering::SeqCst);
        }
        job.cancel_flag.store(true, Ordering::SeqCst);
        job.info.status = "cancelled".into();
        if let Some(ref ffmpeg) = job.ffmpeg_process {
            let mut ff = ffmpeg.lock().map_err(|e| e.to_string())?;
            let _ = ff.kill();
        }
    }

    s.add_log("log", format!("[{}] Render cancelado por el usuario.", name));
    if let Some(job) = s.jobs.get(job_idx) {
        let _ = app.emit("render-done", job.info.clone());
    }

    Ok("Render cancelado".into())
}

#[tauri::command]
fn remove_job(state: tauri::State<Mutex<AppState>>, job_id: String) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    let len_before = s.jobs.len();
    s.jobs.retain(|j| j.info.id != job_id);
    if s.jobs.len() < len_before {
        Ok(format!("Job {} eliminado", &job_id[..8]))
    } else {
        Err("Job no encontrado".into())
    }
}

#[tauri::command]
fn clear_completed(state: tauri::State<Mutex<AppState>>) -> Result<String, String> {
    state.lock().map_err(|e| e.to_string())?.remove_completed();
    Ok("Completados eliminados".into())
}

#[tauri::command]
fn get_project_url(state: tauri::State<Mutex<AppState>>, job_id: String) -> Result<Option<String>, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.jobs.iter().find(|j| j.info.id == job_id).and_then(|j| {
        j.project_server_port
            .map(|port| format!("http://127.0.0.1:{}", port))
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = webview2::ensure_installed() {
        #[cfg(target_os = "windows")]
        {
            let msg = format!("Error al instalar WebView2 Runtime:\n\n{}\n\nDescárgalo manualmente desde:\nhttps://developer.microsoft.com/en-us/microsoft-edge/webview2/", e);
            let _ = std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &format!("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('{}', 'RenderCanvasToVideo - Error', 'OK', 'Error')", msg.replace('\'', "''"))])
                .output();
        }
        #[cfg(not(target_os = "windows"))]
        let _ = e;
        std::process::exit(1);
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_logs,
            render_project,
            send_frame,
            finalize_render,
            cancel_render,
            remove_job,
            clear_completed,
            get_project_url,
        ])
        .build(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");

    let handle = app.handle().clone();

    if std::env::args().any(|a| a == "--mcp") {
        admin_api::start_mcp(handle);
    } else {
        QueueProcessor::start(handle.clone());
        admin_api::start_http(handle.clone());
    }

    app.run(|_app_handle, _event| {});
}
