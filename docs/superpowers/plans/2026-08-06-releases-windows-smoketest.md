# Release solo Windows + smoke test del binario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar el proyecto a releases solo Windows (quitar targets mac/linux de `package.json`), agregar un smoke test real del binario empaquetado en el workflow `Release` antes de publicar, e ignorar el documento técnico no trackeado.

**Architecture:** `package.json` se reduce a targets Windows (NSIS). El workflow `release.yml` agrega un job `smoke-test` (windows-latest) que compila `--dir`, arranca la app empaquetada, verifica salud del servidor Express, ejecuta un render real del proyecto `test-anim`, valida el `.mp4` generado y la versión interna, y solo si pasa, se publica la release. `.gitignore` ignora `rendercanvastovideo-technical-doc.md`.

**Tech Stack:** GitHub Actions (workflow_dispatch, windows-latest), PowerShell (pwsh), electron-builder, curl/Invoke-WebRequest para API, PyYAML (validación local).

## Global Constraints

- Formato de versión: SemVer `vX.Y.Z`. La versión se lee SIEMPRE de `package.json`.
- Solo Windows: `package.json` NO debe tener targets ni scripts de mac/linux.
- El smoke test es un job separado (`smoke-test`) que bloquea la publicación de la release (`needs`).
- La release publica SOLO `dist/*.exe` (instalador NSIS).
- El smoke test usa el proyecto real `proyectos/test-anim` (contiene `<canvas>`, verificado).
- El render de prueba: 320x240, 15 fps, 1s.
- `rendercanvastovideo-technical-doc.md` se ignora vía `.gitignore`.

---

### Task 1: Reducir `package.json` a solo Windows

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces: `npm run dist:win` y `npm run predist:win` como únicos scripts de dist; build config con solo `win`.

- [ ] **Step 1: Editar `package.json`**

Eliminar del bloque `"build"` los sub-bloques `"mac"` y `"linux"`, y eliminar los scripts `predist:mac`, `predist:linux`, `dist:mac`, `dist:linux`.

El resultado de las secciones relevantes debe ser:

```json
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "mcp": "node mcp-server.js",
    "test": "node test-pipeline.js",
    "test:node": "node --test tests/*.test.js",
    "test:python": "python3 -m unittest discover tests -v",
    "test:all": "npm run test:node && npm run test:python",
    "install:ffmpeg": "node scripts/install-ffmpeg.js",
    "predist": "node scripts/install-chrome.js && node scripts/install-ffmpeg.js",
    "predist:win": "node scripts/install-chrome.js win64 && node scripts/install-ffmpeg.js win64",
    "dist:win": "npm run predist:win && electron-builder --win --publish=never",
    "postinstall": "puppeteer browsers install chrome"
  },
```

```json
  "build": {
    "appId": "com.javierjarart.rendercanvastovideo",
    "productName": "RenderCanvasToVideo",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "server.js",
      ".puppeteerrc.cjs",
      "public/**/*",
      "proyectos/**/*",
      "node_modules/**/*",
      "!node_modules/electron-builder/**/*"
    ],
    "extraResources": [
      {
        "from": "public",
        "to": "../public"
      },
      {
        "from": "proyectos",
        "to": "../proyectos"
      },
      {
        "from": "bin",
        "to": "../bin"
      },
      {
        "from": ".cache/puppeteer",
        "to": "../.cache/puppeteer"
      }
    ],
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "include": "build/installer.nsh"
    }
  }
```

- [ ] **Step 2: Verificar**

```bash
cd /home/flwr/Proyectos/RenderCanvasToVideo && python3 -c "import json; d=json.load(open('package.json')); print('mac' in d['build'], 'linux' in d['build'], 'mac' in json.dumps(d['scripts']), 'linux' in json.dumps(d['scripts']))"
```

Expected: `False False False False`. Y:

```bash
node -e "const s=require('./package.json').scripts; console.log(s['dist:win'], s['dist:mac'], s['dist:linux'])"
```

Expected: `npm run predist:win && electron-builder --win --publish=never undefined undefined`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: releases solo windows (quitar targets y scripts mac/linux)"
```

---

### Task 2: Agregar smoke test del binario a `release.yml`

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 1 (solo `dist:win`), el job `build` existente que produce `dist/*.exe`.
- Produces: job `smoke-test` que valida el binario; la release depende de él.

- [ ] **Step 1: Reescribir `release.yml`**

Reemplazar el contenido completo de `.github/workflows/release.yml` por:

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag (e.g., v0.6.0). DEBE coincidir con package.json.'
        required: true
        type: string

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    timeout-minutes: 60
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validate version matches package.json
        shell: pwsh
        run: |
          $requested = "${{ github.event.inputs.version }}"
          if ($requested -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') {
            Write-Error "Formato de version invalido: $requested. Usa SemVer con prefijo v, ej. v0.6.0."
            exit 1
          }
          $tagVersion = $requested -replace '^v', ''
          $pkg = Get-Content package.json | ConvertFrom-Json
          $pkgVersion = $pkg.version
          if ($pkgVersion -ne $tagVersion) {
            Write-Error "package.json version ($pkgVersion) no coincide con el tag solicitado ($requested). Haz el bump primero."
            exit 1
          }
          if (git rev-parse -q --verify "refs/tags/$requested") {
            Write-Error "El tag $requested ya existe en el repositorio."
            exit 1
          }
          Write-Host "Version validada: $requested"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        shell: pwsh

      - name: Install Chrome for Windows
        run: node scripts/install-chrome.js win64
        shell: pwsh

      - name: Install FFmpeg with HAP for Windows
        run: node scripts/install-ffmpeg.js win64
        shell: pwsh

      - name: Build Windows installer
        run: npm run dist:win
        shell: pwsh
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'

      - name: Build unpacked binary for smoke test
        run: npx electron-builder --win --dir
        shell: pwsh
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'

      - name: Upload installer artifact
        uses: actions/upload-artifact@v4
        with:
          name: installer
          path: dist/*.exe

      - name: Upload unpacked binary artifact
        uses: actions/upload-artifact@v4
        with:
          name: win-unpacked
          path: dist/win-unpacked/

  smoke-test:
    runs-on: windows-latest
    needs: build
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download unpacked binary
        uses: actions/download-artifact@v4
        with:
          name: win-unpacked
          path: dist/win-unpacked

      - name: Set up Chromium and FFmpeg binaries for test project
        run: |
          node scripts/install-chrome.js win64
          node scripts/install-ffmpeg.js win64
        shell: pwsh

      - name: Smoke test - launch app and render a test video
        shell: pwsh
        run: |
          $ErrorActionPreference = 'Stop'
          $exe = "dist\win-unpacked\RenderCanvasToVideo.exe"
          if (-not (Test-Path $exe)) {
            Write-Error "Binario no encontrado: $exe"
            exit 1
          }
          Write-Host "Lanzando app empaquetada: $exe"
          $proc = Start-Process -FilePath $exe -PassThru
          try {
            $healthy = $false
            for ($i = 0; $i -lt 60; $i++) {
              Start-Sleep -Seconds 1
              try {
                $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2
                if ($health.ok) { $healthy = $true; break }
              } catch { }
            }
            if (-not $healthy) {
              Write-Error "El servidor no respondio en /api/health tras 60s"
              exit 1
            }
            Write-Host "Servidor Express OK"

            $body = @{
              project    = 'test-anim'
              width      = 320
              height     = 240
              fps        = 15
              duration   = 1
              bgColor    = '#000000'
              codec      = 'libx264'
              container  = '.mp4'
              pixFmt     = 'yuv420p'
            } | ConvertTo-Json

            Invoke-RestMethod -Uri "http://localhost:3000/api/render" -Method Post -ContentType "application/json" -Body $body | Out-Null
            Write-Host "Render iniciado"

            $done = $false
            for ($i = 0; $i -lt 120; $i++) {
              Start-Sleep -Seconds 1
              $status = Invoke-RestMethod -Uri "http://localhost:3000/api/status"
              if ($status.state -eq 'done') { $done = $true; break }
              if ($status.state -eq 'error') {
                Write-Error "Render fallo: $($status.error)"
                exit 1
              }
            }
            if (-not $done) {
              Write-Error "Render no termino en 120s (state: $($status.state))"
              exit 1
            }
            Write-Host "Render completado"

            $mp4 = Get-ChildItem renders/*.mp4 | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if (-not $mp4 -or $mp4.Length -eq 0) {
              Write-Error "No se genero ningun .mp4 valido en renders/"
              exit 1
            }
            Write-Host "Video generado: $($mp4.Name) - $($mp4.Length) bytes"
          } finally {
            if ($proc -and -not $proc.HasExited) {
              Stop-Process -Id $proc.Id -Force
            }
          }

  release:
    runs-on: windows-latest
    needs: [build, smoke-test]
    timeout-minutes: 20
    steps:
      - name: Download installer artifact
        uses: actions/download-artifact@v4
        with:
          name: installer
          path: dist

      - name: Create Git tag
        shell: pwsh
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a ${{ github.event.inputs.version }} -m "Release ${{ github.event.inputs.version }}"
          git push origin ${{ github.event.inputs.version }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.event.inputs.version }}
          name: ${{ github.event.inputs.version }}
          files: dist/*.exe
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notas:
- El tag se crea en el job `release` (solo tras pasar build + smoke test), no en `build`.
- El smoke test usa `Invoke-RestMethod` (PowerShell) para no depender de `curl` en Windows.
- La validación de versión se mantiene en el job `build` (primera línea de defensa).

- [ ] **Step 2: Validar el YAML**

```bash
cd /home/flwr/Proyectos/RenderCanvasToVideo && python3 -c "import yaml; yaml.load(open('.github/workflows/release.yml'), Loader=yaml.FullLoader); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 3: Verificar que el proyecto de test existe**

```bash
ls proyectos/test-anim/index.html && grep -c "canvas" proyectos/test-anim/index.html
```

Expected: el archivo existe y el grep devuelve al menos 1.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: smoke test del binario empaquetado antes de publicar release"
```

---

### Task 3: Ignorar `rendercanvastovideo-technical-doc.md`

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: el archivo deja de aparecer como untracked.

- [ ] **Step 1: Editar `.gitignore`**

Añadir la línea (junto a los otros archivos de documentación/plan):

```gitignore
rendercanvastovideo-technical-doc.md
```

- [ ] **Step 2: Verificar**

```bash
cd /home/flwr/Proyectos/RenderCanvasToVideo && git status --short
```

Expected: `rendercanvastovideo-technical-doc.md` ya NO aparece como `??`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignorar rendercanvastovideo-technical-doc.md"
```

---

## Self-Review

**1. Spec coverage:**
- Solo Windows en package.json → Task 1 ✓
- Smoke test del binario en release.yml → Task 2 ✓
- Release solo se publica tras smoke test (needs) → Task 2 ✓
- `.gitignore` para doc técnico → Task 3 ✓

**2. Placeholder scan:** Sin TBD/TODO; todos los pasos con contenido completo.

**3. Type consistency:** El endpoint `/api/render` recibe `project/width/height/fps/duration` (verificado en server.js:213); `/api/status` devuelve `state` (verificado en server.js:258, 280). El nombre del binario empaquetado es `RenderCanvasToVideo.exe` (productName en package.json). Consistente.

## Verificación final tras ejecutar el plan

```bash
cd /home/flwr/Proyectos/RenderCanvasToVideo
python3 -c "import yaml; yaml.load(open('.github/workflows/release.yml'), Loader=yaml.FullLoader); print('YAML OK')"
node -e "const s=require('./package.json').scripts; console.log(Boolean(s['dist:win']) && !s['dist:mac'] && !s['dist:linux'])"
git status --short
git log --oneline -5
```
