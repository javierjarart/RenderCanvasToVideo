# RenderCanvasToVideo

Convierte animaciones HTML5 Canvas a video MP4/MOV. Captura frame por frame desde un webview oculto y los encadena con FFmpeg.

## ¿Por qué?

Los métodos tradicionales de grabación de browser tienen limitaciones severas:

| | Grabación directa | **RenderCanvasToVideo** |
|---|---|---|
| FPS | Limitado al hardware real (30–60 fps) | Cualquier FPS (15, 60, 120…) |
| Duración | 1 min de video = 1 min real | Renderizado fuera de tiempo real |
| Calidad | Píxeles comprimidos del monitor | Buffer interno del canvas — sin pérdida |
| Resolución | Ligada a la pantalla física | Cualquier resolución (4K, 8K…) |
| Determinismo | Latencia variable por vsync/drivers | Cada frame exacto y reproducible |

## Descarga

| Plataforma | Descarga |
|---|---|
| **Windows** | [`RenderCanvasToVideo Setup`](https://github.com/javierjarart/RenderCanvasToVideo/releases) (.exe/.msi) |
| **Linux** | Compilar desde fuente (ver abajo) |
| **macOS** | Compilar desde fuente (ver abajo) |

## Cómo usar

1. Abre la aplicación
2. Selecciona la carpeta de tu proyecto (debe contener un `index.html` con un canvas)
3. Elige un preset o configura resolución, FPS y duración
4. Haz clic en **Añadir a cola**
5. La app captura cada frame del canvas y genera el video automáticamente

## Presets

### H.264 (MP4)
| Preset | Resolución | FPS |
|---|---|---|
| HD 30fps | 1920×1080 | 30 |
| HD 60fps | 1920×1080 | 60 |
| 4K 30fps | 3840×2160 | 30 |
| 4K 60fps | 3840×2160 | 60 |
| Square 1K | 1080×1080 | 30 |
| Vertical HD | 1080×1920 | 30 |
| Preview | 640×360 | 15 |

### HEVC / HAP / CineForm / NVENC / VAAPI
Soporta más de 25 presets incluyendo codecs profesionales (HAP, CineForm), aceleración por hardware (NVENC, VAAPI, VideoToolbox) y perfiles HDR.

## Perfiles de color

| Perfil | Uso |
|---|---|
| Rec.709 | HD TV, YouTube, video estándar |
| Rec.2020 | UHD/4K, HDR |
| DCI-P3 | Cine digital |

## Modo MCP (integración con IA)

El binario puede funcionar como servidor MCP (Model Context Protocol) para ser usado desde Claude Desktop, Cursor y otros asistentes:

```bash
./rendercanvastovideo --mcp
```

## Compilar desde fuente

```bash
npm install
cargo build --release --manifest-path src-tauri/Cargo.toml
strip target/release/rendercanvastovideo
./target/release/rendercanvastovideo
```

### Windows installer

```bash
npm install
npx tauri build
```

El instalador se genera en `src-tauri/target/release/bundle/`.

## Requisitos

- **FFmpeg** instalado y accesible en `PATH`
- **Windows**: WebView2 Runtime (incluido en Windows 11, o instalado automáticamente por el installer)

## Licencia

MIT — ver [LICENSE](LICENSE).
