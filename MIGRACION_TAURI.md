# Plan de Migración: RenderCanvasToVideo → Tauri v2 + React + TypeScript

## Objetivo

Migrar la aplicación de escritorio **RenderCanvasToVideo** de **Electron + Express + Puppeteer** a **Tauri v2 + React + TypeScript + Rust** para aprovechar:
- Multi-threading en Rust (`rayon`, `tokio`, `std::thread`)
- GPU nativa via WebView del SO (sin bundlear Chromium ~300MB)
- Binarios mucho más livianos (~5MB vs ~150MB+)
- Tipado fuerte con TypeScript + Rust

---

## Estado del proyecto (rama `migracion-tauri-react`)

### 📁 Estructura del repositorio

```
RenderCanvasToVideo/
├── .github/workflows/build.yml    ← CI: builds en Win/Mac/Linux + tests
├── public/                        ← ORIGINAL: frontend Electron (HTML+JS+CSS)
├── main.js                        ← ORIGINAL: entry point Electron
├── server.js                      ← ORIGINAL: Express server (API REST + Puppeteer + FFmpeg)
├── preload.js                     ← ORIGINAL: preload Electron
├── mcp-server.js                  ← ORIGINAL: MCP server para IA
├── renderCanvasCLI/               ← ORIGINAL: CLI Python
├── tests/                         ← ORIGINAL: tests Node + Python
├── proyectos/                     ← ORIGINAL: proyectos canvas subidos
├── renders/                       ← ORIGINAL: videos renderizados
├── scripts/                       ← ORIGINAL: scripts de instalación
├── node_modules/                  ← ORIGINAL: deps Node.js
│
├── src/                           ← NUEVO: frontend React
│   ├── main.tsx                   ← Entry point React
│   ├── App.tsx                    ← Componente raíz (RenderForm + ProgressBar + LogViewer + RenderCapture)
│   ├── App.css
│   ├── index.css                  ← Variables CSS
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── DropZone.tsx           ← Selector de carpeta con @tauri-apps/plugin-dialog
│   │   ├── RenderForm.tsx         ← Formulario con presets, codecs, fps, resolución (usa invoke)
│   │   ├── ProgressBar.tsx        ← Barra de progreso + estado + eventos Tauri
│   │   ├── LogViewer.tsx          ← Panel de logs colapsable con invoke
│   │   └── RenderCapture.tsx      ← Iframe oculto + captura de frames vía postMessage
│   ├── hooks/
│   │   └── useRenderStatus.ts     ← Hook con eventos Tauri + polling fallback
│   └── types/
│       └── index.ts               ← Tipos compartidos (RenderParams, RenderStatus, LogEntry, etc.)
│
├── src-tauri/                     ← NUEVO: backend Rust
│   ├── Cargo.toml                 ← Dependencias: tauri 2, tokio, anyhow, base64, tiny_http, chrono, etc.
│   ├── Cargo.lock
│   ├── build.rs
│   ├── tauri.conf.json            ← Ventana 740x380, CSP null, bundle config
│   ├── capabilities/default.json  ← Permisos: core, shell, dialog, fs
│   ├── icons/                     ← Iconos placeholder (naranja #ff4800)
│   └── src/
│       ├── main.rs                ← Entry point (cfg_attr windows_subsystem)
│       ├── lib.rs                 ← Commands Tauri (todos retornan Result<T, String>)
│       ├── ffmpeg.rs              ← FFmpeg subprocess: spawn, write_frame, close_stdin, wait, kill, stderr capture
│       ├── server.rs              ← Servidor HTTP embebido (tiny_http) con shutdown signal + url_decode completo
│       ├── state.rs               ← AppState, ActiveJob (con server_shutdown flag), JobInfo, RenderParams, LogEntry
│       ├── capture.rs             ← WebviewWindow oculta para captura nativa de canvas
│       └── queue.rs               ← QueueProcessor: background tokio task para cola de renders
│
├── index.html                     ← NUEVO: entry point Vite
├── vite.config.ts                 ← NUEVO: Vite config (puerto 1420, HMR)
├── tsconfig.json
├── tsconfig.node.json
└── package.json                   ← MODIFICADO: deps Tauri + React + @tauri-apps/plugin-dialog + plugin-fs
```

---

## Dependencias

### 🔧 Node.js (package.json)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

### 🦀 Rust (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
tiny_http = "0.12"
chrono = { version = "0.4", features = ["serde"] }
```

---

## Lo que funciona ahora mismo

### ✅ Frontend React
- `npx tsc --noEmit` → **0 errores**
- `npm run build:vite` → **build exitoso**
- Componentes implementados:
  - **DropZone**: Selector de carpeta con `@tauri-apps/plugin-dialog` (reemplaza upload vía fetch)
  - **RenderForm**: Selector de presets (HD, 4K, HAP, CineForm, HEVC), perfil de color, inputs de resolución/fps/duración. Usa `invoke('render_project')` en vez de fetch
  - **ProgressBar**: Barra de progreso, estado, link de descarga. Escucha eventos Tauri
  - **LogViewer**: Logs colapsables con `invoke('get_logs')` cada 1s
  - **RenderCapture**: Componente oculto que crea un iframe, captura frames vía postMessage, y los envía a Rust con `invoke('send_frame')`
  - **useRenderStatus**: Hook con eventos Tauri (`render-started`, `render-progress`, `render-done`) + polling fallback

### ✅ Backend Rust
- Módulos separados: `lib.rs`, `ffmpeg.rs`, `server.rs`, `state.rs`, `capture.rs`, `queue.rs`
- Commands Tauri implementados (todos con `Result<T, String>`, sin `unwrap()`):
  - `get_status` → `Result<Vec<JobInfo>, String>`
  - `get_logs` → `Result<LogResponse, String>`
  - `render_project` → `Result<String, String>` (jobId)
  - `send_frame` → emite `render-progress` cada 10%, recibe base64, escribe a stdin de FFmpeg
  - `finalize_render` → cierra stdin, espera FFmpeg, signal de shutdown al server, emite `render-done`
  - `cancel_render` → señal de shutdown al server, mata FFmpeg, emite `render-done`
  - `remove_job` → elimina job por jobId
  - `clear_completed` → `Result<String, String>`
  - `get_project_url` → `Result<Option<String>, String>`
- **Servidor HTTP embebido** (tiny_http): sirve archivos del proyecto en puerto dinámico con shutdown vía `Arc<AtomicBool>` + `recv_timeout(500ms)`. Sin fuga de threads.
- **FFmpeg subprocess**: spawn con pipe de stdin, stderr capturado (disponible via `stderr_string()`)
- **Estado global**: AppState con `std::sync::Mutex`, cola de jobs (`Vec<ActiveJob>`), buffer de logs (2000 entries)
- **Compilación**: `cargo check --lib` → **0 errores**

### ✅ Pipeline de post-procesamiento (Fase 5)
- `RenderParams.filters`: filtros FFmpeg vía `-vf` (scale, format, overlays, color grading, etc.)
- `RenderParams.hwaccel`: aceleración hardware (`cuda`, `vaapi`, `videotoolbox`, `dxva2`, `qsv`)
- 9 presets HW: NVENC, VAAPI, VideoToolbox en H.264 y HEVC
- Se mantiene subprocess FFmpeg (se descartó `ffmpeg-next` por complejidad cross-platform)

### ⚠️ Issues de seguridad conocidos (postergados para producción)
- `tauri.conf.json` CSP = `null` — desactiva protección XSS. Ajustar antes de Fase 7.

### ✅ CI/CD (GitHub Actions)
- Archivo: `.github/workflows/build.yml`
- Jobs: frontend (Vite), tauri (Rust), tests-node, tests-python
- Linux instala system deps
- Rust cache con `swatinem/rust-cache`
- Upload de artefactos

### ❌ Pendiente local (no crítico, el CI lo resuelve)
```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  librsvg2-dev libsoup-3.0-dev patchelf libjavascriptcoregtk-4.1-dev
```

---

## Plan de migración completo

### Fase 1 ✅ COMPLETADA — Scaffolding Tauri + React
- Crear rama `migracion-tauri-react`
- Inicializar Tauri v2 + React + TypeScript + Vite
- Crear componentes React equivalentes al frontend actual
- Esbozar commands Rust (sin implementación real)
- Configurar GitHub Actions CI

### Fase 2 ✅ COMPLETADA — Pipeline de render (frontend + backend)
Backend Rust:
- [x] Separar en módulos: `ffmpeg.rs`, `server.rs`, `state.rs`
- [x] Servidor HTTP embebido (tiny_http) que sirve proyectos e inyecta script de captura via postMessage
- [x] FFmpeg subprocess management: spawn, write_frame, close_stdin, wait, kill
- [x] `send_frame` command: recibe frame base64, decodifica, escribe a stdin de FFmpeg
- [x] `finalize_render` command: cierra stdin, espera FFmpeg, emite `render-done`
- [x] `cancel_render` command: mata FFmpeg mediante cancel_flag atómico
- [x] Estado global con `std::sync::Mutex` + cancel_flag atómico
- [x] Manejo de errores con `anyhow` + `Result<String, String>` en commands
- [x] Eventos Tauri: `render-started`, `render-progress`, `render-done`

Frontend React:
- [x] DropZone: selector de carpeta con `@tauri-apps/plugin-dialog`
- [x] RenderForm: `invoke('render_project')` en lugar de `fetch('/api/render')`
- [x] Cancel/Reset: `invoke('cancel_render')` / `invoke('reset_render_status')`
- [x] useRenderStatus: escucha eventos Tauri + polling fallback con `invoke('get_status')`
- [x] ProgressBar: eventos Tauri en lugar de polling
- [x] LogViewer: `invoke('get_logs')` en lugar de `fetch('/api/logs')`
- [x] RenderCapture: iframe oculto + captura de frames via postMessage + `invoke('send_frame')`

### Fase 3 ✅ COMPLETADA — Captura de canvas nativa (sin Puppeteer)

**Estado actual:** La captura se maneja desde Rust con una `WebviewWindow` oculta que carga el proyecto y recibe comandos via `webview.eval()`. El script de captura inyectado llama a `window.__TAURI__.core.invoke('send_frame')` directamente, eliminando el bridge postMessage + React.

**Cambios realizados:**
- [x] Crear `capture.rs`: módulo Rust que gestiona la webview oculta
- [x] `create_capture_webview()`: crea `WebviewWindow` off-screen con `WebviewWindowBuilder`
- [x] `close_capture_webview()`: cierra la webview al finalizar/cancelar
- [x] Script de captura inyectado via `webview.eval()` con 1.5s de delay para carga
- [x] El script usa `window.__TAURI__.core.invoke('send_frame')` directamente (sin postMessage)
- [x] `server.rs` simplificado: ya no inyecta script, solo sirve archivos
- [x] `RenderCapture.tsx` simplificado: ya no crea iframe, solo muestra badge de estado
- [x] `state.rs` + `lib.rs`: limpieza de webview al hacer `cancel`/`finalize`/`reset`
- [x] `capabilities/default.json`: incluye `"render-capture"` para acceso a IPC
- [x] Soporte WebGL: captura via `gl.readPixels()` con corrección RGBA↔BGRA
- [x] Soporte WebGPU: fallback a `drawImage` + `toDataURL`
- [x] Soporte canvas 2D: `drawImage` + `toDataURL` (base64 PNG)

### Fase 4 ✅ COMPLETADA — Multi-proyecto y cola de renders

**Cambios realizados (implementación original):**
- [x] Crear `queue.rs`: procesador background con `tokio::spawn` que revisa la cola cada 500ms
- [x] `next_queued_job()`: selecciona jobs "queued" y los transiciona a "rendering"
- [x] Jobs con UUID: cada `render_project` crea un `JobInfo` con id único, status "queued"
- [x] `send_frame(jobId, ...)` y `finalize_render(jobId)`: operan sobre el job específico
- [x] `cancel_render(jobId)`: cancela un job específico (no el global)
- [x] `remove_job(jobId)`: elimina jobs completados/error/cancelled de la lista
- [x] `clear_completed()`: limpia todos los jobs finalizados
- [x] `ActiveJob` en `state.rs`: cada job tiene su propio `FfmpegProcess`, `cancel_flag`, `server_shutdown`
- [x] Procesamiento secuencial: un render a la vez (configurable via `max_concurrent`)
- [x] Frontend `ProgressBar.tsx`: lista de jobs con barra de progreso, botones cancelar/eliminar
- [x] Frontend `useRenderQueue.ts`: polling cada 2s + eventos `render-started`/`render-done`/`render-progress`
- [x] `RenderForm.tsx`: ya no bloquea por "rendering", siempre añade a cola

**Fixes aplicados (consolidación de Fase 4):**
- [x] **`render-progress`**: evento ahora se emite desde `send_frame` cada ~10% de avance (antes documentado pero nunca emitido). Payload: `{ jobId, frame, total, progress }`.
- [x] **Server shutdown**: `ProjectServer` ahora acepta `Arc<AtomicBool>` de shutdown. El loop usa `recv_timeout(500ms)` en vez de `incoming_requests()` bloqueante. `finalize_render`/`cancel_render` señalizan shutdown. Sin fuga de threads/puertos.
- [x] **`unwrap()` eliminados**: `get_status`, `get_logs`, `clear_completed`, `get_project_url` ahora retornan `Result<T, String>` con `map_err` en vez de `unwrap()`.
- [x] **URL decoding completo**: `url_decode()` reemplazó al `urlencoding()` parcial (solo 3 caracteres). Ahora decodifica cualquier `%XX` correctamente.
- [x] **FFmpeg stderr**: stderr redirigido a `Stdio::piped()` (antes `null`) y capturado via `FfmpegProcess::stderr_string()`. Disponible para debugging.
- [x] **Listener frontend**: `useRenderQueue` escucha `render-progress` además de `render-started`/`render-done`.

### Fase 5 ✅ COMPLETADA — Pipeline de post-procesamiento y aceleración HW

**Decisión arquitectónica:** Se mantiene **spawn de subprocess FFmpeg** (no `ffmpeg-next`). Motivos:
- El pipe `image2pipe` vía stdin es eficiente (el cuello de botella es el encoding, no IPC)
- `ffmpeg-next` requiere linking con libavcodec en build-time, añadiendo complejidad cross-platform
- La API CLI de FFmpeg ya expone todas las features (filtros, codecs, hwaccel) sin necesidad de binding Rust
- Mantener subprocess permite actualizar FFmpeg independientemente sin recompilar la app

**Cambios realizados:**
- [x] `RenderParams.filters: Option<String>` — filtros FFmpeg vía `-vf` (scale, format, overlays, etc.)
- [x] `RenderParams.hwaccel: Option<String>` — aceleración HW: `cuda`, `vaapi`, `videotoolbox`, `dxva2`, `qsv`
- [x] `ffmpeg.rs::spawn()` acepta `hwaccel` opcional, lo pasa como `-hwaccel` antes del input
- [x] `build_extra_args()` añade `-vf` con el filter graph si `filters` no está vacío
- [x] Frontend `RenderForm.tsx`: sección colapsable "Opciones avanzadas" con input de filtros y selector HW
- [x] 9 nuevos presets con aceleración HW: NVENC (h264/hevc), VAAPI (h264/hevc), VideoToolbox (h264/hevc)
- [x] Logging de filtros y hwaccel en cola de renders

### Fase 6 PENDIENTE — Migración del MCP Server
- [ ] Migrar `mcp-server.js` a un comando Tauri o crate Rust separado
- [ ] Mantener compatibilidad con el protocolo MCP
- [ ] Exponer herramientas: `render_canvas`, `get_render_status`, `list_projects`, etc.

### Fase 7 PENDIENTE — Empaquetado y distribución
- [ ] Configurar `tauri build` para producir instaladores
- [ ] Code signing
- [ ] Auto-updater con `tauri-plugin-updater`
- [ ] Probar instalación limpia en los 3 SO

---

## API de commands Tauri (contrato Frontend ↔ Backend)

> Todos los commands retornan `Result<T, String>`. Tauri v2 unwrappa el `Ok()` automáticamente; en caso de `Err()`, la Promise se rechaza y debe capturarse con `try/catch`.

### `render_project`
```typescript
invoke('render_project', { params: RenderParams })
// → string (jobId del render encolado)
```

### `send_frame`
```typescript
invoke('send_frame', { jobId: string, data: string, frame: number, total: number })
// → "OK"
// Emite evento "render-progress" cada ~10%
```

### `finalize_render`
```typescript
invoke('finalize_render', { jobId: string })
// → "Render completado"
// Cierra FFmpeg stdin + wait, señaliza shutdown del server, emite "render-done"
```

### `cancel_render`
```typescript
invoke('cancel_render', { jobId: string })
// → "Render cancelado"
// Señaliza shutdown del server, mata FFmpeg, emite "render-done"
```

### `remove_job`
```typescript
invoke('remove_job', { jobId: string })
// → "Job {id} eliminado"
```

### `clear_completed`
```typescript
invoke('clear_completed')
// → "Completados eliminados"
```

### `get_status`
```typescript
invoke('get_status')
// → JobInfo[]  (lista completa de jobs)
```

### `get_logs`
```typescript
invoke('get_logs', { since: number })
// → LogResponse { logs: LogEntry[], total: number }
```

### `get_project_url`
```typescript
invoke('get_project_url', { jobId: string })
// → string | null  (URL del servidor del proyecto)
```

---

## Flujo de datos (Fase 4 actual - cola de renders)

```
React (UI)
  │ invoke('render_project', params)
  ▼
Rust (render_project command)
  └─ Crea JobInfo con status="queued", UUID, añade a AppState.jobs
        │
        ▼
Rust (QueueProcessor - background tokio task, cada 500ms)
  ├─ next_queued_job() → encuentra job con status="queued"
  ├─ Marca job como "rendering"
  ├─ Inicia ProjectServer (tiny_http, puerto dinámico)
  ├─ Spawnea FFmpeg subprocess (stdin pipe)
  ├─ Crea hidden WebviewWindow → inyecta capture script via eval
  └─ Emite evento "render-started" → { jobId, projectUrl, totalFrames, ... }
        │
        ▼
Hidden Webview (capture script inyectado via eval)
  ├─ Avanza frame a frame (setTimeout + rAF override)
  ├─ Por cada frame:
  │     invoke('send_frame', { jobId, data, frame, total })  ← IPC directo
  │
  └─ Al completar:
        invoke('finalize_render', { jobId })
              │
              ▼
Rust (send_frame / finalize_render)
  ├─ send_frame: busca job por jobId → decodifica base64 → stdin FFmpeg
  │               → emite "render-progress" cada ~10%
  ├─ finalize_render: close_stdin() → wait() → shutdown server → cierra capture webview
  │                   → job.status="done" → emite "render-done"
  └─ cancel_render: shutdown server → mata FFmpeg → job.status="cancelled" → emite "render-done"
        │
        ▼
React (useRenderQueue - polling cada 2s + eventos)
  ├─ Escucha "render-started" → refreshJobs()
  ├─ Escucha "render-progress" → refreshJobs()
  ├─ Escucha "render-done" → refreshJobs()
  └─ ProgressBar muestra lista de jobs con progreso y acciones
        │
        ▼
QueueProcessor (automático)
  └─ Detecta que el job actual terminó → busca próximo "queued"
```

---

## Eventos Tauri (comunicación Rust → Frontend)

| Evento | Payload | Disparo |
|---|---|---|
| `render-started` | `{ jobId, projectUrl, totalFrames, fps, width, height, projectName }` | QueueProcessor cuando inicia el job |
| `render-progress` | `{ jobId, frame, total, progress }` | send_frame (cada ~10% o frame final) |
| `render-done` | `JobInfo` (completo) | finalize_render o cancel_render |

---

## Archivos clave del proyecto

### Rust (`src-tauri/src/`)
| Archivo | Descripción |
|---|---|
| `lib.rs` | Entry point Tauri, registro de 9 commands, todos retornan `Result<T, String>` |
| `ffmpeg.rs` | `FfmpegProcess`: spawn, write_frame, close_stdin, wait, kill, `stderr_string()` |
| `capture.rs` | Captura nativa: crea WebviewWindow oculta, inyecta script via eval, cierra al finalizar |
| `queue.rs` | `QueueProcessor`: background tokio task (cada 500ms), procesa cola, gestiona ciclo de vida del server |
| `server.rs` | `ProjectServer`: tiny_http con shutdown signal (`Arc<AtomicBool>`), `url_decode()` completo |
| `state.rs` | `AppState`, `ActiveJob` (con `server_shutdown`), `JobInfo`, `RenderParams`, `LogEntry` |

### Frontend (`src/`)
| Archivo | Descripción |
|---|---|
| `components/DropZone.tsx` | Selector de carpeta con `@tauri-apps/plugin-dialog` |
| `components/RenderForm.tsx` | Formulario de render, llama a `invoke('render_project')` |
| `components/ProgressBar.tsx` | Lista de jobs en cola con progreso individual y botones cancelar/eliminar |
| `components/LogViewer.tsx` | Panel de logs con `invoke('get_logs')` cada 1s |
| `components/RenderCapture.tsx` | Badge de estado de captura (la captura se maneja desde Rust) |
| `hooks/useRenderQueue.ts` | Hook con polling cada 2s + eventos `render-started`/`render-progress`/`render-done` |
| `types/index.ts` | Tipos compartidos TypeScript (JobInfo, RenderParams, etc.) |

---

## Notas para el desarrollador

### Para compilar localmente (Linux)
```bash
# System deps (requerido para Tauri en Linux)
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  librsvg2-dev libsoup-3.0-dev patchelf libjavascriptcoregtk-4.1-dev

# Frontend
npm run dev:vite          # Servidor de desarrollo en :1420

# Tauri (dev con hot-reload)
npm run tauri:dev         # Lanza ventana Tauri + Vite

# Tauri (build producción)
npm run tauri:build

# Solo Rust (sin frontend)
cargo check --manifest-path src-tauri/Cargo.toml
```

### Para compilar en Windows / macOS
```bash
npm run tauri:dev    # No necesita system deps extra
```

### Verificación
```bash
# TypeScript
npx tsc --noEmit

# Rust
PKG_CONFIG_PATH=/home/flwr/tauri-pc:$PKG_CONFIG_PATH cargo check --lib

# Ambos deben dar 0 errores
```

---

## Resumen de lo que queda

| Fase | Estado | Descripción |
|---|---|---|
| **Fase 1** | ✅ COMPLETADA | Scaffolding Tauri + React + CI |
| **Fase 2** | ✅ COMPLETADA | Pipeline de render (iframe + invoke + FFmpeg subprocess) |
| **Fase 3** | ✅ COMPLETADA | Captura de canvas nativa (WebviewWindow oculta + eval + IPC directo) |
| **Fase 4** | ✅ COMPLETADA | Cola de renders multi-proyecto (QueueProcessor + bugs corregidos) |
| **Fase 5** | ✅ COMPLETADA | Pipeline de post-procesamiento y aceleración HW |
| **Fase 6** | ⏳ PENDIENTE | Migración MCP Server |
| **Fase 7** | ⏳ PENDIENTE | Empaquetado y distribución |

---

## Últimos fixes aplicados (Junio 2026)

Los siguientes issues fueron detectados en revisión de código y corregidos para consolidar la Fase 4:

| Issue | Solución |
|---|---|
| `unwrap()` en 4 commands → podían panicear | Reemplazados por `map_err` + `Result<T, String>` |
| `render-progress` documentado pero nunca emitido | Emitido desde `send_frame` cada ~10% |
| `ProjectServer` sin shutdown → fuga de threads/puertos | `Arc<AtomicBool>` + `recv_timeout(500ms)` + señal en `finalize`/`cancel` |
| `urlencoding()` solo decodificaba 3 caracteres | `url_decode()` con percent-decoding completo |
| FFmpeg stderr redirigido a `null` | Cambiado a `Stdio::piped()` + `stderr_string()` |
| Frontend no escuchaba `render-progress` | Listener agregado en `useRenderQueue.ts` |

> **Próximo paso recomendado:** Fase 7 (empaquetado y distribución — empezar por ajustar CSP en `tauri.conf.json`) o Fase 6 (migración del MCP Server).
