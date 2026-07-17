# RenderCanvasToVideo 🎬

Convierte animaciones de HTML5 Canvas a videos MP4/MOV al instante. Sin grabación de pantalla, sin pérdida de calidad.

Elige una carpeta con tu proyecto, configura resolución y FPS, y la app captura frame por frame tu canvas para generar el video. Hasta 4K, 120fps, codecs profesionales.

## Descarga

| Plataforma | Descarga |
|---|---|
| **Windows** | [`RenderCanvasToVideo Setup`](https://github.com/javierjarart/RenderCanvasToVideo/releases) (.exe / .msi) |
| **Linux** | [`RenderCanvasToVideo`](https://github.com/javierjarart/RenderCanvasToVideo/releases) (.deb / .AppImage) |
| **macOS** | [`RenderCanvasToVideo`](https://github.com/javierjarart/RenderCanvasToVideo/releases) (.dmg) |

> FFmpeg ya viene incluido. No necesitas instalarlo por separado.

## Cómo usarlo

1. Abre la aplicación
2. Selecciona la carpeta de tu proyecto (debe tener un `index.html` con un `<canvas>`)
3. Elige un preset o ajusta resolución, FPS y duración
4. Dale a **Añadir a cola**
5. La app captura cada frame y genera el video automáticamente

## Presets más usados

| Preset | Resolución | FPS |
|---|---|
| HD 30fps | 1920×1080 | 30 |
| HD 60fps | 1920×1080 | 60 |
| 4K 30fps | 3840×2160 | 30 |
| 4K 60fps | 3840×2160 | 60 |
| Square 1K | 1080×1080 | 30 |
| Vertical HD | 1080×1920 | 30 |

También soporta HEVC, HAP, CineForm, NVENC, VAAPI, VideoToolbox y perfiles HDR — más de 25 presets en total.

## Compilar desde fuente

```bash
npm install
cargo build --release --manifest-path src-tauri/Cargo.toml
```

Requiere Rust, Node.js y dependencias de sistema para Tauri v2.

## Licencia

MIT
