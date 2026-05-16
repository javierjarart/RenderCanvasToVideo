# RenderCanvasToVideo

Convierte animaciones HTML5 Canvas a video MP4/MOV. Captura frame por frame con Puppeteer + Chromium y los encadena con FFmpeg.

## ¿Por qué?

Los métodos tradicionales de grabación de browser tienen limitaciones severas:

| | Grabación directa | **RenderCanvasToVideo** |
|---|---|---|
| FPS | Limitado al hardware real (30–60 fps) | Cualquier FPS (15, 60, 120…) |
| Duración | 1 min de video = 1 min real | Renderizado fuera de tiempo real |
| Calidad | Píxeles comprimidos del monitor, con aliasing | Buffer interno del canvas — sin pérdida |
| Resolución | Ligada a la pantalla física | Cualquier resolución (4K, 8K…) |
| Determinismo | Latencia variable por vsync/drivers | Cada frame es exacto y reproducible |
| Compatibilidad | No captura 60 fps en pantalla de 30 Hz | Independiente del hardware |

## Características

- **Cualquier FPS** — renderiza a 15, 60, 120 o cualquier tasa arbitraria
- **Lectura directa del buffer** — accede al canvas puro, sin interferencias del sistema operativo
- **Resoluciones arbitrarias** — incluso 4K/8K desde un monitor HD
- **Frames deterministas** — intervalo de tiempo exacto entre cada frame
- **Independencia de hardware** — simula cualquier tasa de frames sin importar el dispositivo


[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

---

## 🚀 Características

** Descarga Para Windows:**  
[RenderCanvasToVideo.Setup.0.2.0.exe](https://github.com/javierjarart/RenderCanvasToVideo/releases/download/v.0.2.0/RenderCanvasToVideo.Setup.0.2.0.exe)

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

## Presets de renderizado

### H.264 (MP4)

| Preset | Resolución | FPS | Uso |
|--------|-----------|-----|-----|
| `hd-30` | 1920×1080 | 30 | Calidad estándar |
| `hd-60` | 1920×1080 | 60 | Calidad fluida |
| `fullhd-60` | 1920×1080 | 60 | Alta calidad |
| `4k-30` | 3840×2160 | 30 | 4K estándar |
| `4k-60` | 3840×2160 | 60 | 4K fluido |
| `square-1k-30` | 1080×1080 | 30 | Redes sociales |
| `vertical-hd-30` | 1080×1920 | 30 | Stories/Reels |
| `preview` | 640×360 | 15 | Borrador rápido |
| `draft` | 854×480 | 24 | Vista previa |

### HAP (MOV — reproducción en tiempo real)

| Preset | Resolución | FPS | Codec |
|--------|-----------|-----|-------|
| `hap-q-hd` | 1920×1080 | 60 | HAP_Q |
| `hap-q-4k` | 3840×2160 | 30 | HAP_Q |
| `hap-alpha-hd` | 1920×1080 | 60 | HAP_Alpha |

### CineForm (MOV)

| Preset | Resolución | FPS | Calidad |
|--------|-----------|-----|---------|
| `cfhd-film-hd` | 1920×1080 | 60 | Film (máxima) |
| `cfhd-high-hd` | 1920×1080 | 60 | High |
| `cfhd-medium-hd` | 1920×1080 | 60 | Medium |
| `cfhd-film-4k` | 3840×2160 | 30 | Film (máxima) |

---

## Perfiles de color

| Perfil | Primarias | Transferencia | Espacio | Uso típico |
|--------|-----------|---------------|---------|------------|
| **Rec.709** | `bt709` | `bt709` | `bt709` | HD TV, YouTube, video estándar |
| **Rec.2020** | `bt2020` | `bt2020-10` | `bt2020nc` | UHD/4K, HDR |
| **DCI-P3** | `smpte432` | `gamma28` | `smpte432` | Cine digital, monitores amplio gamut |

Los perfiles de color se seleccionan desde la UI de escritorio o se envían como parámetros en la API. Los metadatos se incrustan en el video via FFmpeg (`-color_primaries`, `-color_trc`, `-colorspace`).

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

# Renderizar con perfil de color
python -m renderCanvasCLI render --project mi-animacion --preset hd-60 --color-primaries bt2020 --color-trc bt2020-10 --color-space bt2020nc

# Sobrescribir parámetros individuales
python -m renderCanvasCLI render --project mi-animacion --codec cfhd --pix-fmt yuv422p --container .mov
```

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
└── docs/mcp-server.md      # Documentación MCP
```

---

## Licencia

MIT — ver [LICENSE](LICENSE).

Este proyecto incluye componentes de terceros con sus propias licencias:
- **FFmpeg** y **x264** — [GPL-2.0+](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)
- **HAP** — [BSD 2-Clause](https://opensource.org/license/bsd-2-clause)
- **GoPro CineForm** — código abierto por GoPro, Inc.
- **H.264/AVC** — sujeto al [AVC Patent Portfolio License](http://www.mpegla.com) para uso personal y no comercial

Ver [NOTICE.md](NOTICE.md) para las atribuciones completas y el aviso de patentes.
