const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');
const multer = require('multer');

function resolveSafe(base, ...paths) {
    const resolved = path.resolve(base, ...paths);
    if (!resolved.startsWith(path.resolve(base))) {
        throw new Error(`Path traversal detected: ${paths.join('/')}`);
    }
    return resolved;
}

function resolveFfmpegPath() {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
    const bundled = path.join(APP_ROOT, 'bin', binaryName);
    if (fs.existsSync(bundled)) return bundled;
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
    return binaryName;
}
const { install, getInstalledBrowsers, resolveBuildId, detectBrowserPlatform, Browser } = require('@puppeteer/browsers');

const ALLOWED_CODEC_PARAMS = new Set(['format', 'quality']);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    if (!req.path.startsWith('/proyectos/') && !req.path.startsWith('/external-project/')) {
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
        );
    }
    next();
});

const APP_ROOT = process.env.APP_ROOT || __dirname;
const CHROME_CACHE_DIR = process.env.CHROME_CACHE_DIR || path.join(APP_ROOT, '.cache', 'puppeteer');

let chromeExecutablePath = null;

async function findChrome() {
    try {
        const installed = await getInstalledBrowsers({ cacheDir: CHROME_CACHE_DIR });
        const currentPlatform = detectBrowserPlatform();
        const chrome = installed.find(b => b.browser === Browser.CHROME && b.platform === currentPlatform);
        if (chrome) {
            chromeExecutablePath = chrome.executablePath;
            return true;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

async function ensureChrome() {
    if (await findChrome()) return;
    const platform = detectBrowserPlatform();
    const buildId = await resolveBuildId(Browser.CHROME, platform, 'latest');
    const result = await install({
        browser: Browser.CHROME,
        platform,
        cacheDir: CHROME_CACHE_DIR,
        buildId,
        downloadProgressCallback: 'default',
    });
    chromeExecutablePath = result.executablePath;
}

let currentCustomProjectPath = null;

// ─── Buffer de logs ─────────────────────────────────────────────────────────
const logBuffer = [];
const MAX_LOG_LINES = 2000;

function sanitizePath(msg) {
    if (typeof msg !== 'string') return msg;
    return msg.split(APP_ROOT).join('<root>');
}

function sanitizeArgs(args) {
    return args.map(a => {
        if (typeof a === 'string') return sanitizePath(a);
        if (a instanceof Error) return sanitizePath(a.stack || a.message);
        if (typeof a === 'object') return sanitizePath(JSON.stringify(a, null, 2));
        return a;
    });
}

function captureLog(level, args) {
    const timestamp = new Date().toLocaleTimeString();
    const sanitized = sanitizeArgs(args);
    const message = sanitized.map(a => typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a, null, 2)) : String(a)).join(' ');
    logBuffer.push({ timestamp, level, message });
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
}

function log(level, ...args) {
    captureLog(level, args);
    const fn = level === 'error' ? origError : level === 'warn' ? origWarn : origLog;
    fn.apply(console, args);
}

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => { captureLog('log', args); origLog.apply(console, args); };
console.warn = (...args) => { captureLog('warn', args); origWarn.apply(console, args); };
console.error = (...args) => { captureLog('error', args); origError.apply(console, args); };

app.use(express.static(path.join(APP_ROOT, 'public')));
app.use('/proyectos', express.static(path.join(APP_ROOT, 'proyectos')));
app.use('/renders', express.static(path.join(APP_ROOT, 'renders')));

app.use('/external-project', (req, res, next) => {
    if (currentCustomProjectPath) {
        log('log', `[external-project] Sirviendo desde: ${currentCustomProjectPath}`);
        if (!fs.existsSync(currentCustomProjectPath)) {
            log('error', `[external-project] Ruta no existe: ${currentCustomProjectPath}`);
            return res.status(404).send(`Ruta no encontrada: ${currentCustomProjectPath}`);
        }
        return express.static(currentCustomProjectPath, {
            dotfiles: 'deny',
            index: ['index.html'],
        })(req, res, next);
    }
    res.status(404).send('Proyecto externo no configurado o no encontrado');
});

let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };
let currentBrowser = null;
let renderCancelled = false;

app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

app.get('/api/projects', (req, res) => {
    const projectsPath = path.join(APP_ROOT, 'proyectos');
    if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });
    const directories = fs.readdirSync(projectsPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    res.json(directories);
});

app.get('/api/status', (req, res) => {
    res.json(renderStatus);
});

app.get('/api/logs', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const newLogs = logBuffer.slice(since);
    res.json({ logs: newLogs, total: logBuffer.length });
});

// ─── Obtener selectores de canvas del proyecto ──────────────────────────────
app.get('/api/canvas-selectors', (req, res) => {
    const { project, path: customPath } = req.query;
    let htmlPath;

    if (customPath) {
        htmlPath = path.join(customPath, 'index.html');
    } else if (project) {
        htmlPath = path.join(APP_ROOT, 'proyectos', project, 'index.html');
    } else {
        return res.status(400).json({ error: 'Se requiere project o path' });
    }

    if (!fs.existsSync(htmlPath)) {
        return res.json({ selectors: [] });
    }

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const selectors = [];

    const canvasRegex = /<canvas[^>]*>/gi;
    let match;
    while ((match = canvasRegex.exec(html)) !== null) {
        const tag = match[0];
        const idMatch = tag.match(/\bid=["']([^"']+)["']/i);
        if (idMatch) {
            selectors.push(`#${idMatch[1]}`);
        }
        const classMatch = tag.match(/\bclass=["']([^"']+)["']/i);
        if (classMatch) {
            for (const cls of classMatch[1].split(/\s+/)) {
                if (cls) selectors.push(`.${cls}`);
            }
        }
    }

    const unique = [...new Set(selectors)];
    res.json({ selectors: unique });
});

// ─── Upload de carpeta de proyecto ───────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

app.post('/api/upload-project', (req, res) => {
    upload.array('files')(req, res, async (err) => {
        if (err) {
            log('error', `Error en upload:`, err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'El archivo excede el límite de 500MB.' });
            }
            return res.status(500).json({ error: err.message || 'Error al procesar la subida.' });
        }
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No se recibieron archivos.' });
        }

    const first = decodeURIComponent(files[0].originalname);
    const sep = first.includes('/') ? '/' : (first.includes('%2F') ? '%2F' : null);
    const folderName = sep ? first.split(sep)[0] : `upload-${Date.now()}`;
    const destDir = path.join(APP_ROOT, 'proyectos', folderName);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    for (const file of files) {
        const relative = decodeURIComponent(file.originalname);
        const parts = relative.split('/');
        const subpath = parts.length > 1 ? parts.slice(1).join('/') : 'index.html';
        const filePath = path.join(destDir, subpath);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, file.buffer);
    }

    log('log', `Proyecto subido: ${folderName} → ${destDir}`);
    res.json({ path: destDir, name: folderName });
    });
});

app.post('/api/render', async (req, res) => {
    if (renderStatus.state === 'rendering') {
        return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, codec, container, pixFmt, codecParams, crf, colorPrimaries, colorTrc, colorSpace, canvasSelector } = req.body;

    if (!project && !customProjectPath) {
        return res.status(400).json({ error: 'Debe especificar un proyecto (project o customProjectPath).' });
    }

    const vWidth = parseInt(width);
    const vHeight = parseInt(height);
    const vFps = parseInt(fps);
    const vDuration = parseInt(duration);

    if (!vWidth || !vHeight || !vFps || !vDuration) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (width, height, fps, duration).' });
    }

    const totalFrames = vFps * vDuration;

    const vCodec = codec || 'libx264';
    const vContainer = container || '.mp4';
    const vPixFmt = pixFmt || 'yuv420p';
    const vCodecParams = codecParams || {};

    let projectName = project;
    if (customProjectPath) {
        const resolved = path.isAbsolute(customProjectPath)
            ? path.resolve(customProjectPath)
            : resolveSafe(APP_ROOT, customProjectPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            return res.status(400).json({ error: `Ruta de proyecto inválida: ${customProjectPath}` });
        }
        currentCustomProjectPath = resolved;
        projectName = path.basename(resolved);
    }

    const fileName = `Render_${projectName}_${Date.now()}${vContainer}`;

    const rendersDir = customOutputDir || path.join(APP_ROOT, 'renders');
    if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
    const outputPath = path.join(rendersDir, fileName);

    renderCancelled = false;
    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' });

    log('log', `═══ Render iniciado ═══`);
    log('log', `Proyecto: ${projectName}`);
    log('log', `Resolución: ${vWidth}x${vHeight}, FPS: ${vFps}, Duración: ${vDuration}s, Total cuadros: ${totalFrames}`);
    const colorProfileStr = [colorPrimaries, colorTrc, colorSpace].filter(Boolean).join('/') || 'none';
    log('log', `Codec: ${vCodec} | PixFmt: ${vPixFmt} | Container: ${vContainer} | CRF: ${crf || 18} | Color: ${colorProfileStr}`);
    log('log', `Color fondo: ${bgColor}`);
    log('log', `Salida: ${outputPath}`);

    try {
        const timeoutMs = Math.max(300000, totalFrames * 1000); // min 5min, aprox 1s per frame
        const result = await Promise.race([
            renderJob(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Render timed out after ${timeoutMs / 1000}s`)), timeoutMs)
            )
        ]);
        return result;
    } catch (err) {
        log('error', `Error en render:`, err);
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    }

    async function renderJob() {
        if (!chromeExecutablePath || !fs.existsSync(chromeExecutablePath)) {
            throw new Error('Chromium no está instalado. Espera a que termine la instalación.');
        }

        log('log', `Lanzando Chromium desde: ${chromeExecutablePath}`);

        const chromeArgs = [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ];
        const browser = await puppeteer.launch({
            headless: 'shell',
            args: chromeArgs,
            env: { ...process.env, LD_LIBRARY_PATH: '/home/flwr/chrome-libs' },
        });

        log('log', 'Chromium lanzado correctamente.');
        currentBrowser = browser;

        const page = await browser.newPage();
        await page.setViewport({ width: vWidth, height: vHeight });

        await page.evaluateOnNewDocument(() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        });

        const baseUrl = `http://localhost:${PORT}`;
        const projectUrl = customProjectPath
            ? `${baseUrl}/external-project/index.html`
            : `${baseUrl}/proyectos/${project}/index.html`;

        log('log', `Cargando página: ${projectUrl}`);

        page.on('pageerror', err => log('error', `Error en página: ${err.message}`));
        page.on('console', msg => {
            if (msg.type() === 'error') log('error', `[Consola] ${msg.text()}`);
        });
        page.on('requestfailed', req => log('warn', `Recurso no cargado: ${req.url()} (${req.failure()?.errorText})`));
        page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

        let pageLoaded = false;
        try {
            const gotoPromise = page.goto(projectUrl, { waitUntil: 'load', timeout: 20000 });
            const canvasPromise = page.waitForSelector('canvas', { timeout: 30000 });
            await Promise.race([gotoPromise, canvasPromise]);
            pageLoaded = true;
        } catch (e) {
            log('warn', `page.goto falló, intentando setContent: ${e.message}`);
        }

        if (!pageLoaded) {
            const htmlPath = customProjectPath
                ? path.join(customProjectPath, 'index.html')
                : path.join(APP_ROOT, 'proyectos', project, 'index.html');

            log('log', `Leyendo HTML desde: ${htmlPath}`);

            if (!fs.existsSync(htmlPath)) {
                throw new Error(`No se encontró index.html en: ${htmlPath}`);
            }

            const html = fs.readFileSync(htmlPath, 'utf-8');
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        log('log', 'Buscando <canvas>...');

        const canvasFound = await page.evaluate((sel) => !!document.querySelector(sel || 'canvas'), canvasSelector);
        if (!canvasFound) {
            const title = await page.evaluate(() => document.title);
            const bodyPreview = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '(sin contenido)');
            throw new Error(`No se encontró <canvas> en la página.\nTítulo: ${title}\nBody: ${bodyPreview}`);
        }

        log('log', 'Canvas encontrado.');

        const canvasSize = await page.evaluate((sel) => {
            const c = document.querySelector(sel || 'canvas');
            return { width: c.width, height: c.height };
        }, canvasSelector);
        log('log', `Canvas encontrado: ${canvasSize.width}x${canvasSize.height}`);

        const targetW = vWidth;
        const targetH = vHeight;
        if (canvasSize.width !== targetW || canvasSize.height !== targetH) {
            log('log', `Redimensionando canvas de ${canvasSize.width}x${canvasSize.height} a ${targetW}x${targetH}`);
            await page.evaluate(({ w, h, sel }) => {
                const c = document.querySelector(sel || 'canvas');
                c.width = w;
                c.height = h;
            }, { w: targetW, h: targetH, sel: canvasSelector });
        }

        const ffmpegPath = resolveFfmpegPath();
        ffmpeg.setFfmpegPath(ffmpegPath);
        log('log', `FFmpeg: ${ffmpegPath}`);

        const inputStream = new PassThrough();

        const outputOpts = ['-pix_fmt', vPixFmt, '-y'];
        if (vCodec === 'libx264' || vCodec === 'libx265') {
            outputOpts.push('-crf', String(crf || (vCodec === 'libx265' ? 28 : 18)));
        }
        for (const [key, val] of Object.entries(vCodecParams)) {
            if (ALLOWED_CODEC_PARAMS.has(key)) {
                outputOpts.push(`-${key}`, String(val));
            }
        }
        if (colorPrimaries) outputOpts.push('-color_primaries', colorPrimaries);
        if (colorTrc) outputOpts.push('-color_trc', colorTrc);
        if (colorSpace) outputOpts.push('-colorspace', colorSpace);

        const ffCommand = ffmpeg(inputStream)
            .inputOptions(['-f', 'image2pipe', '-vcodec', 'png', '-r', String(vFps)])
            .videoCodec(vCodec)
            .outputOptions(outputOpts)
            .output(outputPath)
            .on('start', (cmd) => {
                log('log', `FFmpeg iniciado: ${cmd}`);
            })
            .on('progress', (info) => {
                log('log', `FFmpeg: ${JSON.stringify(info)}`);
            })
            .on('error', (err) => {
                log('error', `FFmpeg error: ${err.message}`);
                renderStatus.state = 'error';
                renderStatus.error = err.message;
                browser.close().catch(e => log('error', 'Error closing browser:', e.message));
            })
            .on('end', () => {
                log('log', 'FFmpeg finalizado correctamente.');
                browser.close().catch(e => log('error', 'Error closing browser:', e.message));
                renderStatus.state = 'done';
                renderStatus.fileUrl = `/renders/${fileName}`;
            });

        ffCommand.run();

        log('log', 'Iniciando captura de cuadros...');

        for (let i = 1; i <= totalFrames; i++) {
            if (renderCancelled) {
                log('log', 'Render cancelado por el usuario.');
                break;
            }
            const timeMs = i * (1000 / vFps);

            await page.evaluate((time) => {
                window.__frameTime = time;
                if (window.__rAFCallback) {
                    const cb = window.__rAFCallback;
                    window.__rAFCallback = null;
                    cb(time);
                }
            }, timeMs);

            const base64Data = await page.evaluate(({ bg, sel }) => {
                const targetCanvas = document.querySelector(sel || 'canvas');
                if (!window.__exportCanvas) {
                    window.__exportCanvas = document.createElement('canvas');
                    window.__exportCtx = window.__exportCanvas.getContext('2d');
                }
                const tempCanvas = window.__exportCanvas;
                const ctx = window.__exportCtx;
                tempCanvas.width = targetCanvas.width;
                tempCanvas.height = targetCanvas.height;
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                ctx.drawImage(targetCanvas, 0, 0);
                return tempCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
            }, { bg: bgColor || '#000000', sel: canvasSelector });

            inputStream.write(Buffer.from(base64Data, 'base64'));
            renderStatus.progress = i;

            if (i % Math.max(1, Math.floor(totalFrames / 10)) === 0 || i === totalFrames) {
                const pct = Math.round((i / totalFrames) * 100);
                log('log', `Cuadro ${i}/${totalFrames} (${pct}%)`);
            }
        }

        if (renderCancelled) {
            log('log', 'Render cancelado.');
        } else {
            log('log', `Captura completada: ${totalFrames} cuadros enviados a FFmpeg.`);
        }

        inputStream.end();
    }
});

app.post('/api/render/reset', (req, res) => {
    renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };
    renderCancelled = false;
    currentBrowser = null;
    log('log', 'Estado del render reseteado.');
    res.json({ message: 'Estado reseteado' });
});

app.post('/api/render/cancel', (req, res) => {
    if (renderStatus.state !== 'rendering') {
        return res.status(400).json({ error: 'No hay un render en proceso.' });
    }
    renderCancelled = true;
    if (currentBrowser) {
        currentBrowser.close().catch(() => {});
        currentBrowser = null;
    }
    renderStatus.state = 'cancelled';
    renderStatus.error = null;
    log('log', 'Render cancelado por el usuario.');
    res.json({ message: 'Render cancelado' });
});

const PORT = process.env.PORT || 3000;

async function start() {
    log('log', 'Buscando Chromium instalado...');
    if (!await findChrome()) {
        log('log', 'Chromium no encontrado. Descargando...');
        await ensureChrome();
        log('log', `Chromium descargado en: ${chromeExecutablePath}`);
    } else {
        log('log', `Chromium encontrado en: ${chromeExecutablePath}`);
    }
    app.listen(PORT, '0.0.0.0', () => {
        log('log', `Servidor listo en http://localhost:${PORT}`);
    });
}

start().catch(err => {
    log('error', 'Error iniciando servidor:', err);
    process.exit(1);
});
