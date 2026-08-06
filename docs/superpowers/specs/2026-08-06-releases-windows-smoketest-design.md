# Diseño: Release solo Windows + smoke test del binario

Fecha: 2026-08-06

## Problema

- Los releases actuales se compilan en CI pero no se verifica que el binario generado realmente funcione en Windows. Riesgo de publicar instaladores rotos.
- `package.json` incluye targets de build para macOS y Linux, pero el proyecto solo quiere publicar releases de Windows por ahora.
- El archivo `rendercanvastovideo-technical-doc.md` está sin trackear y no debe commite­arse.

## Decisiones

- **Plataforma**: solo Windows para releases. Se eliminan los targets `mac` y `linux` del build config y los scripts `dist:mac`/`dist:linux` de `package.json`.
- **Estrategia de build**: build en CI (opción B). El workflow `Release` compila en `windows-latest` y, antes de publicar, ejecuta un smoke test real del binario empaquetado (no del instalador).
- **Smoke test**: se compila también el binario sin empaquetar (`electron-builder --win --dir`), se arranca la app empaquetada, se espera a que el servidor Express responda, se ejecuta un render de prueba real y se valida que el `.mp4` resultante existe y la versión interna coincide con el tag.
- **`rendercanvastovideo-technical-doc.md`**: se ignora (`.gitignore`).

## Contexto técnico de la app

- App Electron: `main.js` lanza un servidor Express hijo (`server.js`) en `http://localhost:3000`.
- Endpoints relevantes: `GET /api/health` (devuelve `{ok:true}`), `POST /api/render` (inicia render; body con `project`, `width`, `height`, `fps`, `duration`, etc.), `GET /api/status` (devuelve `{state: 'rendering'|'done'|'error', ...}`).
- El render usa Puppeteer + Chromium (instalado en `scripts/install-chrome.js win64`) y FFmpeg (instalado en `scripts/install-ffmpeg.js win64`).
- Hay proyectos de ejemplo en `proyectos/`: `test-anim`, `sample-animation`, `particle-demo`, `generador-de-particulas`.
- El instalador NSIS (`dist/*.exe`) NO es la app: no puede probarse directamente. Por eso el smoke test usa `dist/win-unpacked/RenderCanvasToVideo.exe`.
- Los tests existentes (`tests/*.test.js`, `tests/*.py`) prueban lógica de API/server/ffmpeg/config, no el binario empaquetado.

## Cambios propuestos

### 1. `package.json` — solo Windows

- Eliminar del bloque `"build"`: el sub-bloque `"mac"` y el sub-bloque `"linux"`.
- Eliminar scripts: `predist:mac`, `predist:linux`, `dist:mac`, `dist:linux`.
- Mantener: `predist:win`, `dist:win`, `postinstall`.
- Mantener `"win": { "target": "nsis" }` y `"nsis"` con `installer.nsh`.

### 2. `.github/workflows/release.yml` — smoke test del binario

El flujo del job `release` (windows-latest) será:

1. Checkout (fetch-depth 0).
2. Validación de versión: formato `vX.Y.Z`, coincide con `package.json`, tag no existente.
3. Setup Node 20, `npm ci`.
4. Instalar Chrome y FFmpeg para Windows.
5. Compilar instalador: `npm run dist:win` → `dist/*.exe`.
6. **Smoke test** (nuevo job `smoke-test`, windows-latest, que depende del build):
   a. `npx electron-builder --win --dir` → genera `dist/win-unpacked/RenderCanvasToVideo.exe`.
   b. Arranca la app empaquetada en background.
   c. Poll de `http://localhost:3000/api/health` hasta respuesta OK (timeout ~60s).
   d. `POST /api/render` con proyecto real (`test-anim`), 320x240, 15 fps, 1s.
   e. Poll de `GET /api/status` hasta `state === 'done'` (timeout ~120s); falla si `state === 'error'`.
   f. Verifica que existe un archivo `.mp4` de tamaño > 0 en `renders/`.
   g. Verifica que la versión del instalador (ProductVersion del `dist/*.exe`) coincide con el tag.
   h. Cierra la app.
7. Publicar release con `softprops/action-gh-release`: `tag_name`, `name`, `files: dist/*.exe`, `generate_release_notes`, `draft: false`, `prerelease: false`.

Detalles de implementación del smoke test:
- El render de prueba usa el endpoint `/api/render` con `{ project: 'test-anim', width: 320, height: 240, fps: 15, duration: 1 }`. `proyectos/test-anim/` existe en el repo y su `index.html` contiene un `<canvas>` (verificado).
- Los renders se guardan en `renders/` bajo APP_ROOT.
- El paso "version check" usa PowerShell: `(Get-Item dist/*.exe).VersionInfo.ProductVersion` comparado con el tag normalizado.
- El smoke test corre como job separado para no bloquear la descarga de assets, pero la release solo se crea tras su éxito (needs).

### 3. `.gitignore` — ignorar documento técnico

- Añadir `rendercanvastovideo-technical-doc.md`.

## Verificación

- `npm run dist:win` compila el instalador Windows sin errores.
- El smoke test en CI arranca la app empaquetada, renderiza un video de prueba y valida versión.
- Un binario roto (ej. falta Chromium/FFmpeg) hace fallar el smoke test y NO se publica release.
- `package.json` ya no tiene referencias a mac/linux.
- `git status` no muestra `rendercanvastovideo-technical-doc.md` como untracked.

## No incluido (fuera de alcance)

- Releases para macOS/Linux.
- Build local del binario en WSL (requiere wine) — la opción elegida es build en CI con smoke test.
- Cambios al `ci.yml` existente.
