use std::time::Duration;
use tauri::{AppHandle, Manager};

pub fn create_capture_webview(
    app: &AppHandle,
    project_url: &str,
    fps: u32,
    total_frames: u32,
    bg_color: &str,
    canvas_selector: &str,
    width: u32,
    height: u32,
    job_id: &str,
) -> Result<String, String> {
    const LABEL: &str = "render-capture";

    let window = app
        .get_webview_window(LABEL)
        .ok_or_else(|| {
            format!("Ventana '{}' no encontrada. Define render-capture en tauri.conf.json", LABEL)
        })?;

    window
        .set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|e| format!("Error redimensionando webview: {}", e))?;

    window
        .set_position(tauri::LogicalPosition::new(-9999.0, -9999.0))
        .map_err(|e| format!("Error posicionando webview: {}", e))?;

    let parsed_url: url::Url = project_url
        .parse()
        .map_err(|e: url::ParseError| format!("URL inválida: {}", e))?;
    window
        .navigate(parsed_url)
        .map_err(|e| format!("Error navegando a URL del proyecto: {}", e))?;

    let script = capture_script(fps, total_frames, bg_color, canvas_selector, job_id);

    let wv = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(2000)).await;
        let _ = wv.eval(&script);
    });

    Ok(LABEL.to_string())
}

pub fn close_capture_webview(app: &AppHandle) {
    if let Some(wv) = app.get_webview_window("render-capture") {
        if let Ok(url) = "about:blank".parse::<url::Url>() {
            let _ = wv.navigate(url);
        }
    }
}

fn capture_script(fps: u32, total_frames: u32, bg_color: &str, canvas_selector: &str, job_id: &str) -> String {
    format!(
        r#"(function() {{
    if (window.__captureRunning) return;
    window.__captureRunning = true;

    const FPS = {fps};
    const TOTAL_FRAMES = {total_frames};
    const BG_COLOR = '{bg_color}';
    const CANVAS_SELECTOR = '{canvas_selector}';
    const JOB_ID = '{job_id}';
    const FRAME_INTERVAL = 1000 / FPS;
    let currentFrame = 0;
    let cancelled = false;

    const origDateNow = Date.now;
    const origPerfNow = performance.now.bind(performance);
    window.__rAFCallbacks = [];

    window.requestAnimationFrame = function(cb) {{
        window.__rAFCallbacks.push(cb);
        return window.__rAFCallbacks.length;
    }};

    function httpPost(path, data) {{
        return fetch(path, {{
            method: 'POST',
            headers: {{ 'Content-Type': 'text/plain' }},
            body: JSON.stringify(data),
        }}).then(function(r) {{ return r.json(); }});
    }}

    function captureFrame() {{
        const sel = CANVAS_SELECTOR || 'canvas';
        const targetCanvas = document.querySelector(sel);
        if (!targetCanvas) return false;

        let base64;
        const gl = targetCanvas.getContext('webgl') || targetCanvas.getContext('webgl2');
        const gpu = targetCanvas.getContext('webgpu');

        if (gl) {{
            const w = targetCanvas.width;
            const h = targetCanvas.height;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const canvas2 = document.createElement('canvas');
            canvas2.width = w;
            canvas2.height = h;
            const ctx2 = canvas2.getContext('2d');
            const imageData = ctx2.createImageData(w, h);
            for (let i = 0; i < pixels.length; i += 4) {{
                imageData.data[i] = pixels[i + 2];
                imageData.data[i + 1] = pixels[i + 1];
                imageData.data[i + 2] = pixels[i];
                imageData.data[i + 3] = pixels[i + 3];
            }}
            ctx2.putImageData(imageData, 0, 0);
            base64 = canvas2.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        }} else if (gpu) {{
            try {{
                const canvas2 = document.createElement('canvas');
                canvas2.width = targetCanvas.width;
                canvas2.height = targetCanvas.height;
                const ctx2 = canvas2.getContext('2d');
                ctx2.drawImage(targetCanvas, 0, 0);
                base64 = canvas2.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
            }} catch(e) {{
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = targetCanvas.width;
                tempCanvas.height = targetCanvas.height;
                const ctx = tempCanvas.getContext('2d');
                ctx.fillStyle = BG_COLOR;
                ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                ctx.drawImage(targetCanvas, 0, 0);
                base64 = tempCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
            }}
        }} else {{
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetCanvas.width;
            tempCanvas.height = targetCanvas.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = BG_COLOR;
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(targetCanvas, 0, 0);
            base64 = tempCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        }}

        sendFrame(base64, currentFrame, TOTAL_FRAMES);
        return true;
    }}

    function sendFrame(data, frame, total) {{
        httpPost('/_tauri/send_frame', {{ jobId: JOB_ID, data, frame, total }})
            .then(function(res) {{
                if (res.error) {{
                    cancelled = true;
                    finalize();
                }}
            }})
            .catch(function() {{
                cancelled = true;
                finalize();
            }});
    }}

    function finalize() {{
        httpPost('/_tauri/finalize_render', {{ jobId: JOB_ID }}).catch(function(){{}});
    }}

    function nextFrame() {{
        if (cancelled || currentFrame >= TOTAL_FRAMES) {{
            finalize();
            return;
        }}
        currentFrame++;
        var simTime = currentFrame * FRAME_INTERVAL;

        Date.now = function() {{ return simTime; }};
        performance.now = function() {{ return simTime; }};

        var callbacks = window.__rAFCallbacks;
        window.__rAFCallbacks = [];
        for (var i = 0; i < callbacks.length; i++) {{
            try {{ callbacks[i](simTime); }} catch(e) {{}}
        }}

        Date.now = origDateNow;
        performance.now = origPerfNow;

        setTimeout(function() {{
            if (!captureFrame()) {{
                cancelled = true;
                finalize();
                return;
            }}
            setTimeout(nextFrame, 0);
        }}, 0);
    }}

    function tryStart() {{
        const sel = CANVAS_SELECTOR || 'canvas';
        if (document.querySelector(sel)) {{
            currentFrame = 0;
            cancelled = false;
            nextFrame();
        }} else {{
            setTimeout(tryStart, 200);
        }}
    }}

    if (document.readyState === 'complete' || document.readyState === 'interactive') {{
        setTimeout(tryStart, 500);
    }} else {{
        document.addEventListener('DOMContentLoaded', function() {{ setTimeout(tryStart, 500); }});
    }}
}})();"#,
        fps = fps,
        total_frames = total_frames,
        bg_color = bg_color,
        canvas_selector = canvas_selector,
        job_id = job_id,
    )
}
