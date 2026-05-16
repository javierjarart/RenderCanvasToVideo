# Plan de Migración de Dependencias

## Fase 1 — Actualizaciones seguras (sin riesgo)
Ejecutar en orden:

```bash
npm update puppeteer          # 24.43.0 → 24.43.1 (patch)
npm update ffmpeg-static      # ya resuelto a 5.3.0, verificar
npm update                    # aplicar todos los patches/minors seguros
```

Verificar: `npm test` debe pasar sin cambios de código.

---

## Fase 2 — electron-builder 25 → 26

### Pasos:
1. `npm install electron-builder@latest --save-dev`
2. Revisar `package.json` campo `build`:
   - `directories.output` → verificar que sigue funcionando
   - `extraResources` → chequear rutas relativas
   - `files` patterns → probar que empaqueta correctamente
3. Probar build:
   ```bash
   npm run dist:linux   # o la plataforma correspondiente
   ```

### Breaking changes conocidos:
- `electron-builder@26` cambió el formato de algunos campos de configuración
- `nsis` options pueden requerir ajustes
- Ver changelog: https://github.com/electron-userland/electron-builder/releases

---

## Fase 3 — Electron 35 → 42 (migración mayor)

### Estrategia: migración directa a 42.x (no incremental)

#### Paso 3.1 — Preparación
```bash
npm install electron@latest --save-dev
```

#### Paso 3.2 — Verificar APIs críticas
| API / Archivo | Línea | Verificar en v42 |
|---|---|---|
| `main.js` | `BrowserWindow` constructor | Options compatibles |
| `main.js` | `webPreferences.contextIsolation` | Sigue siendo `true` ✅ |
| `main.js` | `webPreferences.nodeIntegration` | Sigue siendo `false` ✅ |
| `main.js` | `ipcMain.handle` | API estable |
| `main.js` | `shell.openPath` | API estable |
| `preload.js` | `contextBridge.exposeInMainWorld` | API estable |
| `main.js` | `app.whenReady` | API estable |
| `main.js` | `fork('server.js')` | Child process no afectado por Electron |

#### Paso 3.3 — Testing
```bash
npm run dev              # verificar que la UI carga
npm test                 # pipeline test
npm run dist:linux       # build completo
```

#### Paso 3.4 — Posibles breaking changes a revisar
- `BrowserWindow` — algunas opciones de `webPreferences` fueron deprecadas
- `nativeImage` — cambios en creación desde buffer
- `protocol` — registro de esquemas personalizados
- `session` — API de permisos
- Chromium upgrade — puede afectar `puppeteer` (verificar compatibilidad)

---

## Fase 4 — Dependencias mantenibles (futuro)

| Paquete | Recomendación | Motivo |
|---|---|---|
| `fluent-ffmpeg` | Dejar como está | Sin nuevas versiones, estable |
| `ffmpeg-static` | Actualizar con `npm update` | `^` ya cubre minors |
| `puppeteer` | Mantener `^24.x` | Actualizar con `npm update` periódicamente |
| `express` | Dejar como está | Última versión ya instalada |
| `@modelcontextprotocol/sdk` | Dejar como está | Última versión ya instalada |

---

## Rollback plan

Si algo falla después de una actualización:

```bash
git checkout -- package.json package-lock.json
rm -rf node_modules
npm install
```

Esto restaura las versiones originales del lockfile.
