use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

pub struct ProjectServer {
    pub port: u16,
}

impl ProjectServer {
    pub fn start(
        project_path: &str,
        entry_point: Option<&str>,
        shutdown: Arc<AtomicBool>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let path = project_path.to_string();
        let entry = entry_point.unwrap_or("index.html").to_string();

        let server = tiny_http::Server::http("127.0.0.1:0")?;
        let port = server.server_addr().to_ip().unwrap().port();

        thread::spawn(move || {
            loop {
                if shutdown.load(Ordering::Relaxed) {
                    break;
                }
                match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(request)) => {
                        serve_file(request, &path, &entry);
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
