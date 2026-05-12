#!/usr/bin/env node
const express = require('express');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

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

async function ensureChrome() {
    const installed = await getInstalledBrowsers({ cacheDir: CHROME_CACHE_DIR });
    const chrome = installed.find(b => b.browser === Browser.CHROME);
    if (chrome) {
        chromeExecutablePath = chrome.executablePath;
        return;
    }
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
    res.json({ message: 'Render iniciado', fileName });

    try {
        let executablePath = null;
        try {
            executablePath = puppeteer.executablePath();
        } catch (e) {
            process.stderr.write("Puppeteer no encontró un navegador por defecto, intentando fallback...\n");
        }

        if (!executablePath || !fs.existsSync(executablePath)) {
            executablePath = chromeExecutablePath;
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

        await page.evaluateOnNewDocument(() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        });

        const projectUrl = customProjectPath
            ? `http://localhost:${PORT}/external-project/index.html`
            : `http://localhost:${PORT}/proyectos/${project}/index.html`;

        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        const ffmpeg = spawn(resolveFfmpegPath(), [
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(),
            '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outputPath
        ]);

        ffmpeg.stderr.on('data', (d) => process.stderr.write(d));

        let ffmpegError = null;
        ffmpeg.on('error', (err) => {
            ffmpegError = err.message;
            process.stderr.write('Error en ffmpeg: ' + err.message + '\n');
        });

        ffmpeg.on('close', (code) => {
            if (ffmpegError) {
                renderStatus.state = 'error';
                renderStatus.error = ffmpegError;
                browser.close().catch(() => {});
                return;
            }
            if (code !== 0) {
                renderStatus.state = 'error';
                renderStatus.error = `ffmpeg terminó con código ${code}`;
                browser.close().catch(() => {});
                return;
            }
            browser.close().catch(() => {});
            renderStatus.state = 'done';
            renderStatus.fileUrl = `/renders/${fileName}`;
        });

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

    } catch (err) {
        process.stderr.write(err.stack + '\n');
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    }
});

const PORT = parseInt(process.env.MCP_PORT || '3000');

async function main() {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

    const mcp = new McpServer({
        name: 'RenderCanvasToVideo',
        version: '1.0.0'
    });

    mcp.tool('list_projects',
        'List available canvas projects in the proyectos directory',
        {},
        async () => {
            const projectsPath = path.join(APP_ROOT, 'proyectos');
            const dirs = fs.existsSync(projectsPath)
                ? fs.readdirSync(projectsPath, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name)
                : [];
            return {
                content: [{ type: 'text', text: JSON.stringify(dirs) }]
            };
        }
    );

    mcp.tool('render_canvas',
        'Render a canvas animation to video. Starts the render and returns immediately. Poll get_render_status for completion.',
        {
            project: {
                type: 'string',
                description: 'Name of the project folder inside proyectos/ directory (omit if using customProjectPath)'
            },
            width: {
                type: 'number',
                description: 'Video width in pixels'
            },
            height: {
                type: 'number',
                description: 'Video height in pixels'
            },
            fps: {
                type: 'number',
                description: 'Frames per second'
            },
            duration: {
                type: 'number',
                description: 'Duration in seconds'
            },
            bgColor: {
                type: 'string',
                description: 'Background color for transparent pixels (hex, e.g. #000000)'
            },
            customOutputDir: {
                type: 'string',
                description: 'Custom output directory for the rendered video'
            },
            customProjectPath: {
                type: 'string',
                description: 'Path to an external project folder containing index.html with a canvas'
            }
        },
        async (args) => {
            if (renderStatus.state === 'rendering') {
                return {
                    content: [{ type: 'text', text: 'Error: Already rendering. Wait for current render to complete.' }],
                    isError: true
                };
            }

            const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath } = args;
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

            process.stderr.write(`Starting render: ${fileName}\n`);

            renderLoop({
                project, width, height, fps, duration, bgColor,
                customOutputDir, customProjectPath, totalFrames,
                projectName, fileName, outputPath
            }).catch(err => {
                process.stderr.write(err.stack + '\n');
                renderStatus.state = 'error';
                renderStatus.error = err.message;
            });

            return {
                content: [{ type: 'text', text: JSON.stringify({
                    message: 'Render started',
                    fileName,
                    project: projectName,
                    totalFrames,
                    statusUrl: 'Use get_render_status to check progress'
                })}]
            };
        }
    );

    mcp.tool('get_render_status',
        'Get the current render status',
        {},
        async () => {
            return {
                content: [{ type: 'text', text: JSON.stringify(renderStatus) }]
            };
        }
    );

    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    process.stderr.write('MCP server connected\n');
}

async function renderLoop(params) {
    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, totalFrames, fileName, outputPath } = params;

    try {
        let executablePath = null;
        try {
            executablePath = puppeteer.executablePath();
        } catch (e) {
            process.stderr.write("Puppeteer no encontró un navegador por defecto, intentando fallback...\n");
        }

        if (!executablePath || !fs.existsSync(executablePath)) {
            executablePath = chromeExecutablePath;
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

        await page.evaluateOnNewDocument(() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        });

        const projectUrl = customProjectPath
            ? `http://localhost:${PORT}/external-project/index.html`
            : `http://localhost:${PORT}/proyectos/${project}/index.html`;

        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        const ffmpeg = spawn(resolveFfmpegPath(), [
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(),
            '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outputPath
        ]);

        ffmpeg.stderr.on('data', (d) => process.stderr.write(d));

        let ffmpegError = null;
        ffmpeg.on('error', (err) => {
            ffmpegError = err.message;
            process.stderr.write('Error en ffmpeg: ' + err.message + '\n');
        });

        await new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (ffmpegError) {
                    renderStatus.state = 'error';
                    renderStatus.error = ffmpegError;
                    browser.close().catch(() => {});
                    reject(new Error(ffmpegError));
                    return;
                }
                if (code !== 0) {
                    renderStatus.state = 'error';
                    renderStatus.error = `ffmpeg terminó con código ${code}`;
                    browser.close().catch(() => {});
                    reject(new Error(`ffmpeg terminó con código ${code}`));
                    return;
                }
                browser.close().catch(() => {});
                renderStatus.state = 'done';
                renderStatus.fileUrl = `/renders/${fileName}`;
                resolve();
            });

            (async () => {
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
            })().catch(err => {
                ffmpeg.stdin.end();
                reject(err);
            });
        });

    } catch (err) {
        process.stderr.write(err.stack + '\n');
        renderStatus.state = 'error';
        renderStatus.error = err.message;
    }
}

app.listen(PORT, () => {
    process.stderr.write(`Express server listening on port ${PORT}\n`);
    ensureChrome().then(() => {
        process.stderr.write('Chrome is ready\n');
    }).catch(err => {
        process.stderr.write('Error installing Chromium: ' + err.message + '\n');
    });
    main().catch(err => {
        process.stderr.write('MCP server error: ' + err.stack + '\n');
        process.exit(1);
    });
});
