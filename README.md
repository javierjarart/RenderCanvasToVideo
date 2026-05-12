# Canvas Render To Video

Convierte animaciones HTML/CSS/JS en video MP4. App de escritorio basada en Electron.

## Funcionamiento

Toma un `canvas` de una página web, captura cada frame y los encadena con FFmpeg para generar un video. Útil para exportar animaciones generadas con código (p5.js, Three.js, canvas API, etc.).

## Requisitos

- Node.js 18+
- Windows, macOS o Linux

No necesitas instalar Chrome ni FFmpeg por separado — la app los descarga automáticamente la primera vez que se ejecuta.

## Uso rápido

```bash
npm install
npm start
```

La primera ejecución descarga Chromium (~150 MB) para la captura de frames. Una vez listo, se abre la ventana de la aplicación.

## Preparar un proyecto

Dentro de la carpeta `proyectos/`, creá una carpeta con tu animación:

```
proyectos/
└── mi-animacion/
    ├── index.html
    ├── style.css
    └── sketch.js
```

El `index.html` debe contener un elemento `<canvas>`. La app capturará el contenido de ese canvas frame por frame.

También puedes seleccionar una carpeta externa desde la interfaz si prefieres trabajar fuera del proyecto.

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
