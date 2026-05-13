# Render Canvas To Video

Convierte animaciones HTML/CSS/JS en video MP4.  
App de escritorio usando Electron.

Nuevo Release Compilado para Windows Descarga aqui: https://github.com/javierjarart/RenderCanvasToVideo/releases/tag/v.0.0.2

## Funcionamiento

Toma un `canvas` de una página web, captura cada frame y los encadena con FFmpeg para generar un video. Útil para exportar animaciones generadas con código (p5.js, Three.js, canvas API, etc.).

## Requisitos

- Node.js 18+
- Windows, macOS o Linux


## Uso rápido

```bash
npm install
npm start
```



## Parámetros de render

- **Ancho / Alto**: resolución del video en píxeles
- **FPS**: cuadros por segundo
- **Duración**: segundos de video
- **Color de fondo**: color para píxeles transparentes
- **Carpeta de salida**: opcional, por defecto `renders/`

## Compilar para distribución

```bash
npm run dist:win    # Windows (.exe)
npm run dist:mac    # macOS (.dmg)
npm run dist:linux  # Linux (.AppImage)
```

El instalador se genera en `dist/`.

## Estructura

```
├── main.js          # Proceso principal de Electron
├── server.js        # Servidor Express + captura con Puppeteer
├── preload.js       # Puente IPC para el diálogo de archivos
├── public/          # Interfaz de usuario
│   ├── index.html
│   ├── style.css
│   └── script.js
├── proyectos/       # Animaciones fuente
├── renders/         # Videos generados
├── bin/             # FFmpeg para Windows (empaquetado)
└── .cache/          # Chromium (descargado automáticamente)
```

## Licencia

MIT
