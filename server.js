const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');

function resolveFfmpegPath() {
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const bundled = path.join(APP_ROOT, 'bin', binaryName);
    if (fs.existsSync(bundled)) return bundled;
    return 'ffmpeg';
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
        let chrome = installed.find(b => b.browser === Browser.CHROME && b.platform === currentPlatform);
        if (!chrome) {
            chrome = installed.find(b => b.browser === Browser.CHROME);
        }
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

app.use(express.static(path.join(APP_ROOT, 'public')));
app.use('/proyectos', express.static(path.join(APP_ROOT, 'proyectos')));
app.use('/renders', express.static(path.join(APP_ROOT, 'renders')));

app.use('/external-project', (req, res, next) => {
    if (currentCustomProjectPath && fs.existsSync(currentCustomProjectPath)) {
        return express.static(currentCustomProjectPath)(req, res, next);
    }
    res.status(404).send('Proyecto externo no configurado o no encontrado');
});

let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };

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

app.post('/api/render', async (req, res) => {
    if (renderStatus.state === 'rendering') {
        return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath } = req.body;
    const totalFrames = parseInt(fps) * parseInt(duration);

    let projectName = project;
    if (customProjectPath) {
        currentCustomProjectPath = customProjectPath;
        projectName = path.basename(customProjectPath);
    }

    const fileName = `Render_${projectName}_${Date.now()}.mp4`;

    const rendersDir = customOutputDir || path.join(APP_ROOT, 'renders');
    if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
    const outputPath = path.join(rendersDir, fileName);

    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' });

    try {
        if (!chromeExecutablePath || !fs.existsSync(chromeExecutablePath)) {
            throw new Error('Chromium no está instalado. Espera a que termine la instalación.');
        }

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: chromeExecutablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
        });

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

        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        ffmpeg.setFfmpegPath(resolveFfmpegPath());

        const inputStream = new PassThrough();

        const ffCommand = ffmpeg(inputStream)
            .inputOptions(['-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps)])
            .videoCodec('libx264')
            .outputOptions(['-pix_fmt', 'yuv420p', '-crf', '18', '-y'])
            .output(outputPath)
            .on('error', (err) => {
                renderStatus.state = 'error';
                renderStatus.error = err.message;
                browser.close().catch(() => {});
            })
            .on('end', () => {
                browser.close().catch(() => {});
                renderStatus.state = 'done';
                renderStatus.fileUrl = `/renders/${fileName}`;
            });

        ffCommand.run();

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
        }

        inputStream.end();

    } catch (err) {
        console.error(err);
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    }
});

const PORT = process.env.PORT || 3000;

async function start() {
    if (!await findChrome()) {
        await ensureChrome();
    }
    app.listen(PORT, () => {
        console.log(`Servidor listo en http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Error iniciando servidor:', err);
    process.exit(1);
});
