# Ordenar releases de RenderCanvasToVideo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpiar los releases borrador obsoletos, reescribir `release.yml` para que valide que la versión del tag coincida con `package.json`, eliminar `build-windows.yml` (causa de releases duplicadas) y actualizar el README.

**Architecture:** El historial de tags antiguos se deja intacto. La limpieza de borradores se hace una sola vez vía `gh`. El nuevo `release.yml` es un workflow único (Enfoque A): bump local → push → workflow que valida → crea tag → compila → publica. `ci.yml` no se toca.

**Tech Stack:** GitHub Actions (workflow_dispatch), PowerShell (pwsh), Node/electron-builder, GitHub CLI (`gh`), PyYAML (validación de YAML en local).

## Global Constraints

- Formato de versión: SemVer `vX.Y.Z` (ej. `v0.6.0`). La versión se lee SIEMPRE de `package.json`.
- Los tags antiguos mal formateados (`v.0.x`, `V.0.1.0`, `v0.0.x`) NO se tocan — solo los futuros serán `vX.Y.Z`.
- Se eliminan los borradores `v0.5.0`, `v0.3.0`, `v0.2.4` (obsoletos, superados por releases publicadas).
- El workflow `Release` fallará si el tag pedido no coincide con `package.json` o si el tag ya existe.
- Nombre canónico de release = `vX.Y.Z` (sin prefijo de proyecto).

---

### Task 1: Eliminar releases borrador obsoletos de GitHub

**Files:** ninguno (operación sobre GitHub via `gh`)

**Interfaces:**
- Consumes: nada.
- Produces: GitHub sin releases borrador (lista limpia).

- [ ] **Step 1: Verificar los borradores a eliminar**

```bash
gh release list --limit 30
```

Expected: `v0.5.0`, `v0.3.0`, `v0.2.4` aparecen con estado `Draft`.

- [ ] **Step 2: Eliminar los tres borradores**

```bash
gh release delete v0.5.0 --yes
gh release delete v0.3.0 --yes
gh release delete v0.2.4 --yes
```

Nota: los tags git NO se borran (`gh release delete` solo elimina la release; al no existir tag git correspondiente no hay nada que limpiar). Expected: sin salida de error.

- [ ] **Step 3: Verificar la limpieza**

```bash
gh release list --limit 30
```

Expected: ya no aparece `v0.5.0`, `v0.3.0` ni `v0.2.4`. Quedan publicadas: `v0.5.1`, `v0.4.2`, `v0.4.1`, `v0.4.0`, `v0.3.7`…`v0.3.1`, `v0.2.3` y las antiguas (`v.0.2.0`…`v.0.2.2`, `V.0.1.0`, `v.0.0.2`, `v.0.0.3`, `v0.0.1`).

- [ ] **Step 4: Commit (ningún cambio de archivo, verificar que no haya nada pendiente)**

```bash
git status --short
```

Expected: solo los archivos ya modificados en tareas posteriores; si nada, `git status` limpio de la Task 1.

---

### Task 2: Reescribir `release.yml` con validación de versión

**Files:**
- Modify: `.github/workflows/release.yml` (contenido completo)

**Interfaces:**
- Consumes: nada.
- Produces: workflow `Release` (workflow_dispatch, input `version`) que valida → tag → build → publica. Lo usa cualquier release futura.

- [ ] **Step 1: Escribir el nuevo `release.yml`**

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
  release:
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
          $tagVersion = "${{ github.event.inputs.version }}" -replace '^[vV]', ''
          $pkg = Get-Content package.json | ConvertFrom-Json
          $pkgVersion = $pkg.version
          if ($pkgVersion -ne $tagVersion) {
            Write-Error "package.json version ($pkgVersion) no coincide con el tag solicitado (${{ github.event.inputs.version }}). Haz el bump primero."
            exit 1
          }
          if (git rev-parse -q --verify "refs/tags/v$tagVersion") {
            Write-Error "El tag v$tagVersion ya existe en el repositorio."
            exit 1
          }
          Write-Host "Version validada: v$pkgVersion"

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

      - name: Build Windows executable
        run: npm run dist:win
        shell: pwsh
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'

      - name: Verify build
        shell: pwsh
        run: |
          $exe = Get-ChildItem dist/*.exe | Select-Object -First 1
          if ($exe) {
            Write-Host "Built: $($exe.Name) - $($exe.Length / 1MB) MB"
            & $exe.FullName --version 2>$null | Out-Null
            Write-Host "Executable runs successfully"
          } else {
            Write-Error "No .exe found in dist/"
            exit 1
          }

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
- El input `draft` se eliminó (ya no se crean borradores).
- El nombre canónico de la release es `name: ${{ github.event.inputs.version }}` (ej. `v0.6.0`).

- [ ] **Step 2: Validar el YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML OK')"
```

Expected: `YAML OK` (PyYAML interpreta `on:` como clave booleana; si falla por eso, revalidar con `yaml.load(open(...), Loader=yaml.FullLoader)`). El objetivo es detectar errores de sintaxis.

- [ ] **Step 3: Verificar que las referencias a scripts existan**

```bash
ls scripts/install-chrome.js scripts/install-ffmpeg.js && grep -n '"dist:win"' package.json
```

Expected: ambos scripts existen y `package.json` define `dist:win`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow unico con validacion de version vs package.json"
```

---

### Task 3: Eliminar `build-windows.yml` (causa de releases duplicadas)

**Files:**
- Delete: `.github/workflows/build-windows.yml`

**Interfaces:**
- Consumes: Task 2 (nuevo `release.yml` ya cubre build + release).
- Produces: eliminación del trigger duplicado en push de tags `v*`.

- [ ] **Step 1: Eliminar el archivo**

```bash
git rm .github/workflows/build-windows.yml
```

- [ ] **Step 2: Verificar que solo queden los workflows esperados**

```bash
ls .github/workflows/
```

Expected: `release.yml` y `ci.yml` únicamente.

- [ ] **Step 3: Commit**

```bash
git commit -m "ci: eliminar build-windows.yml (releases duplicadas por doble trigger)"
```

---

### Task 4: Actualizar README (badge de versión y sección Release)

**Files:**
- Modify: `README.md` (línea 2 y añadir sección antes de `## Interfaces`)

**Interfaces:**
- Consumes: decisiones del spec (SemVer, flujo de release).
- Produces: documentación del proceso de release para futuros contribuidores.

- [ ] **Step 1: Corregir el badge de versión**

Cambiar la línea 2 de `README.md`:

```markdown
[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)]()
```

por:

```markdown
[![Version](https://img.shields.io/badge/version-0.5.1-blue.svg)]()
```

- [ ] **Step 2: Añadir la sección "Release"**

Insertar después de la sección de descarga (línea 30) y antes de `## Interfaces`:

```markdown
---

## Release

Para publicar una nueva versión:

1. Actualiza la versión en `package.json`:

   ```bash
   npm version patch   # o minor / major
   ```

2. Haz commit y push al branch `main`:

   ```bash
   git add package.json && git commit -m "bump: vX.Y.Z"
   git push origin main
   ```

3. En GitHub Actions, dispara el workflow **Release** con el input `version` exacto (ej. `v0.6.0`).

   > El workflow valida que la versión del tag coincida con `package.json`. Si no coinciden, falla en el primer paso.

4. El workflow crea el tag, compila el instalador Windows y publica la release `v0.6.0`.

---

```

- [ ] **Step 3: Verificar el formato del README**

```bash
grep -n "version-0.5.1\|## Release" README.md
```

Expected: la línea del badge contiene `version-0.5.1` y existe la sección `## Release`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: badge de version 0.5.1 y seccion Release con el flujo de publicacion"
```

---

## Self-Review

**1. Spec coverage:**
- Limpieza de borradores → Task 1 ✓
- Reescritura de `release.yml` con validación, tag, build y release → Task 2 ✓
- Eliminación de `build-windows.yml` → Task 3 ✓
- `ci.yml` intacto → no se toca en ninguna tarea ✓
- Badge README 0.5.0 → 0.5.1 → Task 4 ✓
- Sección Release en README → Task 4 ✓
- Tags antiguos intactos → ninguna tarea los modifica ✓

**2. Placeholder scan:** Sin TBD/TODO; todos los pasos con código concreto.

**3. Type consistency:** La versión se referencia siempre como `vX.Y.Z`; la normalización quita el prefijo `v`/`V` en el paso de validación y el tag se crea con el input tal cual. Consistente.

## Verificación final tras ejecutar el plan

```bash
gh release list --limit 30          # sin borradores
ls .github/workflows/               # solo release.yml y ci.yml
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML OK')"
git log --oneline -5                # commits de las 4 tareas
```
