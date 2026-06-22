use serde::{Deserialize, Serialize};

// ─── Tipos compartidos ─────────────────────────────────────────────────────

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderStatus {
    pub state: String,
    pub progress: u32,
    pub total: u32,
    pub file_url: Option<String>,
    pub error: Option<String>,
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

// ─── Estado global del render ──────────────────────────────────────────────

use std::sync::Mutex;

struct AppState {
    render_status: RenderStatus,
    log_buffer: Vec<LogEntry>,
}

// ─── Comandos Tauri ────────────────────────────────────────────────────────

#[tauri::command]
fn get_status(state: tauri::State<Mutex<AppState>>) -> RenderStatus {
    state.lock().unwrap().render_status.clone()
}

#[tauri::command]
fn get_logs(state: tauri::State<Mutex<AppState>>, since: usize) -> LogResponse {
    let buf = &state.lock().unwrap().log_buffer;
    LogResponse {
        logs: buf.iter().skip(since).cloned().collect(),
        total: buf.len(),
    }
}

#[tauri::command]
fn render_project(
    _app: tauri::AppHandle,
    state: tauri::State<Mutex<AppState>>,
    _params: RenderParams,
) -> Result<String, String> {
    let mut s = state.lock().unwrap();
    if s.render_status.state == "rendering" {
        return Err("Ya hay un render en proceso.".into());
    }

    s.render_status = RenderStatus {
        state: "rendering".into(),
        progress: 0,
        total: 0,
        file_url: None,
        error: None,
    };

    // TODO (Fase 2): Implementar pipeline real de captura + encoding
    s.log_buffer.push(LogEntry {
        timestamp: chrono_now(),
        level: "log".into(),
        message: "Render iniciado (placeholder - Fase 2)".into(),
    });

    Ok("Render iniciado (placeholder)".into())
}

#[tauri::command]
fn cancel_render(state: tauri::State<Mutex<AppState>>) -> Result<String, String> {
    let mut s = state.lock().unwrap();
    if s.render_status.state != "rendering" {
        return Err("No hay un render en proceso.".into());
    }
    s.render_status.state = "cancelled".into();
    s.log_buffer.push(LogEntry {
        timestamp: chrono_now(),
        level: "log".into(),
        message: "Render cancelado por el usuario.".into(),
    });
    Ok("Render cancelado".into())
}

#[tauri::command]
fn reset_render_status(state: tauri::State<Mutex<AppState>>) -> String {
    let mut s = state.lock().unwrap();
    s.render_status = RenderStatus {
        state: "idle".into(),
        progress: 0,
        total: 0,
        file_url: None,
        error: None,
    };
    "Estado reseteado".into()
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let h = (secs / 3600) % 24;
    let m = (secs / 60) % 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

// ─── Entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Mutex::new(AppState {
        render_status: RenderStatus {
            state: "idle".into(),
            progress: 0,
            total: 0,
            file_url: None,
            error: None,
        },
        log_buffer: Vec::with_capacity(2000),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_logs,
            render_project,
            cancel_render,
            reset_render_status,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
