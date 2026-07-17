use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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

    let url: url::Url = project_url
        .parse()
        .map_err(|e: url::ParseError| format!("URL inválida: {}", e))?;

    let webview = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .inner_size(width as f64, height as f64)
        .position(-9999.0, -9999.0)
        .resizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| format!("Error creando webview oculta: {}", e))?;

    let script = capture_script(fps, total_frames, bg_color, canvas_selector, job_id);

    let wv = webview.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let _ = wv.eval(&script);
    });

    Ok(LABEL.to_string())
}

pub fn close_capture_webview(app: &AppHandle) {
    if let Some(wv) = app.get_webview_window("render-capture") {
        let _ = wv.close();
    }
}

fn capture_script(fps: u32, total_frames: u32, bg_color: &str, canvas_selector: &str, job_id: &str) -> String {
    format!(
        r#"(function() {{
    const FPS = {fps};
    const TOTAL_FRAMES = {total_frames};
    const BG_COLOR = '{bg_color}';
    const CANVAS_SELECTOR = '{canvas_selector}';
    const JOB_ID = '{job_id}';
    const FRAME_INTERVAL = 1000 / FPS;
    let currentFrame = 0;
    let cancelled = false;
    let running = false;

    window.__frameTime = 0;
    const origDateNow = Date.now;
    Date.now = function() {{ return window.__frameTime; }};
    const origPerfNow = performance.now.bind(performance);
    performance.now = function() {{ return window.__frameTime; }};

    const origRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb) {{
        if (window.__rAFCallback) return 0;
        window.__rAFCallback = cb;
        return 0;
    }};

    function captureFrame() {{
        const sel = CANVAS_SELECTOR || 'canvas';
        const targetCanvas = document.querySelector(sel);
        if (!targetCanvas) {{
            sendError('Canvas not found: ' + sel);
            cancelled = true;
            return false;
        }}

        let base64;
        const gl = targetCanvas.getContext('webgl') || targetCanvas.getContext('webgl2');
        const gpu = targetCanvas.getContext('webgpu');

        if (gl) {{
            const width = targetCanvas.width;
            const height = targetCanvas.height;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const canvas2 = document.createElement('canvas');
            canvas2.width = width;
            canvas2.height = height;
            const ctx2 = canvas2.getContext('2d');
            const imageData = ctx2.createImageData(width, height);
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
                const texture = gpu.getCurrentTexture();
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
        try {{
            window.__TAURI__.core.invoke('send_frame', {{ jobId: JOB_ID, data, frame, total }})
                .catch(function(err) {{
                    console.error('send_frame error:', err);
                    cancelled = true;
                    finalize();
                }});
        }} catch(e) {{
            console.error('send_frame exception:', e);
            cancelled = true;
            finalize();
        }}
    }}

    function finalize() {{
        try {{
            window.__TAURI__.core.invoke('finalize_render', {{ jobId: JOB_ID }}).catch(function(){{}});
        }} catch(e) {{}}
    }}

    function sendError(msg) {{
        console.error(msg);
    }}

    function nextFrame() {{
        if (cancelled || currentFrame >= TOTAL_FRAMES) {{
            finalize();
            return;
        }}
        currentFrame++;
        window.__frameTime = currentFrame * FRAME_INTERVAL;
        if (window.__rAFCallback) {{
            const cb = window.__rAFCallback;
            window.__rAFCallback = null;
            try {{ cb(window.__frameTime); }} catch(e) {{}}
        }}
        origRAF(function() {{
            captureFrame();
            setTimeout(nextFrame, 0);
        }});
    }}

    function tryStart() {{
        if (running) return;
        const sel = CANVAS_SELECTOR || 'canvas';
        if (document.querySelector(sel)) {{
            running = true;
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
