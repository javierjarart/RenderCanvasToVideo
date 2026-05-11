const express = require('express');
const puppeteer = require('puppeteer');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// Verificar dependencias
try {
    execSync('ffmpeg -version');
    console.log('✅ FFmpeg detectado');
} catch (e) {
    console.error('❌ ERROR: FFmpeg no está instalado o no se encuentra en el PATH');
    process.exit(1);
}

// Asegurar que los directorios existan
const projectsPath = path.join(__dirname, 'proyectos');
const rendersPath = path.join(__dirname, 'renders');
if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath);
if (!fs.existsSync(rendersPath)) fs.mkdirSync(rendersPath);

// Servir carpetas estáticas
app.use(express.static('public'));
app.use('/proyectos', express.static(projectsPath));
app.use('/renders', express.static(rendersPath));

// Estado global para la barra de progreso
let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };

// API: Listar las carpetas dentro de /proyectos
app.get('/api/projects', (req, res) => {
    const projectsPath = path.join(__dirname, 'proyectos');
    if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath);
    
    const directories = fs.readdirSync(projectsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    res.json(directories);
});

// API: Obtener el estado del render actual (para la UI)
app.get('/api/status', (req, res) => {
    res.json(renderStatus);
});

// API: Iniciar render
app.post('/api/render', async (req, res) => {
    if (renderStatus.state === 'rendering') {
        return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, width, height, fps, duration, bgColor } = req.body;
    const totalFrames = parseInt(fps) * parseInt(duration);
    const fileName = `Render_${project}_${Date.now()}.mp4`;
    const outputPath = path.join(__dirname, 'renders', fileName);
    
    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' }); // Respondemos rápido a la UI

    // Proceso asíncrono de renderizado
    let browser;
    try {
        browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
}); 
        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: parseInt(height) });

        // Control del tiempo
        await page.evaluateOnNewDocument(() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        });

        // Abrir el proyecto local
        const projectUrl = `http://localhost:3000/proyectos/${project}/index.html`;
        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        // Iniciar FFmpeg
        const ffmpeg = spawn('ffmpeg',[
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(), 
            '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outputPath
        ]);

        ffmpeg.on('error', (err) => {
            console.error('Error en FFmpeg:', err);
            renderStatus.state = 'error';
            renderStatus.error = `FFmpeg error: ${err.message}`;
        });

        // Ciclo de dibujo
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
                return tempCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, "");
            }, bgColor || '#000000');

            ffmpeg.stdin.write(Buffer.from(base64Data, 'base64'));
            
            // Actualizar la barra de progreso
            renderStatus.progress = i;
        }

        ffmpeg.stdin.end();

        const ffmpegClosePromise = new Promise((resolve) => {
            ffmpeg.on('close', async (code) => {
                if (code !== 0 && renderStatus.state !== 'error') {
                    renderStatus.state = 'error';
                    renderStatus.error = `FFmpeg terminó con código ${code}`;
                } else if (renderStatus.state !== 'error') {
                    renderStatus.state = 'done';
                    renderStatus.fileUrl = `/renders/${fileName}`;
                }
                resolve();
            });
        });

        await ffmpegClosePromise;

    } catch (err) {
        console.error('Error durante el renderizado:', err);
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(3000, () => console.log('✅ UI lista en http://localhost:3000'));