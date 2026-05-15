const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');

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

const app = express();
app.use(express.json());

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

function captureLog(level, args) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(a => typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a, null, 2)) : String(a)).join(' ');
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
        return express.static(currentCustomProjectPath)(req, res, next);
    }
    res.status(404).send('Proyecto externo no configurado o no encontrado');
});

let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };

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

app.post('/api/render', async (req, res) => {
    if (renderStatus.state === 'rendering') {
        return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, codec, container, pixFmt, codecParams, crf } = req.body;
    const totalFrames = parseInt(fps) * parseInt(duration);

    const vCodec = codec || 'libx264';
    const vContainer = container || '.mp4';
    const vPixFmt = pixFmt || 'yuv420p';
    const vCodecParams = codecParams || {};

    let projectName = project;
    if (customProjectPath) {
        currentCustomProjectPath = customProjectPath;
        projectName = path.basename(customProjectPath);
    }

    const fileName = `Render_${projectName}_${Date.now()}${vContainer}`;

    const rendersDir = customOutputDir || path.join(APP_ROOT, 'renders');
    if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
    const outputPath = path.join(rendersDir, fileName);

    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' });

    log('log', `═══ Render iniciado ═══`);
    log('log', `Proyecto: ${projectName}`);
    log('log', `Resolución: ${width}x${height}, FPS: ${fps}, Duración: ${duration}s, Total cuadros: ${totalFrames}`);
    log('log', `Codec: ${vCodec} | PixFmt: ${vPixFmt} | Container: ${vContainer} | CRF: ${crf || 18}`);
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

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: chromeExecutablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
        });

        log('log', 'Chromium lanzado correctamente.');

        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: parseInt(height) });

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

        const canvasFound = await page.evaluate(() => !!document.querySelector('canvas'));
        if (!canvasFound) {
            const title = await page.evaluate(() => document.title);
            const bodyPreview = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '(sin contenido)');
            throw new Error(`No se encontró <canvas> en la página.\nTítulo: ${title}\nBody: ${bodyPreview}`);
        }

        log('log', 'Canvas encontrado.');

        const canvasSize = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            return { width: c.width, height: c.height };
        });
        log('log', `Canvas encontrado: ${canvasSize.width}x${canvasSize.height}`);

        const ffmpegPath = resolveFfmpegPath();
        ffmpeg.setFfmpegPath(ffmpegPath);
        log('log', `FFmpeg: ${ffmpegPath}`);

        const inputStream = new PassThrough();

        const outputOpts = ['-pix_fmt', vPixFmt, '-y'];
        if (vCodec === 'libx264') {
            outputOpts.push('-crf', String(crf || 18));
        }
        for (const [key, val] of Object.entries(vCodecParams)) {
            outputOpts.push(`-${key}`, String(val));
        }

        const ffCommand = ffmpeg(inputStream)
            .inputOptions(['-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps)])
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
                browser.close().catch(() => {});
            })
            .on('end', () => {
                log('log', 'FFmpeg finalizado correctamente.');
                browser.close().catch(() => {});
                renderStatus.state = 'done';
                renderStatus.fileUrl = `/renders/${fileName}`;
            });

        ffCommand.run();

        log('log', 'Iniciando captura de cuadros...');

        for (let i = 1; i <= totalFrames; i++) {
            const timeMs = i * (1000 / fps);

            await page.evaluate((time) => {
                window.__frameTime = time;
                if (window.__rAFCallback) {
                    const cb = window.__rAFCallback;
                    window.__rAFCallback = null;
                    cb(time);
                }
            }, timeMs);

            const base64Data = await page.evaluate((bg) => {
                const targetCanvas = document.querySelector('canvas');
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
            }, bgColor || '#000000');

            inputStream.write(Buffer.from(base64Data, 'base64'));
            renderStatus.progress = i;

            if (i % Math.max(1, Math.floor(totalFrames / 10)) === 0 || i === totalFrames) {
                const pct = Math.round((i / totalFrames) * 100);
                log('log', `Cuadro ${i}/${totalFrames} (${pct}%)`);
            }
        }

        log('log', `Captura completada: ${totalFrames} cuadros enviados a FFmpeg.`);

        inputStream.end();
    }
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
    app.listen(PORT, () => {
        log('log', `Servidor listo en http://localhost:${PORT}`);
    });
}

start().catch(err => {
    log('error', 'Error iniciando servidor:', err);
    process.exit(1);
});
