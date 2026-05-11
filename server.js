const express = require('express');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
app.use(express.json());

// Raíz dinámica: funciona tanto en desarrollo como empaquetado con electron-builder
const APP_ROOT = process.env.APP_ROOT || __dirname;

// Servir carpetas estáticas
app.use(express.static(path.join(APP_ROOT, 'public')));
app.use('/proyectos', express.static(path.join(APP_ROOT, 'proyectos')));
app.use('/renders', express.static(path.join(APP_ROOT, 'renders')));

// Estado global para la barra de progreso
let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };

// API: Listar carpetas dentro de /proyectos
app.get('/api/projects', (req, res) => {
    const projectsPath = path.join(APP_ROOT, 'proyectos');
    if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });
    const directories = fs.readdirSync(projectsPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    res.json(directories);
});

// API: Estado del render
app.get('/api/status', (req, res) => {
    res.json(renderStatus);
});

// API: Iniciar render
app.post('/api/render', async (req, res) => {
    if (renderStatus.state === 'rendering') {
        return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, width, height, fps, duration, bgColor, customOutputDir } = req.body;
    const totalFrames = parseInt(fps) * parseInt(duration);
    const fileName = `Render_${project}_${Date.now()}.mp4`;

    const rendersDir = customOutputDir || path.join(APP_ROOT, 'renders');
    if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
    const outputPath = path.join(rendersDir, fileName);

    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' });

    try {
        // ── Puppeteer usando el Chromium que trae Electron ─────────────────
        // En desarrollo usamos el que descarga puppeteer.
        // En producción (Electron empaquetado), intentamos usar el ejecutable de Electron.
        let executablePath = null;
        try {
            executablePath = puppeteer.executablePath();
        } catch (e) {
            console.warn("Puppeteer no encontró un navegador por defecto, intentando fallback...");
        }

        // Fallback para Electron empaquetado
        if (!executablePath || !fs.existsSync(executablePath)) {
            if (process.env.ELECTRON_PATH) {
                executablePath = process.env.ELECTRON_PATH;
            }
        }

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: parseInt(height) });

        // Control determinístico del tiempo
        await page.evaluateOnNewDocument(() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        });

        const projectUrl = `http://localhost:3000/proyectos/${project}/index.html`;
        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        // ── FFmpeg usando ffmpeg-static (binario incluido en el paquete) ────
        const ffmpeg = spawn(ffmpegPath, [
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(),
            '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outputPath
        ]);

        ffmpeg.stderr.on('data', (d) => process.stderr.write(d)); // logs de ffmpeg visibles

        // Ciclo de frames
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

            ffmpeg.stdin.write(Buffer.from(base64Data, 'base64'));
            renderStatus.progress = i;
        }

        ffmpeg.stdin.end();

        ffmpeg.on('close', async () => {
            await browser.close();
            renderStatus.state = 'done';
            renderStatus.fileUrl = `/renders/${fileName}`;
        });

    } catch (err) {
        console.error(err);
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    }
});

app.listen(3000, () => console.log('✅ Servidor listo en http://localhost:3000'));
