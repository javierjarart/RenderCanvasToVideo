# RenderCanvasToVideo

Convierte animaciones HTML5 Canvas a video MP4/MOV.  
Captura frame por frame con Puppeteer + Chromium y las encadena con FFmpeg.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

---

## Descarga

**Windows:**  
[RenderCanvasToVideo.Setup.0.1.0.exe](https://github.com/javierjarart/RenderCanvasToVideo/releases/download/V.0.1.0/RenderCanvasToVideo.Setup.0.1.0.exe)

---

## Interfaces

### 1. Aplicación de escritorio (Electron)

```bash
npm install
npm start
```

### 2. CLI Python (`renderCanvasCLI`)

```bash
pip install -e .
python -m renderCanvasCLI --help
```

Subcomandos:

| Comando | Descripción |
|---------|-------------|
| `render` | Renderiza un proyecto a video |
| `init` | Crea un nuevo proyecto desde plantilla |
| `projects` / `ls` | Lista proyectos disponibles |
| `validate` | Valida la estructura de un proyecto |
| `presets` | Lista presets de renderizado |
| `config` | Ver o modificar configuración |
| `ffmpeg` | Verifica FFmpeg y prueba archivos |

### 3. Servidor MCP (integración con IA)

```bash
node mcp-server.js
```

Compatible con Claude Desktop, Cursor y otros asistentes compatibles con MCP.  
Documentación completa en [`docs/mcp-server.md`](docs/mcp-server.md).

---

## Requisitos

- Node.js 18+
- Python 3.10+
- Windows, macOS o Linux

---

## Presets de renderizado

### H.264 (formato MP4)

| Preset | Resolución | FPS | Codec | Uso |
|--------|-----------|-----|-------|-----|
| `hd-30` | 1920×1080 | 30 | libx264 | Calidad estándar |
| `hd-60` | 1920×1080 | 60 | libx264 | Calidad fluida |
| `fullhd-60` | 1920×1080 | 60 | libx264 | Alta calidad |
| `4k-30` | 3840×2160 | 30 | libx264 | 4K estándar |
| `4k-60` | 3840×2160 | 60 | libx264 | 4K fluido |
| `square-1k-30` | 1080×1080 | 30 | libx264 | Redes sociales |
| `vertical-hd-30` | 1080×1920 | 30 | libx264 | Stories/Reels |
| `preview` | 640×360 | 15 | libx264 | Borrador rápido |
| `draft` | 854×480 | 24 | libx264 | Vista previa |

### HAP (formato MOV — reproducción en tiempo real)

| Preset | Resolución | FPS | Codec | Contenedor |
|--------|-----------|-----|-------|------------|
| `hap-q-hd` | 1920×1080 | 60 | HAP_Q | .mov |
| `hap-q-4k` | 3840×2160 | 30 | HAP_Q | .mov |
| `hap-alpha-hd` | 1920×1080 | 60 | HAP_Alpha | .mov |

### CineForm (formato MOV)

| Preset | Resolución | FPS | Codec | Calidad | Contenedor |
|--------|-----------|-----|-------|---------|------------|
| `cfhd-film-hd` | 1920×1080 | 60 | CineForm | Film (máxima) | .mov |
| `cfhd-high-hd` | 1920×1080 | 60 | CineForm | High | .mov |
| `cfhd-medium-hd` | 1920×1080 | 60 | CineForm | Medium | .mov |
| `cfhd-film-4k` | 3840×2160 | 30 | CineForm | Film (máxima) | .mov |

---

## Uso rápido

```bash
# Ver proyectos disponibles
python -m renderCanvasCLI projects

# Crear un proyecto desde plantilla
python -m renderCanvasCLI init mi-animacion

# Renderizar con preset por defecto (HD 60fps)
python -m renderCanvasCLI render --project mi-animacion

# Renderizar con preset específico
python -m renderCanvasCLI render --project mi-animacion --preset 4k-60

# Renderizar con codec profesional
python -m renderCanvasCLI render --project mi-animacion --preset hap-q-hd
python -m renderCanvasCLI render --project mi-animacion --preset cfhd-film-4k

# Sobrescribir parámetros individuales
python -m renderCanvasCLI render --project mi-animacion --codec cfhd --pix-fmt yuv422p --container .mov
```

---

## Compilar distribución

```bash
npm run dist:win    # Windows (.exe)
npm run dist:mac    # macOS (.dmg)
npm run dist:linux  # Linux (.AppImage)
```

El instalador se genera en `dist/`.

---

## Estructura del proyecto

```
├── renderCanvasCLI/        # Paquete Python CLI
│   ├── cli.py              # CLI argumentos y dispatch
│   ├── renderer.py         # Orquestador de renderizado
│   ├── browser.py          # Captura via Puppeteer
│   ├── config.py           # Gestión de configuración
│   ├── presets.py          # Presets de video (H.264, HAP, CineForm)
│   ├── ffmpeg.py           # Descubrimiento de FFmpeg
│   ├── project.py          # Scaffolding y listado de proyectos
│   ├── progress.py         # Barra de progreso
│   └── templates/          # Plantillas de proyectos
├── bin/                    # FFmpeg + entry point CLI
├── server.js               # Servidor Express + Puppeteer
├── mcp-server.js           # Servidor MCP
├── main.js / preload.js    # Electron
├── public/                 # UI de escritorio
├── proyectos/              # Animaciones fuente
├── renders/                # Videos generados
├── renderCanvasCLI.json    # Configuración por defecto
└── docs/mcp-server.md      # Documentación MCP
```

---

## Licencia

MIT
