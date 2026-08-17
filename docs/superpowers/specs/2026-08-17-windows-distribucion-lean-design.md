# Diseño: distribución "lean" del binario Windows

Fecha: 2026-08-17

## Problema

El instalador Windows empaqueta archivos redundantes y dependencias que no se usan en runtime, lo que infla su tamaño. Además carece de icono, de un nombre de artefacto limpio y de metadatos del instalador. Por último, el desinstalador mata procesos `chrome.exe` del usuario.

- `files` incluye `public/**/*` y `proyectos/**/*`, pero esos recursos ya se empaquetan sueltos vía `extraResources` y el runtime solo lee los de `extraResources` (`APP_ROOT = resources/..`). Doble empaquetado = peso muerto en el `app.asar`.
- `files` incluye `node_modules/**/*`, lo que anula la detección automática de dependencias de producción de electron-builder y arrastra devDependencies (ej. `app-builder-bin` ~207 MB).
- `ffmpeg-static` y `@modelcontextprotocol/sdk` están en `dependencies` pero no se usan en el binario: `bin/ffmpeg.exe` siempre va empaquetado y `mcp-server.js` no se distribuye.
- No hay icono (`.ico`), no hay `artifactName` (el instalador sale como `RenderCanvasToVideo Setup 0.6.0.exe`), y faltan metadatos NSIS.
- `build/installer.nsh` ejecuta `taskkill /f /im "chrome.exe"` al desinstalar, lo que también mata el Google Chrome del usuario.

## Decisiones

- **Enfoque "lean"**: reducir el tamaño del instalador y pulir el acabado, manteniendo solo el instalador NSIS (sin artefacto portable, sin firma de código).
- **Icono**: generar uno sencillo (canvas + play) sin dependencias, en formato `.ico` multi-resolución.
- **Firma de código**: se deja sin firmar (como ahora); SmartScreen seguirá mostrando advertencia. Fuera de alcance por ahora.

## Contexto técnico de la app

- App Electron: `main.js` lanza un servidor Express hijo (`server.js`) en `http://localhost:3000`.
- `main.js` fija `APP_ROOT = path.join(process.resourcesPath, '..')` cuando está empaquetada (`app.isPackaged`), y `CHROME_CACHE_DIR` apunta a `resources/../.cache/puppeteer`. Por eso el runtime lee `public`, `proyectos`, `bin` y `.cache/puppeteer` desde los `extraResources`, no desde el asar.
- `server.js` requiere `ffmpeg-static` en la línea 6 y lo usa solo como fallback en `resolveFfmpegPath()`; el binario `bin/ffmpeg.exe` (con HAP) siempre está disponible.
- `mcp-server.js` (que usa `@modelcontextprotocol/sdk`) NO está en `files`, por lo que no se empaqueta.
- electron-builder incluye automáticamente las dependencias de producción (`dependencies`) y sus transitivas, independientemente de `files`. Listar `node_modules/**/*` en `files` solo añade peso innecesario.

## Cambios propuestos

### 1. `package.json` — dependencias

- `dependencies` queda en: `express`, `fluent-ffmpeg`, `puppeteer`.
- Mover a `devDependencies`: `ffmpeg-static` y `@modelcontextprotocol/sdk`.
- Añadir script `generate:icon`: `node scripts/generate-icon.js`.

### 2. `server.js` — require defensivo de `ffmpeg-static`

- Envolver `require('ffmpeg-static')` en try/catch y dejar la variable en `null` si falla, para que el fallback sea opcional en el binario empaquetado. El resto de `resolveFfmpegPath()` no cambia.

### 3. `package.json` — config de build

```jsonc
"build": {
  "appId": "com.javierjarart.rendercanvastovideo",
  "productName": "RenderCanvasToVideo",
  "copyright": "Copyright © 2026 Javier Jara",
  "directories": { "output": "dist" },
  "compression": "maximum",
  "artifactName": "${productName}-Setup-${version}.${ext}",
  "files": [
    "main.js",
    "preload.js",
    "server.js"
  ],
  "extraResources": [
    { "from": "public", "to": "../public" },
    { "from": "proyectos", "to": "../proyectos" },
    { "from": "bin", "to": "../bin" },
    { "from": ".cache/puppeteer", "to": "../.cache/puppeteer" }
  ],
  "win": {
    "target": "nsis",
    "icon": "build/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "include": "build/installer.nsh",
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico",
    "installerHeaderIcon": "build/icon.ico",
    "shortcutName": "RenderCanvasToVideo"
  }
}
```

- `files` se reduce a `main.js`, `preload.js`, `server.js`. Se eliminan `node_modules/**/*`, `public/**/*`, `proyectos/**/*` y `.puppeteerrc.cjs`.
- `extraResources` se mantiene igual.
- Se añaden `compression`, `artifactName`, `copyright` y los iconos/metadatos NSIS.

### 4. Icono generado

- Nuevo `scripts/generate-icon.js`, sin dependencias: rasteriza un icono "canvas + play" (fondo redondeado + triángulo de reproducción) con antialiasing por supersampling y escribe un `.ico` con entradas PNG para 16/24/32/48/64/128/256 px.
- Salida: `build/icon.ico`, commiteado en el repo.

### 5. `build/installer.nsh` — arreglar `taskkill`

- Mantener el cierre de la app (`taskkill /f /im "${APP_EXECUTABLE_FILENAME}"`).
- Sustituir `taskkill /f /im "chrome.exe"` por un cierre acotado por ruta: matar solo los `chrome.exe` cuyo `ExecutablePath` empiece por `$INSTDIR`, usando `Get-CimInstance Win32_Process` + `Stop-Process`.

### 6. `.github/workflows/release.yml` — limpieza de pasos redundantes

- Job `build`: eliminar los pasos explícitos "Install Chrome for Windows" y "Install FFmpeg with HAP for Windows" (ya los ejecuta `npm run dist:win` vía `predist:win`).
- Job `smoke-test`: eliminar el paso "Set up Chromium and FFmpeg binaries for test project" (el `win-unpacked` ya trae Chrome y FFmpeg empaquetados vía `extraResources`).

## Verificación

- `node scripts/generate-icon.js` genera `build/icon.ico` sin errores.
- `node --test tests/*.test.js` pasa localmente.
- `npx electron-builder --win --dir` compila sin errores (best effort en Linux; el procesado de icono vía `rcedit` requiere wine, por lo que la validación final de icono/instalador la hace el CI de `windows-latest` con su smoke test).
- El smoke test del binario empaquetado en CI sigue pasando (la app renderiza un video real).
- El artefacto del instalador se llama `RenderCanvasToVideo-Setup-<version>.exe` (sin espacios).

## No incluido (fuera de alcance)

- Firma de código (certificado).
- Artefacto portable `.exe` adicional.
- Releases para macOS/Linux.
- Cambios al `ci.yml` existente.
