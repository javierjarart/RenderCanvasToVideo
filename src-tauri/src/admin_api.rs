use crate::state::{AppState, RenderParams};
use std::io::Read;
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

pub const ADMIN_API_PORT: u16 = 1421;

pub fn start(app: AppHandle) {
    let server = match tiny_http::Server::http(format!("127.0.0.1:{}", ADMIN_API_PORT)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[admin_api] Error starting admin API server: {}", e);
            return;
        }
    };

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            thread::spawn(move || {
                handle(app, request);
            });
        }
    });
}

fn handle(app: AppHandle, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let method = req.method().as_str().to_string();

    let result = route(&app, &method, &url, &mut req);

    let (status, body) = match result {
        Ok(json) => (200, json),
        Err(msg) => (400, serde_json::json!({"error": msg}).to_string()),
    };

    let response = tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                .unwrap(),
        )
        .with_header(
            tiny_http::Header::from_bytes(
                &b"Access-Control-Allow-Origin"[..],
                &b"*"[..],
            )
            .unwrap(),
        );

    let _ = req.respond(response);
}

fn with_state<F, T>(app: &AppHandle, f: F) -> Result<T, String>
where
    F: FnOnce(&mut AppState) -> Result<T, String>,
{
    let state = app
        .try_state::<Mutex<AppState>>()
        .ok_or("App state not available")?;
    let mut s = state.lock().map_err(|e| e.to_string())?;
    f(&mut s)
}

fn route(
    app: &AppHandle,
    method: &str,
    url: &str,
    req: &mut tiny_http::Request,
) -> Result<String, String> {
    match (method, url) {
        ("POST", "/api/render") => handle_render(app, req),
        ("GET", "/api/status") => handle_status(app),
        ("GET", "/api/logs") => handle_logs(app, req),
        ("POST", "/api/clear") => handle_clear(app),
        _ if method == "POST" && url.starts_with("/api/cancel/") => {
            let job_id = url.trim_start_matches("/api/cancel/");
            handle_cancel(app, job_id)
        }
        _ if method == "DELETE" && url.starts_with("/api/job/") => {
            let job_id = url.trim_start_matches("/api/job/");
            handle_remove_job(app, job_id)
        }
        _ => Err(format!("Not found: {} {}", method, url)),
    }
}

fn handle_render(app: &AppHandle, req: &mut tiny_http::Request) -> Result<String, String> {
    let mut body = String::new();
    req.as_reader()
        .read_to_string(&mut body)
        .map_err(|e| e.to_string())?;

    let params: RenderParams = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    let job_id = with_state(app, |s| {
        let id = s.add_job(params);
        s.add_log(
            "log",
            format!("📥 Render añadido a la cola [{}] (desde MCP)", &id[..8]),
        );
        Ok(id)
    })?;

    let _ = app.emit("render-started", serde_json::json!({"jobId": job_id}));

    Ok(serde_json::json!({"jobId": job_id}).to_string())
}

fn handle_status(app: &AppHandle) -> Result<String, String> {
    with_state(app, |s| {
        Ok(serde_json::to_string(&s.get_jobs_info()).map_err(|e| e.to_string())?)
    })
}

fn handle_logs(app: &AppHandle, req: &tiny_http::Request) -> Result<String, String> {
    let since: usize = req
        .url()
        .split('?')
        .nth(1)
        .unwrap_or("")
        .split('&')
        .find_map(|p| {
            let mut kv = p.splitn(2, '=');
            match (kv.next(), kv.next()) {
                (Some("since"), Some(v)) => v.parse().ok(),
                _ => None,
            }
        })
        .unwrap_or(0);

    with_state(app, |s| {
        let logs: Vec<serde_json::Value> = s
            .log_buffer
            .iter()
            .skip(since)
            .map(|e| {
                serde_json::json!({
                    "timestamp": e.timestamp,
                    "level": e.level,
                    "message": e.message,
                })
            })
            .collect();
        Ok(serde_json::json!({"logs": logs, "total": s.log_buffer.len()}).to_string())
    })
}

fn handle_cancel(app: &AppHandle, job_id: &str) -> Result<String, String> {
    use std::sync::atomic::Ordering;

    with_state(app, |s| {
        let idx = s
            .jobs
            .iter()
            .position(|j| j.info.id == job_id)
            .ok_or("Job not found")?;

        let name: String;

        {
            let job = s.jobs.get_mut(idx).ok_or("Job not found")?;
            if job.info.status != "rendering" {
                return Err("Job is not rendering".to_string());
            }
            name = job.info.project_name.clone();
            job.cancel_flag.store(true, Ordering::SeqCst);
            job.info.status = "cancelled".into();
            if let Some(ref shutdown) = job.server_shutdown {
                shutdown.store(true, Ordering::SeqCst);
            }
            if let Some(ref ffmpeg) = job.ffmpeg_process {
                let mut ff = ffmpeg.lock().map_err(|e| e.to_string())?;
                let _ = ff.kill();
            }
        }

        s.add_log("log", format!("[{}] Render cancelado (desde MCP)", name));

        if let Some(job) = s.jobs.get(idx) {
            let _ = app.emit("render-done", job.info.clone());
        }

        Ok(serde_json::json!({"message": "Render cancelled"}).to_string())
    })
}

fn handle_clear(app: &AppHandle) -> Result<String, String> {
    with_state(app, |s| {
        s.remove_completed();
        s.add_log("log", "Completed jobs cleared (desde MCP)".into());
        Ok(serde_json::json!({"message": "Completed cleared"}).to_string())
    })
}

fn handle_remove_job(app: &AppHandle, job_id: &str) -> Result<String, String> {
    with_state(app, |s| {
        let len_before = s.jobs.len();
        s.jobs.retain(|j| j.info.id != job_id);
        if s.jobs.len() < len_before {
            Ok(serde_json::json!({"message": format!("Job {} removed", &job_id[..8])}).to_string())
        } else {
            Err("Job not found".to_string())
        }
    })
}
