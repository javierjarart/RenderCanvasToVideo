# AGENTS.md — Refactorización a Tauri + Vanilla JS

## Objetivo

Reducir el proyecto de ~2GB (node_modules + target debug + Electron + React + Vite + TS) a **~30MB** eliminando React, TypeScript, Vite, Electron, Puppeteer, y el toolchain npm. El frontend será HTML/CSS/JS vanilla servido directamente por Tauri v2.

---

## Rama de trabajo

```
git checkout -b refactor-vanilla migracion-tauri-react-2
```

---

## Fase 1: Limpiar dependencias y toolchain

### Archivos/directorios a ELIMINAR:

```
package.json              → Sustituir por version mínima (solo script "tauri")
package-lock.json         → Eliminar
node_modules/             → rm -rf
tsconfig.json             → Eliminar
tsconfig.node.json        → Eliminar
vite.config.ts            → Eliminar
index.html                → Eliminar (raíz, es el de Vite)
src/                      → rm -rf (todo el frontend React)
main.js                   → Eliminar (Electron)
preload.js                → Eliminar (Electron)
test-pipeline.js          → Eliminar
.puppeteerrc.cjs          → Eliminar
server.js                 → Eliminar (Express server Node)
mcp-server.js             → Eliminar (MCP server Node, se pasa a Rust)
renderCanvasCLI/          → rm -rf (opcional, mover a otro repo)
venv/                     → rm -rf
proyectos/upload-*/       → rm -rf
target/debug/             → rm -rf
```

### package.json nuevo (mínimo):

```json
{
  "name": "rendercanvastovideo",
  "private": true,
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

Luego: `npm install` (solo instalará Tauri CLI, ~50MB en vez de 816MB).

---

## Fase 2: Nuevo frontend Vanilla JS

### Estructura:

```
public/
  index.html    → UI completa
  style.css     → Estilos
  app.js        → Lógica (~450 líneas)
```

### Requisitos Tauri para vanilla JS sin npm

En `tauri.conf.json`:
- `"app.withGlobalTauri": true` → expone `window.__TAURI__`
- `"build.frontendDist": "../public"` → Tauri sirve los archivos estáticos
- Sin `beforeDevCommand`, `beforeBuildCommand`, `devUrl`

### API Tauri desde vanilla JS

```js
const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;

// Ejemplos:
invoke('render_project', { params: body });
invoke('get_status');
invoke('get_logs', { since: 0 });
invoke('cancel_render', { jobId: id });
invoke('remove_job', { jobId: id });
invoke('clear_completed');

// Diálogo para seleccionar carpeta:
const selected = await window.__TAURI__.core.invoke('plugin:dialog|open', {
  directory: true,
  multiple: false,
  title: 'Selecciona la carpeta del proyecto',
});
// O usando el plugin dialog desde window.__TAURI__:
// const { open } = window.__TAURI__.dialog;
```

### Contenido de cada archivo

#### `public/index.html`

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self';">
  <title>RenderCanvasToVideo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="root">
    <div class="studio-container">
      <form id="render-form">
        <!-- DropZone: botón seleccionar carpeta -->
        <div class="form-row">
          <div class="form-group">
            <label>Carpeta del proyecto</label>
            <button type="button" id="btn-select-folder">📁 Seleccionar carpeta</button>
            <div id="folder-name"></div>
          </div>
        </div>

        <!-- Preset + Color Profile -->
        <div class="form-row">
          <div class="form-group">
            <label>Presets</label>
            <select id="preset-select"></select>
          </div>
          <div class="form-group">
            <label>Perfil de color</label>
            <select id="color-profile-select"></select>
          </div>
        </div>

        <!-- Width + Height -->
        <div class="form-row">
          <div class="form-group">
            <label>Ancho (px)</label>
            <input type="number" id="input-width" required>
          </div>
          <div class="form-group">
            <label>Alto (px)</label>
            <input type="number" id="input-height" required>
          </div>
        </div>

        <!-- FPS + Duration -->
        <div class="form-row">
          <div class="form-group">
            <label>FPS</label>
            <input type="number" id="input-fps" required>
          </div>
          <div class="form-group">
            <label>Duración (seg)</label>
            <input type="number" id="input-duration" required>
          </div>
        </div>

        <!-- BG Color + Codec info -->
        <div class="form-row">
          <div class="form-group">
            <label>Color de fondo</label>
            <input type="color" id="input-bg-color" value="#000000">
          </div>
          <div class="form-group">
            <label>Códec / Salida</label>
            <input type="text" id="codec-info" readonly>
          </div>
        </div>

        <!-- Advanced toggle -->
        <div id="advanced-toggle">▼ Opciones avanzadas</div>
        <div id="advanced-options" style="display:none">
          <div class="form-row">
            <div class="form-group">
              <label>Filtros FFmpeg (-vf)</label>
              <input type="text" id="input-filters" placeholder="eq. scale=1280:720,format=nv12">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Aceleración HW</label>
              <select id="select-hwaccel">
                <option value="">Ninguna (CPU)</option>
                <option value="cuda">CUDA (NVIDIA)</option>
                <option value="vaapi">VAAPI (Linux)</option>
                <option value="videotoolbox">VideoToolbox (macOS)</option>
                <option value="dxva2">DXVA2 (Windows)</option>
                <option value="qsv">QSV (Intel)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Selector canvas</label>
              <input type="text" id="input-canvas-selector" placeholder="canvas (default)">
            </div>
          </div>
        </div>

        <!-- Submit -->
        <button type="submit" id="btn-submit">▶ Añadir a cola</button>
      </form>

      <!-- Progress bar section -->
      <div id="progress-section" style="display:none"></div>

      <!-- Log viewer -->
      <div id="log-container">
        <div id="log-header">📋 Log <span id="log-toggle">▼</span></div>
        <div id="log-body" style="display:none">
          <pre id="log-content"></pre>
        </div>
      </div>

      <div class="credit">📷 @javier.jarart</div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

#### `public/style.css`

Extraer de:
- `src/index.css` (variables CSS, reset, body, #root)
- `src/App.css` (.studio-container, .credit)
- Estilos inline de los componentes React convertidos a clases

Variables CSS clave:
```css
:root {
  --bg: #0a0808;
  --panel: #1a1a1a;
  --text: #e0e0e0;
  --accent: #ff4800;
  --border: #3a3a3a;
  --border-light: #2a2a2a;
  --muted: #999;
  --radius: 2px;
  --radius-btn: 3px;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
}
```

Clases a crear (correspondencia con componentes React):

| Clase CSS | Origen (React inline style) |
|---|---|
| `.form-row` | `styles.row` |
| `.form-group` | `styles.formGroup` / `styles.flex1` |
| `.form-label` | `styles.label` |
| `.form-input` | `styles.input` |
| `.form-select` | `styles.select` |
| `.btn-submit` | `styles.submitBtn` |
| `.codec-info` | `styles.codecInfo` |
| `.job-item` | `styles.item` (ProgressBar) |
| `.job-header` | `styles.header` (ProgressBar) |
| `.job-name` | `styles.name` (ProgressBar) |
| `.badge` | `styles.badge(color)` (ProgressBar) |
| `.bar-outer` | `styles.barOuter` (ProgressBar) |
| `.bar-inner` | `styles.barInner(pct, color)` (ProgressBar) |
| `.log-container` | `styles.container` (LogViewer) |
| `.log-header` | `styles.header` (LogViewer) |
| `.log-body` | `styles.body(open)` (LogViewer) |
| `.log-content` | `styles.content` (LogViewer) |
| `.log-entry` | `styles.entry` (LogViewer) |
| `.log-time` | `styles.time` (LogViewer) |

#### `public/app.js`

Estructura del código:

```js
// ========================================
// 1. CONFIGURACIÓN - Presets y perfiles de color
// ========================================
// Copiar PRESETS y COLOR_PROFILES de src/components/RenderForm.tsx líneas 6-52
// Copiar GROUP_LABELS de RenderForm.tsx líneas 38-46

const PRESETS = { /* ... exactamente igual que en RenderForm.tsx ... */ };
const COLOR_PROFILES = { /* ... exactamente igual ... */ };
const GROUP_LABELS = { /* ... exactamente igual ... */ };

// ========================================
// 2. ESTADO GLOBAL
// ========================================
const state = {
  projectPath: null,
  logs: [],
  totalLogs: 0,
  jobs: [],
  logOpen: false,
};

// ========================================
// 3. Tauri API HELPERS
// ========================================
const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;

// ========================================
// 4. DOM REFERENCES
// ========================================
// Obtener referencias a todos los elementos del DOM por id

// ========================================
// 5. DROPZONE - Selección de carpeta
// ========================================
btnSelectFolder.addEventListener('click', async () => {
  // Usar window.__TAURI__.dialog.open({ directory: true })
  // Mostrar nombre de la carpeta seleccionada
  // state.projectPath = selected
});

// ========================================
// 6. PRESET LOGIC
// ========================================
// Llenar <select id="preset-select"> con los presets (con optgroups)
// Copiar lógica applyPreset y useEffect de RenderForm.tsx
presetSelect.addEventListener('change', () => {
  // Actualizar width, height, fps inputs
  // Actualizar codec-info input
});

colorProfileSelect.addEventListener('change', () => {
  // Actualizar codec-info si el perfil de color afecta pix_fmt
});

// ========================================
// 7. SUBMIT - Añadir a cola
// ========================================
renderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Validar que projectPath no sea null
  // Construir RenderParams (misma estructura que RenderForm.tsx handleSubmit)
  // await invoke('render_project', { params: body })
});

// ========================================
// 8. ADVANCED OPTIONS TOGGLE
// ========================================
advancedToggle.addEventListener('click', () => {
  // Toggle display de #advanced-options
  // Cambiar flecha ▲/▼
});

// ========================================
// 9. PROGRESS BAR - Renderizado de jobs
// ========================================
function renderJobs() {
  // Renderizar cada job de state.jobs en #progress-section
  // Misma UI que ProgressBar.tsx JobItem
  // Botones: Cancelar (invoke cancel_render), Eliminar (invoke remove_job)
  // Badge de estado, barra de progreso
}
// Ocultar #progress-section si jobs.length === 0

// ========================================
// 10. LOG VIEWER
// ========================================
logHeader.addEventListener('click', () => {
  // Toggle #log-body
  // scroll al fondo
});

function appendLogs(newLogs) {
  // Escapar HTML (copy-paste función escapeHtml de LogViewer.tsx)
  // Append cada entrada a #log-content
  // Scroll al fondo si está abierto
}

// ========================================
// 11. POLLING - Actualización periódica
// ========================================
setInterval(async () => {
  // invoke('get_status') → state.jobs → renderJobs()
}, 2000);

setInterval(async () => {
  // invoke('get_logs', { since: state.totalLogs }) → appendLogs()
}, 1000);

// ========================================
// 12. EVENT LISTENERS - Eventos push de Tauri
// ========================================
listen('render-started', () => refreshJobs());
listen('render-progress', () => refreshJobs());
listen('render-done', () => refreshJobs());

// ========================================
// 13. INIT
// ========================================
async function init() {
  // Cargar estado inicial
  await refreshJobs();
  // Configurar preset inicial
  presetSelect.value = 'hd-60';
  presetSelect.dispatchEvent(new Event('change'));
}
init();
```

---

## Fase 3: Actualizar `tauri.conf.json`

Ruta: `src-tauri/tauri.conf.json`

```json
{
  "productName": "RenderCanvasToVideo",
  "version": "0.3.0",
  "identifier": "com.javierjarart.rendercanvastovideo",
  "build": {
    "frontendDist": "../public",
    "removeUnusedCommands": true
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "RenderCanvasToVideo",
        "width": 740,
        "height": 380,
        "minWidth": 600,
        "minHeight": 380,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Cambios desde la configuración actual:
- `build.beforeDevCommand` → ELIMINAR
- `build.devUrl` → ELIMINAR
- `build.beforeBuildCommand` → ELIMINAR
- `build.frontendDist` → `"../dist"` → `"../public"`
- `app.withGlobalTauri` → AÑADIR `true`
- `build.removeUnusedCommands` → AÑADIR `true`

---

## Fase 4: Refactorizar Rust

### 4a. Integrar MCP server en el binario principal

Actualmente `mcp-server/` es un crate separado. Se elimina y su lógica se integra en `admin_api.rs`.

**En `admin_api.rs`**, añadir:

```rust
use std::io::{self, BufRead, Write};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

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
                    if trimmed.is_empty() { continue; }
                    // Procesar JSON-RPC y responder
                }
                Err(_) => break,
            }
        }
    });
}
```

**En `lib.rs`**, añadir lógica de arranque condicional:

```rust
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            get_status, get_logs, render_project,
            send_frame, finalize_render, cancel_render,
            remove_job, clear_completed, get_project_url,
        ])
        .build(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");

    let handle = app.handle().clone();

    if std::env::args().any(|a| a == "--mcp") {
        // Si se pasa --mcp, arrancar solo el servidor MCP (sin UI)
        admin_api::start_mcp(handle);
        // No arrancar queue processor ni HTTP admin API
    } else {
        // Modo normal con UI
        QueueProcessor::start(handle.clone());
        admin_api::start_http(handle.clone());
    }

    app.run(|_app_handle, _event| {});
}
```

**Eliminar**: `mcp-server/` directorio entero, `mcp-server.js`

**Actualizar** `Cargo.toml` (workspace raíz):
```toml
[workspace]
resolver = "2"
members = ["src-tauri"]
```

### 4b. Simplificar dependencias de Rust

En `src-tauri/Cargo.toml`, la dependencia `url` se puede eliminar — Tauri ya la incluye internamente y `capture.rs` la usa solo para parsear URLs.

Las dependencias actuales son adecuadas, no hay mucho que recortar del lado Rust. El peso está en las dependencias npm, no en las de Cargo.

---

## Fase 5: Construir y probar

```bash
# 1. Instalar solo Tauri CLI
cd /home/flwr/RenderCanvasToVideo
npm install

# 2. Compilar Rust en release
cargo build --release --manifest-path src-tauri/Cargo.toml

# 3. Ejecutar en modo desarrollo (usando frontend estático)
cargo run --manifest-path src-tauri/Cargo.toml

# O con Tauri CLI:
npx tauri dev

# 4. Probar funcionalidad:
#    - Seleccionar carpeta de proyecto
#    - Elegir preset
#    - Ajustar parámetros
#    - Añadir a cola
#    - Ver progreso
#    - Cancelar render
#    - Ver logs

# 5. Construir instalable:
npx tauri build
```

---

## Fase 6: Limpieza final

```bash
# Eliminar lo que ya no se necesita
rm -rf node_modules/.cache
rm -rf src-tauri/target/debug
rm -rf proyectos/upload-*
rm -rf venv
```

---

## Comandos útiles

```bash
# Ver tamaño de directorios
du -sh * .[^.]* 2>/dev/null | sort -rh

# Ver tamaños de binarios
ls -lh src-tauri/target/release/rendercanvastovideo

# Ver qué ocupa más en target
du -sh src-tauri/target/release/build/* src-tauri/target/release/deps/* 2>/dev/null | sort -rh | head -20
```

---

## Cambios recientes (jul 2026)

### Bugs corregidos en frontend

| Archivo | Cambio |
|---|---|
| `src-tauri/tauri.conf.json` | `removeUnusedCommands: true` → `false` (Tauri eliminaba comandos al no detectarlos en vanilla JS) |
| `public/index.html` | `form-group` de la fila carpeta → `flex1` (botones ocupan todo el ancho lado a lado) |
| `public/index.html` | `pre#log-content` → `div#log-content` (pre no acepta hijos div) |
| `public/app.js` | `openDialog()` ahora usa `window.__TAURI__.dialog?.open()` con fallback a `invoke('plugin:dialog|open', ...)` |

### FFmpeg — embebido en el binario (single .exe)

FFmpeg se **embebe dentro del .exe** con `include_bytes!` en tiempo de compilación, y se extrae a `$TMPDIR/RenderCanvasToVideo/ffmpeg` al primer uso. No hay archivos separados que distribuir junto al ejecutable.

**Mecanismo (`src-tauri/src/ffmpeg.rs`)**:
1. `build.rs` detecta si existe `src-tauri/binaries/ffmpeg` (o `ffmpeg.exe`)
2. Si existe, emite `cfg(ffmpeg_bundled)` y el binario se incrusta via `include_bytes!`
3. En runtime, `find_ffmpeg()`:
   - Primero intenta extraer el binario embebido a `{temp_dir}/RenderCanvasToVideo/ffmpeg`
   - Si no está embebido, busca en PATH rutas comunes del sistema
   - Como último recurso, `which`/`where`
4. Si no encuentra FFmpeg, muestra error con instrucciones de instalación según el SO.

**CI**: Los workflows descargan FFmpeg estático y lo colocan en `src-tauri/binaries/` **antes** de `cargo build` / `npx tauri build`. El binario se embeberá automáticamente en el .exe.

Fuentes de descarga por plataforma:
- **Linux**: `johnvansickle.com` (static build)
- **Windows**: `gyan.dev` (release essentials)
- **macOS**: `brew install ffmpeg` (no se embeberá a menos que se copie manualmente a `binaries/`)

### GitHub Actions

**`.github/workflows/build.yml`** — CI en push a `refactor-vanilla`/`main`:
- Solo Windows
- Descarga FFmpeg + `npx tauri build --no-bundle` → sube .exe portable como artifact

**`.github/workflows/release.yml`** — Release al pushear tag `v*`:
- Solo Windows
- `npx tauri build --no-bundle` → sube .exe portable a GitHub Release
- Usa `softprops/action-gh-release@v2`

### Release actual

- Tag: `v0.3.0`
- Binario release: `target/release/rendercanvastovideo` (~91MB con FFmpeg embebido)
- FFmpeg embebido via `include_bytes!` → extraído a `$TMPDIR/RenderCanvasToVideo/ffmpeg`
- Para hacer release: pushear tag `v*` → GitHub Actions construye y publica (solo Windows)

## Implementación completada (jul 2026)

### Cambios realizados

| Archivo | Cambio |
|---|---|
| `src-tauri/tauri.conf.json` | `removeUnusedCommands: true` → `false` (Tauri elimina comandos de vanilla JS si no los detecta) |
| `src-tauri/tauri.conf.json` | `bundle.active: false` (portable sin instalador) |
| `.github/workflows/build-windows.yml` | `npx tauri build` → `npx tauri build --no-bundle` |
| `src-tauri/capabilities/default.json` | Eliminado `dialog:allow-open` redundante |
| `public/app.js` | `openDialog()` simplificado a solo `invoke('plugin:dialog|open', ...)` |
| `src-tauri/src/capture.rs` | Capture script ya no sobreescribe `Date.now`/`performance.now` globalmente; ahora solo temporalmente durante el callback de animación. Soporta múltiples callbacks RAF en cola. |
| `src-tauri/src/queue.rs` | `renders/` ahora usa `app.path().app_data_dir()` en vez de `std::env::current_dir()` |
| `.github/workflows/build.yml` | Eliminados jobs Linux y macOS; solo Windows |
| `src-tauri/binaries/ffmpeg` | FFmpeg 7.0.2 estático descargado (77MB) |
| `public/app.js` | `invoke('plugin:dialog|open', options)` → `invoke('plugin:dialog|open', { options })` |
| `.github/workflows/release.yml` | Añadido `permissions: contents: write` para crear GitHub Release |

### Binario compilado
- Con FFmpeg embebido: **91MB** (antes 15MB sin FFmpeg)
- Compilación exitosa sin errores (solo 2 warnings menores)

### README

Reescrito para ser amigable al usuario final: menos técnico, más directo, instrucciones simplificadas, sección de descarga para todas las plataformas.

---

## Refactor render pipeline — ventana oculta + HTTP POST (jul 2026)

### Problema

En Windows, al iniciar un render:
1. Se abría brevemente una ventana (flash) causada por `WebviewWindowBuilder::new()` que creaba una ventana del SO antes de que `.hide()` surtiera efecto
2. Los frames viajaban por HTTP POST al ProjectServer (latencia innecesaria)

### Solución

#### Ventana pre-definida (sin flash)

La ventana `render-capture` se define en `tauri.conf.json` con `visible: false`:
```json
{
  "label": "render-capture",
  "visible": false,
  "width": 1,
  "height": 1,
  "resizable": false,
  "decorations": false,
  "skipTaskbar": true
}
```

Tauri la crea al iniciar la app pero el SO nunca la muestra porque nace oculta. En `capture.rs`, en vez de crear una ventana dinámicamente, se obtiene por label con `app.get_webview_window("render-capture")` y se navega a la URL del proyecto con `.navigate()`.

#### Frame transfer: HTTP POST (no IPC)

Las URLs externas cargadas en la webview (`http://127.0.0.1:PORT`) **no tienen acceso a `window.__TAURI__`** — el IPC de Tauri no se inyecta en páginas de origen remoto. Por eso los frames se envían mediante `fetch('POST /_tauri/send_frame')` al servidor HTTP del proyecto (ProjectServer), que escribe los PNG directamente al stdin de FFmpeg.

#### close_capture_webview

Ya no cierra la ventana (vive siempre, oculta), sino que navega a `about:blank` para detener la ejecución del script de captura.

#### FFmpeg multiplataforma

`build.rs` detecta tanto `ffmpeg.exe` como `ffmpeg` en `binaries/` y expone el nombre vía `env!("FFMPEG_BIN_NAME")`. `ffmpeg.rs` usa esa variable para el `include_bytes!`, funcionando correctamente en Windows y Linux.

### Cambios

| Archivo | Cambio |
|---|---|
| `src-tauri/tauri.conf.json` | Agregada ventana `render-capture` con `visible: false` + label explícito `"main"` |
| `src-tauri/src/capture.rs` | Reescribito: usar ventana pre-definida, navegar con `.navigate()`, script usa `fetch('/_tauri/send_frame')`, `close_capture_webview` navega a `about:blank` |
| `src-tauri/src/server.rs` | `ProjectServer::start` recibe `app`/`job_id`/`total_frames` otra vez; restaurados endpoints HTTP `_tauri/send_frame` y `_tauri/finalize_render` |
| `src-tauri/src/queue.rs` | Pasa `app`/`job_id`/`total_frames` a `ProjectServer::start` |
| `src-tauri/build.rs` | Detecta `ffmpeg.exe` o `ffmpeg`; expone `FFMPEG_BIN_NAME` |
| `src-tauri/src/ffmpeg.rs` | `include_bytes!` usa `env!("FFMPEG_BIN_NAME")` |
| `src-tauri/src/admin_api.rs` | `#[allow(dead_code)]` en campo `jsonrpc` |

### Arquitectura final del pipeline de render

```
App UI (main window)
  ↓ invoke('render_project')
QueueProcessor
  ├─ ProjectServer::start()      → sirve archivos del proyecto en 127.0.0.1:PORT
  ├─ FfmpegProcess::spawn()       → ffmpeg -f image2pipe -i - (espera stdin)
  └─ create_capture_webview()
       ├─ get_webview_window("render-capture")  → ventana oculta pre-creada
       ├─ navigate(project_url)                  → carga página del proyecto
       └─ eval(capture_script)                   → inyecta script de captura
            ├─ fetch('POST /_tauri/send_frame')  → escribe PNG a FFmpeg stdin
            └─ fetch('POST /_tauri/finalize_render') → cierra stdin, espera FFmpeg
```

---

## Plan de implementación — Bugs del autoejecutable (jul 2026)

### Problemas identificados y soluciones

| # | Problema | Archivo | Solución |
|---|---|---|---|
| 1 | No se genera instalador | `tauri.conf.json:26` | `bundle.active` → `true` |
| 2 | FFmpeg no embebido | `binaries/` solo `.gitkeep` | Descargar FFmpeg estático a `binaries/ffmpeg` |
| 3 | `openDialog()` con rama rota | `public/app.js:142-153` | Simplificar a solo `invoke('plugin:dialog|open', ...)` |
| 4 | Permiso `dialog:allow-open` redundante | `capabilities/default.json` | Eliminar duplicado |
| 5 | Capture script sobreescribe globals | `capture.rs` | No mutar `Date.now`/`performance.now`/`requestAnimationFrame` nativos |
| 6 | `renders/` en CWD inestable | `queue.rs:81-83` | Usar `app_data_dir` en vez de `current_dir()` |

### Orden de implementación

1. **Config**: `tauri.conf.json` (bundle.active, removeUnusedCommands)
2. **Capabilities**: limpiar permisos
3. **Frontend**: simplificar `openDialog()`
4. **FFmpeg**: descargar binario estático y embeber
5. **Rust queue**: usar `app_data_dir` para renders
6. **Capture**: reescribir script sin mutar globals nativas

---

## Notas importantes

1. **`withGlobalTauri: true`** es OBLIGATORIO para que `window.__TAURI__` esté disponible sin npm.
2. **CSP**: Si hay problemas con fuentes de Google, incluir `style-src 'self' https://fonts.googleapis.com` y `font-src 'self' https://fonts.gstatic.com` en el meta tag CSP del HTML.
3. **Tamaño de binario**: `cargo build --release` produce un binario más pequeño pero tarda más en compilar.
4. **El MCP se integra**: Cuando se ejecuta con `--mcp`, el binario actúa como servidor MCP sin abrir ventana. Cuando se ejecuta sin argumentos, muestra la UI normal.
5. **Presets**: Copiar exactamente desde `src/components/RenderForm.tsx` línea 6 a 36 para mantener compatibilidad.
6. **El diálogo de carpeta**: En vanilla JS se usa `window.__TAURI__.dialog.open()` o `invoke('plugin:dialog|open', ...)`. Consultar documentación de `@tauri-apps/plugin-dialog` para el API exacto sin npm (usando `withGlobalTauri`).
7. **FFmpeg embebido**: La app extrae el binario de FFmpeg desde dentro del .exe a `$TMPDIR/RenderCanvasToVideo/ffmpeg` al primer uso. Si no está embebido (desarrollo local sin binario en `binaries/`), busca en PATH. En CI se descarga automáticamente antes de compilar y queda incrustado en el .exe.
8. **Release multiplataforma**: `continue-on-error: true` permite que el release se publique aunque una plataforma falle. Los artifacts se descargan con `merge-multiple: true`.
