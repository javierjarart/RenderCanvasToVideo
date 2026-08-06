# Diseño: Ordenar releases de RenderCanvasToVideo

Fecha: 2026-08-06

## Problema

Los releases y tags del proyecto están desordenados:

1. **Tags con formato inconsistente** — tres convenciones mezcladas: `v0.3.1`/`v0.4.2`/`v0.5.1` (correcta), `v.0.0.2`/`v.0.2.0`/`v.0.2.1`/`v.0.2.2` (punto tras la `v`) y `V.0.1.0` (V mayúscula).
2. **Tags duplicados** — `v0.0.1` y `v.0.0.2` apuntan ambos al commit `4e92cb7`.
3. **Releases sin tag en git** — `v0.5.0`, `v0.3.0`, `v0.2.4` existen como releases borrador en GitHub pero el tag no está en git (ni local ni remoto).
4. **Borradores sin publicar** — `v0.5.0`, `v0.3.0`, `v0.2.4` quedaron en estado Draft.
5. **Títulos de release inconsistentes** — mezcla de "v0.5.1", "RenderCanvasToVideo v0.2.3", "v.0.0.3", etc.
6. **`release.yml` sin validación de versión** — crea tag y release con la versión escrita a mano sin comprobar que coincida con `package.json`. Si pones `v0.6.0` y el package.json dice `0.5.1`, el instalador se genera con versión 0.5.1 pero se publica como v0.6.0.
7. **Dos workflows que se pisan** — `release.yml` (manual) y `build-windows.yml` (trigger en push de tags `v*`). Cuando `release.yml` pushea el tag, `build-windows.yml` también se dispara y genera una segunda release en el mismo tag.

## Decisiones

- **Alcance**: todo (tags + releases + workflows). Aprobado por el usuario.
- **Tags antiguos**: se dejan intactos en remoto. Solo los futuros usarán formato `vX.Y.Z`. Decisión del usuario.
- **Borradores**: se eliminan los 3 borradores obsoletos (`v0.5.0`, `v0.3.0`, `v0.2.4`). Decisión del usuario.
- **Esquema de versionado**: SemVer simple `vX.Y.Z`. La versión se lee SIEMPRE de `package.json`; el tag debe coincidir, validado automáticamente en el workflow. Decisión del usuario.
- **Flujo de release**: un solo workflow que hace todo (validar → tag → build → publicar). Se elimina `build-windows.yml`. Decisión del usuario.
- **Enfoque**: bump local + validación en workflow (Enfoque A). El desarrollador hace el bump en `package.json`, lo commitea y pushea; luego dispara el workflow indicando la versión. Decisión del usuario.

## Cambios propuestos

### 1. Limpieza de releases en GitHub (una sola vez)

- Eliminar los 3 releases borrador obsoletos: `v0.5.0`, `v0.3.0`, `v0.2.4`.
- Los tags git NO se tocan.
- Quedan publicadas: `v0.5.1`, `v0.4.2`, `v0.4.1`, `v0.4.0`, `v0.3.7`…`v0.3.1`, `v0.2.3` y las antiguas (`v.0.2.0`…`v.0.2.2`, `V.0.1.0`, `v.0.0.2`, `v.0.0.3`, `v0.0.1`).

### 2. Reescritura de `release.yml`

Flujo del workflow único (trigger: `workflow_dispatch`, input `version`):

1. **Validación**: lee `package.json`, compara `version` con el input normalizado (con/sin `v`). Si no coinciden → el job falla con mensaje claro: "package.json version (X.Y.Z) no coincide con el tag solicitado (vA.B.C). Haz el bump primero." También falla si el tag ya existe en el repo.
2. **Checkout** del repositorio (fetch-depth 0).
3. **Setup Node.js** (20), `npm ci`.
4. **Instalar Chrome y FFmpeg** para Windows.
5. **Build**: `npm run dist:win` (genera `.exe` con la versión de `package.json`).
6. **Verificación del build** (que exista `.exe` y que la versión interna coincida con el tag).
7. **Crear y pushear el tag** `vX.Y.Z` en el commit de HEAD (con `git config` del bot). Si el tag ya existe → falla.
8. **Publicar release** con `softprops/action-gh-release`: `tag_name` = input, nombre canónico = `vX.Y.Z`, assets = `dist/*.exe`, `generate_release_notes: true`, `draft: false`, `prerelease: false`.

### 3. Eliminación de `build-windows.yml`

- Causa de las releases duplicadas (se disparaba al pushear tags `v*`).
- Se elimina el archivo.

### 4. `ci.yml` intacto

- Tests y build de verificación en push/PR a `main`/`develop`. No se modifica.

### 5. README

- Línea 2: badge de versión `0.5.0` → `0.5.1`.
- Añadir sección corta **"Release"** documentando el flujo:
  1. `npm version patch|minor|major` (o editar `package.json`).
  2. Commit + push a `main`.
  3. Disparar el workflow `Release` en GitHub Actions con la versión exacta (ej. `v0.6.0`).
  4. El workflow valida, crea el tag, compila y publica.

## Verificación

- El workflow `Release` validará que `package.json` y el tag coincidan; un tag sin bump previo fallará en el paso de validación.
- Tras la limpieza, `gh release list` mostrará solo releases publicadas, sin borradores.
- Las próximas releases tendrán nombre canónico `vX.Y.Z` y un solo asset por release.

## No incluido (fuera de alcance)

- Renombrar/eliminar tags antiguos mal formateados en remoto.
- Renombrar releases publicadas antiguas.
- Versionado por fecha u otro esquema distinto de SemVer `vX.Y.Z`.
