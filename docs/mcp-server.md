# MCP Server — RenderCanvasToVideo

## Visión General

`mcp-server.js` expone el motor de renderizado de canvas como **herramientas MCP (Model Context Protocol)**. Permite que asistentes de IA (Claude Desktop, Cursor, etc.) generen, inspeccionen y rendericen animaciones canvas directamente desde una conversación.

### Arquitectura

```
Cliente MCP (IA)
    │
    ├── stdio ──→ MCP Server (mcp-server.js)
    │                 │
    │                 ├── Motor de render (Puppeteer + FFmpeg)
    │                 ├── Servidor Express (puerto 3000)
    │                 │     ├── Sirve archivos de proyectos
    │                 │     ├── Sirve videos renderizados
    │                 │     └── API REST (/api/*)
    │                 │
    │                 └── 12 herramientas MCP
    │
    └── web/red ──→ Express sirve proyectos al navegador Chrome
```

### Requisitos

- Node.js 18+
- Puppeteer + Chromium (se instala automáticamente al iniciar)
- FFmpeg (se descarga a `bin/` vía `npm run install:ffmpeg`)
- Puerto 3000 disponible

---

## Configuración

### Inicio manual
```bash
node mcp-server.js
```

### Integración con Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "renderCanvasCLI": {
      "command": "node",
      "args": ["/ruta/completa/a/mcp-server.js"],
      "env": {
        "MCP_PORT": "3000"
      }
    }
  }
}
```

### Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MCP_PORT` | Puerto para el servidor Express | `3000` |
| `APP_ROOT` | Raíz de la aplicación | Directorio de `mcp-server.js` |
| `CHROME_CACHE_DIR` | Directorio de caché de Chromium | `{APP_ROOT}/.cache/puppeteer` |

---

## Herramientas MCP

### 1. `list_projects`

Lista los proyectos disponibles en el directorio `proyectos/`.

**Parámetros:** Ninguno

**Ejemplo de respuesta:**
```json
["particle-demo", "sample-animation", "test-anim"]
```

---

### 2. `render_canvas`

Renderiza una animación canvas a video MP4. Inicia el render y retorna inmediatamente. Usar `get_render_status` para monitorear el progreso.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `project` | `string` | No* | Nombre de la carpeta dentro de `proyectos/` |
| `width` | `number` | Sí | Ancho del video en píxeles |
| `height` | `number` | Sí | Alto del video en píxeles |
| `fps` | `number` | Sí | Cuadros por segundo |
| `duration` | `number` | Sí | Duración en segundos |
| `bgColor` | `string` | No | Color de fondo para píxeles transparentes (hex, ej: `#000000`) |
| `customOutputDir` | `string` | No | Directorio de salida personalizado |
| `customProjectPath` | `string` | No* | Ruta a una carpeta externa con `index.html` |

*Se requiere `project` o `customProjectPath`.

**Ejemplo de respuesta:**
```json
{
  "message": "Render started",
  "fileName": "Render_mi-proyecto_1712345678901.mp4",
  "project": "mi-proyecto",
  "totalFrames": 600,
  "statusUrl": "Use get_render_status to check progress"
}
```

---

### 3. `get_render_status`

Consulta el estado del render en curso.

**Parámetros:** Ninguno

**Ejemplo de respuesta (renderizando):**
```json
{
  "state": "rendering",
  "progress": 120,
  "total": 600,
  "fileUrl": null,
  "error": null
}
```

**Ejemplo de respuesta (completado):**
```json
{
  "state": "done",
  "progress": 600,
  "total": 600,
  "fileUrl": "/renders/Render_mi-proyecto_1712345678901.mp4",
  "error": null
}
```

---

### 4. `get_project_files`

Lista todos los archivos de un proyecto con sus tamaños.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `project` | `string` | Sí | Nombre de la carpeta del proyecto |

**Ejemplo de respuesta:**
```json
[
  {
    "type": "file",
    "name": "index.html",
    "sizeBytes": 1234
  },
  {
    "type": "file",
    "name": "script.js",
    "sizeBytes": 5678
  },
  {
    "type": "file",
    "name": "style.css",
    "sizeBytes": 432
  }
]
```

---

### 5. `read_project_file`

Lee el contenido de un archivo específico dentro de un proyecto.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `project` | `string` | Sí | Nombre de la carpeta del proyecto |
| `file` | `string` | Sí | Ruta relativa del archivo (ej: `script.js`) |

**Respuesta:** Contenido textual del archivo.

---

### 6. `get_output_files`

Lista todos los videos renderizados con información de tamaño y fecha.

**Parámetros:** Ninguno

**Ejemplo de respuesta:**
```json
[
  {
    "name": "Render_mi-proyecto_1712345678901.mp4",
    "sizeBytes": 5242880,
    "sizeMB": "5.00",
    "created": "2026-05-13T18:30:00.000Z",
    "modified": "2026-05-13T18:30:05.000Z"
  }
]
```

---

### 7. `cancel_render`

Cancela el render en curso y reinicia el estado.

**Parámetros:** Ninguno

**Ejemplo de respuesta:**
```json
{
  "message": "Render cancelled"
}
```

---

### 8. `preview_frame`

Captura un frame individual del canvas como imagen PNG. Útil para previsualizar el estado de una animación antes de renderizar el video completo.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `project` | `string` | No | Nombre de la carpeta del proyecto |
| `width` | `number` | No | Ancho del viewport (default: 640) |
| `height` | `number` | No | Alto del viewport (default: 360) |
| `time` | `number` | No | Tiempo en milisegundos a capturar (default: 0) |
| `bgColor` | `string` | No | Color de fondo (hex) |
| `customProjectPath` | `string` | No | Ruta a proyecto externo |

**Respuesta:** Imagen PNG (base64, `mimeType: image/png`)

---

### 9. `get_system_info`

Diagnóstico completo del sistema: disponibilidad de Chrome y FFmpeg, versiones, rutas de caché.

**Parámetros:** Ninguno

**Ejemplo de respuesta:**
```json
{
  "platform": "linux",
  "arch": "x64",
  "nodeVersion": "v22.22.1",
  "chrome": {
    "ready": true,
    "path": "/.../chrome/linux-148.0.7778.97/chrome-linux64/chrome",
    "installed": [
      { "browser": "chrome", "platform": "linux", "buildId": "148.0.7778.97" }
    ]
  },
  "ffmpeg": {
    "path": "/.../bin/ffmpeg",
    "exists": true,
    "sizeMB": "76.1"
  },
  "appRoot": "/home/server/RenderCanvasToVideo",
  "port": 3000,
  "renderState": "idle"
}
```

---

### 10. `get_render_logs`

Obtiene los logs internos del servidor para depuración. El buffer se limpia al reiniciar el servidor.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `since` | `number` | No | Índice desde el cual obtener logs (0 = todos, default: 0) |

**Ejemplo de respuesta:**
```json
{
  "logs": [
    {
      "timestamp": "2026-05-13T18:30:00.000Z",
      "level": "log",
      "message": "═══ Render iniciado ═══"
    }
  ],
  "total": 42
}
```

---

### 11. `create_project`

Crea un nuevo proyecto canvas con sus archivos. Permite que la IA genere animaciones personalizadas desde cero.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `project` | `string` | Sí | Nombre de la nueva carpeta del proyecto |
| `files` | `array` | Sí | Array de objetos con `path` y `content` |
| `overwrite` | `boolean` | No | Sobrescribir si el proyecto ya existe (default: `false`) |

**Estructura de `files`:**
```json
[
  {
    "path": "index.html",
    "content": "<!DOCTYPE html>\n<html>..."
  },
  {
    "path": "script.js",
    "content": "const canvas = document.getElementById('c');"
  },
  {
    "path": "style.css",
    "content": "body { margin: 0; }"
  }
]
```

**Ejemplo de respuesta:**
```json
{
  "message": "Project \"mi-animacion\" created successfully",
  "project": "mi-animacion",
  "filesCreated": ["index.html", "script.js", "style.css"],
  "path": "/.../proyectos/mi-animacion",
  "totalFiles": 3
}
```

---

### 12. `get_video_file`

Recupera un archivo de video renderizado. Retorna la URL de descarga, la ruta local y, para archivos menores a 10 MB, el contenido en base64.

**Parámetros:**

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `fileName` | `string` | Sí | Nombre del archivo (ej: `Render_test-anim_1234.mp4`) |

**Ejemplo de respuesta:**
```json
{
  "fileName": "Render_test-anim_1712345678901.mp4",
  "filePath": "/.../renders/Render_test-anim_1712345678901.mp4",
  "downloadUrl": "http://localhost:3000/renders/Render_test-anim_1712345678901.mp4",
  "sizeBytes": 512000,
  "sizeMB": "0.49",
  "created": "2026-05-13T18:30:00.000Z",
  "contentBase64": "AAAAIGZ0eXBpc29tAAACAGlzb21p..."
}
```

> **Nota:** Archivos mayores a 10 MB no incluyen `contentBase64`. Usar `downloadUrl` o `filePath` para acceder al archivo.

---

## API REST (Express)

Además del protocolo MCP, el servidor expone endpoints HTTP en el puerto 3000:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/projects` | `GET` | Lista proyectos disponibles |
| `/api/status` | `GET` | Estado del render |
| `/api/render` | `POST` | Iniciar render |
| `/api/health` | `GET` | Health check |
| `/proyectos/` | `GET` | Archivos estáticos de proyectos |
| `/renders/` | `GET` | Archivos de video renderizados |
| `/external-project/` | `GET` | Archivos de proyecto externo |

---

## Flujo de trabajo típico

### 1. Explorar y crear un proyecto

```
list_projects()
  → ["particle-demo", "test-anim"]

create_project(
  project: "mi-figura",
  files: [
    { path: "index.html", content: "<canvas id='c'></canvas><script src='script.js'></script>" },
    { path: "script.js", content: "const c = document.getElementById('c'); const ctx = c.getContext('2d'); function draw(t) { ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='red'; ctx.fillRect(200+Math.sin(t/500)*100,150,100,100); }" }
  ]
)
```

### 2. Previsualizar un frame

```
preview_frame(project: "mi-figura", time: 500)
  → PNG de la animación en t=500ms
```

### 3. Renderizar a video

```
render_canvas(project: "mi-figura", width: 640, height: 360, fps: 30, duration: 5)
  → { message: "Render started", fileName: "Render_mi-figura_....mp4" }

get_render_status()
  → { state: "done", progress: 150, total: 150, fileUrl: "/renders/Render_mi-figura_....mp4" }
```

### 4. Obtener el video

```
get_video_file(fileName: "Render_mi-figura_....mp4")
  → { downloadUrl: "http://localhost:3000/renders/Render_mi-figura_....mp4", ... }
```

---

## Solución de problemas

### El render no inicia
Usar `get_system_info` para verificar que Chrome y FFmpeg estén disponibles. Si Chrome no está listo, esperar a que termine la instalación automática.

### La página del proyecto no carga
Usar `get_project_files` para verificar que los archivos existen. Asegurarse de que `index.html` contenga un elemento `<canvas>`.

### Error de conexión con el servidor
Revisar `get_render_logs` para ver el error interno. El MCP usa `page.goto` con fallback a `page.setContent` si la carga HTTP falla.
