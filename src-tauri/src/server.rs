use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub struct ProjectServer {
    pub port: u16,
}

impl ProjectServer {
    pub fn start(
        app: AppHandle,
        project_path: &str,
        entry_point: Option<&str>,
        shutdown: Arc<AtomicBool>,
        job_id: String,
        _total_frames: u32,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let path = project_path.to_string();
        let entry = entry_point.unwrap_or("index.html").to_string();

        let server = tiny_http::Server::http("127.0.0.1:0")?;
        let port = server.server_addr().to_ip().unwrap().port();

        let shutdown_clone = shutdown.clone();
        thread::spawn(move || {
            loop {
                if shutdown_clone.load(Ordering::Relaxed) {
                    break;
                }
                match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(request)) => {
                        let url = request.url().to_string();
                        let method = request.method().as_str().to_string();

                        if method == "POST" && url == "/_tauri/send_frame" {
                            handle_send_frame(&app, request);
                        } else if method == "POST" && url == "/_tauri/finalize_render" {
                            handle_finalize_render(&app, request, &job_id);
                        } else {
                            serve_file(request, &path, &entry);
                        }
                    }
                    Ok(None) => {}
                    Err(_) => break,
                }
            }
        });

        Ok(ProjectServer { port })
    }
}

fn serve_file(request: tiny_http::Request, path: &str, entry: &str) {
    let url = request.url().to_string();
    let file_path = if url == "/" {
        format!("{}/{}", path, entry)
    } else {
        let decoded = url_decode(&url);
        format!("{}{}", path, decoded)
    };

    match std::fs::read(&file_path) {
        Ok(content) => {
            let mime = mime_type(&file_path);
            let response = tiny_http::Response::from_data(content)
                .with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap(),
                )
                .with_header(
                    tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..])
                        .unwrap(),
                );
            let _ = request.respond(response);
        }
        Err(_) => {
            let response = tiny_http::Response::from_string("404 Not Found")
                .with_status_code(404);
            let _ = request.respond(response);
        }
    }
}

fn handle_send_frame(app: &AppHandle, mut request: tiny_http::Request) {
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);

    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&body);
    let params = match parsed {
        Ok(v) => v,
        Err(_) => {
            let _ = request.respond(
                tiny_http::Response::from_string("{\"error\":\"invalid json\"}")
                    .with_status_code(400)
                    .with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                            .unwrap(),
                    ),
            );
            return;
        }
    };

    let job_id = params["jobId"].as_str().unwrap_or("");
    let data = params["data"].as_str().unwrap_or("");
    let frame = params["frame"].as_u64().unwrap_or(0) as u32;
    let total = params["total"].as_u64().unwrap_or(0) as u32;

    let result = (|| -> Result<String, String> {
        let state = app
            .try_state::<Mutex<AppState>>()
            .ok_or("App state not available")?;
        let mut s = state.lock().map_err(|e| e.to_string())?;

        let job_idx = s
            .jobs
            .iter()
            .position(|j| j.info.id == job_id)
            .ok_or("Job no encontrado")?;

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
                data,
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
            let _ = app.emit(
                "render-progress",
                serde_json::json!({
                    "jobId": job_id,
                    "frame": frame,
                    "total": total,
                    "progress": pct,
                }),
            );
        }

        Ok("OK".into())
    })();

    let (status, resp_body) = match result {
        Ok(msg) => (200, serde_json::json!({"status": msg})),
        Err(e) => (400, serde_json::json!({"error": e})),
    };

    let response = tiny_http::Response::from_string(resp_body.to_string())
        .with_status_code(status)
        .with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        );
    let _ = request.respond(response);
}

fn handle_finalize_render(app: &AppHandle, request: tiny_http::Request, job_id: &str) {
    let job_id = job_id.to_string();

    let result = (|| -> Result<String, String> {
        let state = app
            .try_state::<Mutex<AppState>>()
            .ok_or("App state not available")?;
        let mut s = state.lock().map_err(|e| e.to_string())?;

        let job_idx = s
            .jobs
            .iter()
            .position(|j| j.info.id == job_id)
            .ok_or("Job no encontrado")?;

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
    })();

    let (status, resp_body) = match result {
        Ok(msg) => (200, serde_json::json!({"status": msg})),
        Err(e) => (400, serde_json::json!({"error": e})),
    };

    let response = tiny_http::Response::from_string(resp_body.to_string())
        .with_status_code(status)
        .with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        );
    let _ = request.respond(response);
}

fn url_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().and_then(|c| (c as char).to_digit(16));
            let lo = chars.next().and_then(|c| (c as char).to_digit(16));
            match (hi, lo) {
                (Some(h), Some(l)) => result.push((h * 16 + l) as u8 as char),
                _ => result.push('%'),
            }
        } else if b == b'+' {
            result.push(' ');
        } else {
            result.push(b as char);
        }
    }
    result
}

fn mime_type(path: &str) -> String {
    if path.ends_with(".html") {
        "text/html; charset=utf-8".into()
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8".into()
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8".into()
    } else if path.ends_with(".png") {
        "image/png".into()
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg".into()
    } else if path.ends_with(".svg") {
        "image/svg+xml".into()
    } else if path.ends_with(".json") {
        "application/json".into()
    } else if path.ends_with(".wasm") {
        "application/wasm".into()
    } else {
        "application/octet-stream".into()
    }
}
