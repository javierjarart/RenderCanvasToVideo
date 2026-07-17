use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::path::Path;

const ADMIN_API: &str = "http://127.0.0.1:1421";

fn main() {
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
                    Ok(req) => handle_request(&req),
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
                        emit(&resp);
                    }
                }
            }
            Err(e) => {
                eprintln!("[mcp] Read error: {}", e);
                break;
            }
        }
    }
}

fn handle_request(req: &JsonRpcRequest) {
    match req.method.as_str() {
        "initialize" => handle_initialize(req),
        "notifications/initialized" => { /* no response */ }
        "tools/list" => handle_tools_list(req),
        "tools/call" => handle_tools_call(req),
        "notifications/cancelled" => { /* no response */ }
        _ => {
            respond_error(req, -32601, format!("Method not found: {}", req.method));
        }
    }
}

fn handle_initialize(req: &JsonRpcRequest) {
    let capabilities = serde_json::json!({
        "tools": {}
    });
    respond(req, serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": capabilities,
        "serverInfo": {
            "name": "RenderCanvasToVideo",
            "version": "0.2.3"
        }
    }));
}

fn handle_tools_list(req: &JsonRpcRequest) {
    respond(req, serde_json::json!({
        "tools": tools_definition()
    }));
}

fn handle_tools_call(req: &JsonRpcRequest) {
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
        "list_projects" => call_list_projects(&args),
        "render_canvas" => call_render_canvas(&args),
        "get_render_status" => call_get_render_status(&args),
        "cancel_render" => call_cancel_render(&args),
        "get_project_files" => call_get_project_files(&args),
        "read_project_file" => call_read_project_file(&args),
        "get_output_files" => call_get_output_files(&args),
        "get_video_file" => call_get_video_file(&args),
        "get_system_info" => call_get_system_info(&args),
        "get_render_logs" => call_get_render_logs(&args),
        "create_project" => call_create_project(&args),
        _ => {
            respond_error(req, -32602, format!("Unknown tool: {}", name));
            return;
        }
    };

    match result {
        Ok(content) => respond(req, serde_json::json!({ "content": content })),
        Err(msg) => respond_error(req, -32603, msg),
    }
}

// ─── Tool definitions ───────────────────────────────────────────────────────

fn tools_definition() -> Vec<Value> {
    vec![
        serde_json::json!({
            "name": "list_projects",
            "description": "List available canvas projects in the proyectos directory",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
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
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
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
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
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
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
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

// ─── Tool handlers ──────────────────────────────────────────────────────────

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

fn api_post(path: &str, body: &Value) -> Result<Value, String> {
    let url = format!("{}{}", ADMIN_API, path);
    let resp = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(body)
        .map_err(|e| format!("API request failed: {}", e))?;
    let status = resp.status();
    let json: Value = resp
        .into_json()
        .map_err(|e| format!("API response parse error: {}", e))?;
    if status >= 400 {
        let msg = json
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Unknown error");
        return Err(msg.to_string());
    }
    Ok(json)
}

fn api_get(path: &str) -> Result<Value, String> {
    let url = format!("{}{}", ADMIN_API, path);
    let resp = ureq::get(&url)
        .call()
        .map_err(|e| format!("API request failed: {}", e))?;
    let status = resp.status();
    let json: Value = resp
        .into_json()
        .map_err(|e| format!("API response parse error: {}", e))?;
    if status >= 400 {
        let msg = json
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Unknown error");
        return Err(msg.to_string());
    }
    Ok(json)
}

fn text_content(text: String) -> Vec<Value> {
    vec![serde_json::json!({ "type": "text", "text": text })]
}

fn call_list_projects(_args: &Value) -> ToolResult {
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

fn call_render_canvas(args: &Value) -> ToolResult {
    let params = serde_json::json!({
        "project": args.get("project"),
        "width": args.get("width").and_then(|v| v.as_u64()).unwrap_or(1920) as u32,
        "height": args.get("height").and_then(|v| v.as_u64()).unwrap_or(1080) as u32,
        "fps": args.get("fps").and_then(|v| v.as_u64()).unwrap_or(30) as u32,
        "duration": args.get("duration").and_then(|v| v.as_u64()).unwrap_or(5) as u32,
        "bg_color": args.get("bgColor").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "custom_project_path": args.get("customProjectPath").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "codec": args.get("codec").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "container": args.get("container").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "pix_fmt": args.get("pixFmt").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "codec_params": args.get("codecParams").and_then(|v| v.as_object()).map(|o| {
            let mut m = std::collections::HashMap::new();
            for (k, v) in o {
                if let Some(s) = v.as_str() {
                    m.insert(k.clone(), s.to_string());
                }
            }
            m
        }),
        "crf": args.get("crf").and_then(|v| v.as_u64()).map(|v| v as u32),
        "color_primaries": args.get("colorPrimaries").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "color_trc": args.get("colorTrc").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "color_space": args.get("colorSpace").and_then(|v| v.as_str()).map(|s| s.to_string()),
        "canvas_selector": args.get("canvasSelector").and_then(|v| v.as_str()).map(|s| s.to_string()),
    });

    let result = api_post("/api/render", &params)?;
    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

fn call_get_render_status(_args: &Value) -> ToolResult {
    let result = api_get("/api/status")?;
    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

fn call_cancel_render(args: &Value) -> ToolResult {
    let job_id = args
        .get("jobId")
        .and_then(|v| v.as_str())
        .ok_or("jobId required")?;
    let result = api_post(&format!("/api/cancel/{}", job_id), &serde_json::json!({}))?;
    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

fn call_get_project_files(args: &Value) -> ToolResult {
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

fn call_read_project_file(args: &Value) -> ToolResult {
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

fn call_get_output_files(_args: &Value) -> ToolResult {
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

fn call_get_video_file(args: &Value) -> ToolResult {
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

fn call_get_system_info(_args: &Value) -> ToolResult {
    let ffmpeg_check = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .ok()
        .map(|o| {
            let ver = String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("ffmpeg not found")
                .to_string();
            ver
        })
        .unwrap_or_else(|| "ffmpeg not found".to_string());

    let projects_path = Path::new(&app_root()).join("proyectos");
    let renders_path = Path::new(&app_root()).join("renders");

    let render_state = api_get("/api/status").ok();

    let info = serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "appRoot": app_root(),
        "ffmpeg": ffmpeg_check,
        "proyectosPath": projects_path.to_string_lossy().to_string(),
        "proyectosExists": projects_path.exists(),
        "rendersPath": renders_path.to_string_lossy().to_string(),
        "rendersExists": renders_path.exists(),
        "adminApi": ADMIN_API,
        "adminApiReachable": render_state.is_some(),
        "renderJobs": render_state,
    });

    Ok(text_content(serde_json::to_string_pretty(&info).unwrap()))
}

fn call_get_render_logs(args: &Value) -> ToolResult {
    let since = args
        .get("since")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let result = api_get(&format!("/api/logs?since={}", since))?;
    Ok(text_content(serde_json::to_string_pretty(&result).unwrap()))
}

fn call_create_project(args: &Value) -> ToolResult {
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

// ─── JSON-RPC helpers ───────────────────────────────────────────────────────

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

fn respond(req: &JsonRpcRequest, result: Value) {
    let resp = JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id: req.id.clone(),
        result: Some(result),
        error: None,
    };
    emit(&resp);
}

fn respond_error(req: &JsonRpcRequest, code: i32, message: String) {
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
    emit(&resp);
}

fn emit(resp: &JsonRpcResponse) {
    let line = serde_json::to_string(resp).unwrap();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", line);
    let _ = handle.flush();
}
