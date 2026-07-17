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
  "version": "0.2.3",
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

## Notas importantes

1. **`withGlobalTauri: true`** es OBLIGATORIO para que `window.__TAURI__` esté disponible sin npm.
2. **CSP**: Si hay problemas con fuentes de Google, incluir `style-src 'self' https://fonts.googleapis.com` y `font-src 'self' https://fonts.gstatic.com` en el meta tag CSP del HTML.
3. **Tamaño de binario**: `cargo build --release` produce un binario más pequeño pero tarda más en compilar.
4. **El MCP se integra**: Cuando se ejecuta con `--mcp`, el binario actúa como servidor MCP sin abrir ventana. Cuando se ejecuta sin argumentos, muestra la UI normal.
5. **Presets**: Copiar exactamente desde `src/components/RenderForm.tsx` línea 6 a 36 para mantener compatibilidad.
6. **El diálogo de carpeta**: En vanilla JS se usa `window.__TAURI__.dialog.open()` o `invoke('plugin:dialog|open', ...)`. Consultar documentación de `@tauri-apps/plugin-dialog` para el API exacto sin npm (usando `withGlobalTauri`).
