use crate::state::{AppState, RenderParams};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

pub const ADMIN_API_PORT: u16 = 1421;

// ──────────────────────────────────────────────
// HTTP Admin API (tiny_http)
// ──────────────────────────────────────────────

pub fn start_http(app: AppHandle) {
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
                handle_http(app, request);
            });
        }
    });
}

fn handle_http(app: AppHandle, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let method = req.method().as_str().to_string();

    let result = route_http(&app, &method, &url, &mut req);

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

fn route_http(
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
            format!("📥 Render añadido a la cola [{}] (desde HTTP)", &id[..8]),
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

        s.add_log("log", format!("[{}] Render cancelado (desde HTTP)", name));

        if let Some(job) = s.jobs.get(idx) {
            let _ = app.emit("render-done", job.info.clone());
        }

        Ok(serde_json::json!({"message": "Render cancelled"}).to_string())
    })
}

fn handle_clear(app: &AppHandle) -> Result<String, String> {
    with_state(app, |s| {
        s.remove_completed();
        s.add_log("log", "Completed jobs cleared (desde HTTP)".into());
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

// ──────────────────────────────────────────────
// MCP Server (JSON-RPC over stdio)
// ──────────────────────────────────────────────

pub fn start_mcp(app: AppHandle) {
    thread::spawn(move || {
        let stdin = io::stdin();
        let mut reader = stdin.lock();
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<JsonRpcRequest>(trimmed) {
                        Ok(req) => handle_mcp_request(&app, &req),
                        Err(e) => {
                            let resp = JsonRpcResponse {
                                jsonrpc: "2.0".into(),
                                id: None,
                                result: None,
                                error: Some(JsonRpcError {
                                    code: -32700,
                                    message: format!("Parse error: {}", e),
                                    data: None,
                                }),
                            };
                            emit_mcp(&resp);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn handle_mcp_request(app: &AppHandle, req: &JsonRpcRequest) {
    match req.method.as_str() {
        "initialize" => handle_mcp_initialize(req),
        "notifications/initialized" => {}
        "tools/list" => handle_mcp_tools_list(req),
        "tools/call" => handle_mcp_tools_call(app, req),
        "notifications/cancelled" => {}
        _ => {
            respond_error_mcp(req, -32601, format!("Method not found: {}", req.method));
        }
    }
}

fn handle_mcp_initialize(req: &JsonRpcRequest) {
    let capabilities = serde_json::json!({
        "tools": {}
    });
    respond_mcp(req, serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": capabilities,
        "serverInfo": {
            "name": "RenderCanvasToVideo",
            "version": "0.3.0"
        }
    }));
}

fn handle_mcp_tools_list(req: &JsonRpcRequest) {
    respond_mcp(req, serde_json::json!({
        "tools": tools_definition()
    }));
}

fn handle_mcp_tools_call(app: &AppHandle, req: &JsonRpcRequest) {
    let name = req
        .params
        .as_ref()
        .and_then(|p| p.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("");

    let args = req
        .params
        .as_ref()
        .and_then(|p| p.get("arguments"))
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let result = match name {
        "list_projects" => mcp_list_projects(&args),
        "render_canvas" => mcp_render_canvas(app, &args),
        "get_render_status" => mcp_get_render_status(app, &args),
        "cancel_render" => mcp_cancel_render(app, &args),
        "get_project_files" => mcp_get_project_files(&args),
        "read_project_file" => mcp_read_project_file(&args),
        "get_output_files" => mcp_get_output_files(&args),
        "get_video_file" => mcp_get_video_file(&args),
        "get_system_info" => mcp_get_system_info(app, &args),
        "get_render_logs" => mcp_get_render_logs(app, &args),
        "create_project" => mcp_create_project(&args),
        _ => {
            respond_error_mcp(req, -32602, format!("Unknown tool: {}", name));
            return;
        }
    };

    match result {
        Ok(content) => respond_mcp(req, serde_json::json!({ "content": content })),
        Err(msg) => respond_error_mcp(req, -32603, msg),
    }
}

type ToolResult = Result<Vec<Value>, String>;

fn app_root() -> String {
    std::env::var("APP_ROOT").unwrap_or_else(|_| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".into())
    })
}

fn resolve_safe(base: &str, paths: &[&str]) -> Result<String, String> {
    let base = Path::new(base).canonicalize().map_err(|e| e.to_string())?;
    let mut target = base.clone();
    for p in paths {
        target = target.join(p);
    }
    let target = target.canonicalize().map_err(|e| format!("Path error: {}", e))?;
    if !target.starts_with(&base) {
        return Err("Path traversal detected".to_string());
    }
    Ok(target.to_string_lossy().to_string())
}

fn text_content(text: String) -> Vec<Value> {
    vec![serde_json::json!({ "type": "text", "text": text })]
}

// ─── Tool definitions ────────────────────────

fn tools_definition() -> Vec<Value> {
    vec![
        serde_json::json!({
            "name": "list_projects",
            "description": "List available canvas projects in the proyectos directory",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        serde_json::json!({
            "name": "render_canvas",
            "description": "Render a canvas animation to video. Adds job to queue and returns immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Project folder name inside proyectos/ (omit if using customProjectPath)" },
                    "width": { "type": "number", "description": "Video width in pixels" },
                    "height": { "type": "number", "description": "Video height in pixels" },
                    "fps": { "type": "number", "description": "Frames per second" },
                    "duration": { "type": "number", "description": "Duration in seconds" },
                    "bgColor": { "type": "string", "description": "Background color (hex, e.g. #000000)" },
                    "customProjectPath": { "type": "string", "description": "Path to an external project folder" },
                    "codec": { "type": "string", "description": "Video codec (libx264, libx265, hap, cfhd)" },
                    "container": { "type": "string", "description": "Container extension (.mp4, .mov)" },
                    "pixFmt": { "type": "string", "description": "Pixel format (yuv420p, yuv422p, yuv420p10le)" },
                    "codecParams": { "type": "object", "description": "Codec-specific parameters" },
                    "crf": { "type": "number", "description": "CRF quality (0-51, lower=better)" },
                    "colorPrimaries": { "type": "string", "description": "Color primaries" },
                    "colorTrc": { "type": "string", "description": "Color transfer characteristics" },
                    "colorSpace": { "type": "string", "description": "Color space" },
                    "canvasSelector": { "type": "string", "description": "CSS selector for canvas element" }
                },
                "required": ["width", "height", "fps", "duration"]
            }
        }),
        serde_json::json!({
            "name": "get_render_status",
            "description": "Get the current render jobs status",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        serde_json::json!({
            "name": "cancel_render",
            "description": "Cancel a running render job",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "jobId": { "type": "string", "description": "Job ID to cancel" }
                },
                "required": ["jobId"]
            }
        }),
        serde_json::json!({
            "name": "get_project_files",
            "description": "List all files in a project directory with sizes",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Project folder name inside proyectos/" }
                },
                "required": ["project"]
            }
        }),
        serde_json::json!({
            "name": "read_project_file",
            "description": "Read a file content from a project",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Project folder name" },
                    "file": { "type": "string", "description": "Relative file path (e.g. script.js)" }
                },
                "required": ["project", "file"]
            }
        }),
        serde_json::json!({
            "name": "get_output_files",
            "description": "List all rendered output video files with sizes and dates",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        serde_json::json!({
            "name": "get_video_file",
            "description": "Get a rendered video file info and base64 content if under 10MB",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "fileName": { "type": "string", "description": "Video filename from get_output_files" }
                },
                "required": ["fileName"]
            }
        }),
        serde_json::json!({
            "name": "get_system_info",
            "description": "Check system configuration: FFmpeg availability, app paths, render state",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        serde_json::json!({
            "name": "get_render_logs",
            "description": "Get recent render logs",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "since": { "type": "number", "description": "Index to fetch logs from (0 = all)" }
                }
            }
        }),
        serde_json::json!({
            "name": "create_project",
            "description": "Create a new canvas project with its files",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Name for the new project folder" },
                    "files": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "path": { "type": "string" },
                                "content": { "type": "string" }
                            },
                            "required": ["path", "content"]
                        }
                    },
                    "overwrite": { "type": "boolean", "description": "Overwrite existing files" }
                },
                "required": ["project", "files"]
            }
        }),
    ]
}

// ─── MCP Tool handlers ───────────────────────

fn mcp_list_projects(_args: &Value) -> ToolResult {
    let projects_path = Path::new(&app_root()).join("proyectos");
    let dirs = if projects_path.exists() {
        std::fs::read_dir(&projects_path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    Ok(text_content(serde_json::to_string_pretty(&dirs).unwrap()))
}

fn mcp_render_canvas(app: &AppHandle, args: &Value) -> ToolResult {
    let params = RenderParams {
        project: args.get("project").and_then(|v| v.as_str()).map(|s| s.to_string()),
        width: args.get("width").and_then(|v| v.as_u64()).unwrap_or(1920) as u32,
        height: args.get("height").and_then(|v| v.as_u64()).unwrap_or(1080) as u32,
        fps: args.get("fps").and_then(|v| v.as_u64()).unwrap_or(30) as u32,
        duration: args.get("duration").and_then(|v| v.as_u64()).unwrap_or(5) as u32,
        bg_color: args.get("bgColor").and_then(|v| v.as_str()).map(|s| s.to_string()),
        custom_project_path: args.get("customProjectPath").and_then(|v| v.as_str()).map(|s| s.to_string()),
        codec: args.get("codec").and_then(|v| v.as_str()).map(|s| s.to_string()),
        container: args.get("container").and_then(|v| v.as_str()).map(|s| s.to_string()),
        pix_fmt: args.get("pixFmt").and_then(|v| v.as_str()).map(|s| s.to_string()),
        codec_params: args.get("codecParams").and_then(|v| v.as_object()).map(|o| {
            let mut m = std::collections::HashMap::new();
            for (k, v) in o {
                if let Some(s) = v.as_str() {
                    m.insert(k.clone(), s.to_string());
                }
            }
            m
        }),
        crf: args.get("crf").and_then(|v| v.as_u64()).map(|v| v as u32),
        color_primaries: args.get("colorPrimaries").and_then(|v| v.as_str()).map(|s| s.to_string()),
        color_trc: args.get("colorTrc").and_then(|v| v.as_str()).map(|s| s.to_string()),
        color_space: args.get("colorSpace").and_then(|v| v.as_str()).map(|s| s.to_string()),
        canvas_selector: args.get("canvasSelector").and_then(|v| v.as_str()).map(|s| s.to_string()),
        filters: None,
        hwaccel: None,
    };

    let job_id = with_state(app, |s| {
        let id = s.add_job(params);
        s.add_log("log", format!("📥 Render añadido a la cola [{}] (desde MCP)", &id[..8]));
        Ok(id)
    })?;

    let _ = app.emit("render-started", serde_json::json!({"jobId": job_id}));

    Ok(text_content(serde_json::to_string_pretty(&serde_json::json!({"jobId": job_id})).unwrap()))
}

fn mcp_get_render_status(app: &AppHandle, _args: &Value) -> ToolResult {
    with_state(app, |s| {
        Ok(text_content(serde_json::to_string_pretty(&s.get_jobs_info()).map_err(|e| e.to_string())?))
    })
}

fn mcp_cancel_render(app: &AppHandle, args: &Value) -> ToolResult {
    let job_id = args
        .get("jobId")
        .and_then(|v| v.as_str())
        .ok_or("jobId required")?;

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

        Ok(text_content(serde_json::to_string_pretty(&serde_json::json!({"message": "Render cancelled"})).unwrap()))
    })
}

fn mcp_get_project_files(args: &Value) -> ToolResult {
    let project = args
        .get("project")
        .and_then(|v| v.as_str())
        .ok_or("project required")?;
    let project_path = resolve_safe(&app_root(), &["proyectos", project])?;
    let mut files = Vec::new();
    let base = Path::new(&project_path);
    walk_dir(base, base, &mut files)?;
    Ok(text_content(serde_json::to_string_pretty(&files).unwrap()))
}

fn walk_dir(base: &Path, dir: &Path, files: &mut Vec<Value>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = path
            .strip_prefix(base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            files.push(serde_json::json!({ "type": "directory", "name": rel }));
            walk_dir(base, &path, files)?;
        } else {
            let size = std::fs::metadata(&path)
                .map(|m| m.len())
                .unwrap_or(0);
            files.push(serde_json::json!({ "type": "file", "name": rel, "sizeBytes": size }));
        }
    }
    Ok(())
}

fn mcp_read_project_file(args: &Value) -> ToolResult {
    let project = args
        .get("project")
        .and_then(|v| v.as_str())
        .ok_or("project required")?;
    let file = args
        .get("file")
        .and_then(|v| v.as_str())
        .ok_or("file required")?;
    let file_path = resolve_safe(&app_root(), &["proyectos", project, file])?;
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    Ok(text_content(content))
}

fn mcp_get_output_files(_args: &Value) -> ToolResult {
    let renders_path = Path::new(&app_root()).join("renders");
    if !renders_path.exists() {
        return Ok(text_content("[]".into()));
    }

    let mut files: Vec<Value> = Vec::new();
    let entries = std::fs::read_dir(&renders_path).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            let name = entry.file_name().to_string_lossy().to_string();
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            files.push(serde_json::json!({
                "name": name,
                "sizeBytes": meta.len(),
                "sizeMB": format!("{:.2}", meta.len() as f64 / 1024.0 / 1024.0),
                "created": meta.created().ok().map(|t| format!("{:?}", t)),
                "modified": meta.modified().ok().map(|t| format!("{:?}", t)),
            }));
        }
    }
    files.sort_by(|a, b| {
        let am = a["modified"].as_str().unwrap_or("");
        let bm = b["modified"].as_str().unwrap_or("");
        bm.cmp(am)
    });

    Ok(text_content(serde_json::to_string_pretty(&files).unwrap()))
}

fn mcp_get_video_file(args: &Value) -> ToolResult {
    let file_name = args
        .get("fileName")
        .and_then(|v| v.as_str())
        .ok_or("fileName required")?;
    let file_path = resolve_safe(&app_root(), &["renders", file_name])?;
    let meta = std::fs::metadata(&file_path).map_err(|e| e.to_string())?;
    let size = meta.len();

    let mut result = serde_json::json!({
        "fileName": file_name,
        "filePath": file_path,
        "sizeBytes": size,
        "sizeMB": format!("{:.2}", size as f64 / 1024.0 / 1024.0),
    });

    let max_base64 = 10 * 1024 * 1024;
    if size <= max_base64 {
        let data = std::fs::read(&file_path).map_err(|e| e.to_string())?;
        let b64 = base64_encode(&data);
        result["contentBase64"] = serde_json::Value::String(b64);
        result["mimeType"] = serde_json::Value::String("video/mp4".into());
        result["encoding"] = serde_json::Value::String("base64".into());
    } else {
        result["note"] =
            serde_json::Value::String("File too large for base64. Access via filePath.".into());
    }

    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn mcp_get_system_info(app: &AppHandle, _args: &Value) -> ToolResult {
    let ffmpeg_check = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("ffmpeg not found")
                .to_string()
        })
        .unwrap_or_else(|| "ffmpeg not found".to_string());

    let projects_path = Path::new(&app_root()).join("proyectos");
    let renders_path = Path::new(&app_root()).join("renders");

    let render_state = with_state(app, |s| {
        Ok::<_, String>(serde_json::to_value(s.get_jobs_info()).map_err(|e| e.to_string())?)
    }).ok();

    let info = serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "appRoot": app_root(),
        "ffmpeg": ffmpeg_check,
        "proyectosPath": projects_path.to_string_lossy().to_string(),
        "proyectosExists": projects_path.exists(),
        "rendersPath": renders_path.to_string_lossy().to_string(),
        "rendersExists": renders_path.exists(),
        "renderJobs": render_state,
    });

    Ok(text_content(serde_json::to_string_pretty(&info).unwrap()))
}

fn mcp_get_render_logs(app: &AppHandle, args: &Value) -> ToolResult {
    let since = args
        .get("since")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

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
        Ok(text_content(serde_json::to_string_pretty(
            &serde_json::json!({"logs": logs, "total": s.log_buffer.len()})
        ).map_err(|e| e.to_string())?))
    })
}

fn mcp_create_project(args: &Value) -> ToolResult {
    let project = args
        .get("project")
        .and_then(|v| v.as_str())
        .ok_or("project required")?;
    let files = args
        .get("files")
        .and_then(|v| v.as_array())
        .ok_or("files required")?;
    let overwrite = args
        .get("overwrite")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let project_dir = Path::new(&app_root()).join("proyectos").join(project);
    if project_dir.exists() && !overwrite {
        return Err(format!(
            "Project \"{}\" already exists. Set overwrite=true to replace.",
            project
        ));
    }
    std::fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;

    let mut created = Vec::new();
    for file in files {
        let rel_path = file
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or("Each file must have a path")?;
        let content = file
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or("Each file must have content")?;

        let resolved = resolve_safe(
            project_dir.to_string_lossy().as_ref(),
            &[rel_path],
        )?;
        let parent = Path::new(&resolved)
            .parent()
            .ok_or("Invalid path")?
            .to_path_buf();
        std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
        std::fs::write(&resolved, content).map_err(|e| e.to_string())?;
        created.push(rel_path.to_string());
    }

    let result = serde_json::json!({
        "message": format!("Project \"{}\" created successfully", project),
        "project": project,
        "filesCreated": created,
        "totalFiles": created.len(),
    });

    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

// ─── JSON-RPC protocol ───────────────────────

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

fn respond_mcp(req: &JsonRpcRequest, result: Value) {
    let resp = JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id: req.id.clone(),
        result: Some(result),
        error: None,
    };
    emit_mcp(&resp);
}

fn respond_error_mcp(req: &JsonRpcRequest, code: i32, message: String) {
    let resp = JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id: req.id.clone(),
        result: None,
        error: Some(JsonRpcError {
            code,
            message,
            data: None,
        }),
    };
    emit_mcp(&resp);
}

fn emit_mcp(resp: &JsonRpcResponse) {
    let line = serde_json::to_string(resp).unwrap();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", line);
    let _ = handle.flush();
}
