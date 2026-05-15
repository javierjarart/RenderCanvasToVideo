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

const ALLOWED_CODEC_PARAMS = new Set(['format', 'quality']);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
    next();
});

const APP_ROOT = process.env.APP_ROOT || __dirname;
const CHROME_CACHE_DIR = process.env.CHROME_CACHE_DIR || path.join(APP_ROOT, '.cache', 'puppeteer');

let chromeExecutablePath = null;

async function ensureChrome() {
    const installed = await getInstalledBrowsers({ cacheDir: CHROME_CACHE_DIR });
    const currentPlatform = detectBrowserPlatform();
    const chrome = installed.find(b => b.browser === Browser.CHROME && b.platform === currentPlatform);
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
let activeRender = { browser: null, ffmpeg: null };

app.use(express.static(path.join(APP_ROOT, 'public')));
app.use('/proyectos', express.static(path.join(APP_ROOT, 'proyectos')));
app.use('/renders', express.static(path.join(APP_ROOT, 'renders')));

app.use('/external-project', (req, res, next) => {
    if (currentCustomProjectPath && fs.existsSync(currentCustomProjectPath)) {
        return express.static(currentCustomProjectPath, {
            dotfiles: 'deny',
            index: ['index.html'],
        })(req, res, next);
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

    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, codec, container, pixFmt, codecParams, crf } = req.body;
    const totalFrames = parseInt(fps) * parseInt(duration);

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

        const chromeArgs = [
            '--disable-dev-shm-usage'
        ];
        if (!executablePath || process.env.NODE_ENV === 'development') {
            chromeArgs.push('--no-sandbox', '--disable-setuid-sandbox');
        }
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath || undefined,
            args: chromeArgs,
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

        let pageLoaded = false;
        try {
            const gotoPromise = page.goto(projectUrl, { waitUntil: 'load', timeout: 20000 });
            const canvasPromise = page.waitForSelector('canvas', { timeout: 30000 });
            await Promise.race([gotoPromise, canvasPromise]);
            pageLoaded = true;
        } catch (e) {
            process.stderr.write(`page.goto falló, intentando setContent: ${e.message}\n`);
        }

        if (!pageLoaded) {
            const htmlPath = customProjectPath
                ? path.join(customProjectPath, 'index.html')
                : path.join(APP_ROOT, 'proyectos', project, 'index.html');
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`No se encontró index.html en: ${htmlPath}`);
            }
            const html = fs.readFileSync(htmlPath, 'utf-8');
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        const codecArgs = ['-c:v', vCodec, '-pix_fmt', vPixFmt];
        if (vCodec === 'libx264') {
            codecArgs.push('-crf', String(crf || 18));
        }
        for (const [key, val] of Object.entries(vCodecParams)) {
            if (ALLOWED_CODEC_PARAMS.has(key)) {
                codecArgs.push(`-${key}`, String(val));
            }
        }

        const ffmpeg = spawn(resolveFfmpegPath(), [
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(),
            '-i', '-', ...codecArgs, outputPath
        ]);
        activeRender.ffmpeg = ffmpeg;

        ffmpeg.stderr.on('data', (d) => process.stderr.write(d));

        let ffmpegError = null;
        ffmpeg.on('error', (err) => {
            ffmpegError = err.message;
            process.stderr.write('Error en ffmpeg: ' + err.message + '\n');
        });

        ffmpeg.on('close', (code) => {
            activeRender.ffmpeg = null;
            if (ffmpegError) {
                renderStatus.state = 'error';
                renderStatus.error = ffmpegError;
                browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
                activeRender.browser = null;
                return;
            }
            if (code !== 0) {
                renderStatus.state = 'error';
                renderStatus.error = `ffmpeg terminó con código ${code}`;
                browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
                activeRender.browser = null;
                return;
            }
            browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
            activeRender.browser = null;
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
        if (activeRender.browser) { activeRender.browser.close().catch(() => {}); activeRender.browser = null; }
        if (activeRender.ffmpeg) { activeRender.ffmpeg.kill(); activeRender.ffmpeg = null; }
    }
});

const PORT = parseInt(process.env.MCP_PORT || '3000');

// ─── Log buffer ────────────────────────────────────────────────────────────
const logBuffer = [];
function mcpLog(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a => typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)).join(' ');
    logBuffer.push({ timestamp, level, message });
    process.stderr.write(`[${timestamp}] [${level}] ${message}\n`);
}

async function main() {
    const { z } = await import('zod');
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

    const mcp = new McpServer({
        name: 'RenderCanvasToVideo',
        version: '0.1.1'
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
            project: z.string().optional().describe('Project folder name inside proyectos/ (omit if using customProjectPath)'),
            width: z.number().describe('Video width in pixels'),
            height: z.number().describe('Video height in pixels'),
            fps: z.number().describe('Frames per second'),
            duration: z.number().describe('Duration in seconds'),
            bgColor: z.string().optional().describe('Background color for transparent pixels (hex, e.g. #000000)'),
            customOutputDir: z.string().optional().describe('Custom output directory for the rendered video'),
            customProjectPath: z.string().optional().describe('Path to an external project folder containing index.html with a canvas'),
            codec: z.string().optional().describe('Video codec (libx264, hap, cfhd)'),
            container: z.string().optional().describe('Container extension (.mp4, .mov)'),
            pixFmt: z.string().optional().describe('Pixel format (yuv420p, yuv422p)'),
            codecParams: z.record(z.string()).optional().describe('Codec-specific parameters (e.g. {"format":"hap_q"})'),
            crf: z.number().optional().describe('CRF quality for libx264 (0-51, lower=better)'),
        },
        async (args) => {
            if (renderStatus.state === 'rendering') {
                return {
                    content: [{ type: 'text', text: 'Error: Already rendering. Wait for current render to complete.' }],
                    isError: true
                };
            }

            const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, codec, container, pixFmt, codecParams } = args;
            const totalFrames = parseInt(fps) * parseInt(duration);

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
                    return {
                        content: [{ type: 'text', text: `Invalid project path: ${customProjectPath}` }],
                        isError: true
                    };
                }
                currentCustomProjectPath = resolved;
                projectName = path.basename(resolved);
            }

            const fileName = `Render_${projectName}_${Date.now()}${vContainer}`;

            const rendersDir = customOutputDir || path.join(APP_ROOT, 'renders');
            if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
            const outputPath = path.join(rendersDir, fileName);

            renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };

            process.stderr.write(`Starting render: ${fileName}\n`);

            renderLoop({
                project, width, height, fps, duration, bgColor, crf: args.crf,
                customOutputDir, customProjectPath, totalFrames,
                projectName, fileName, outputPath,
                codec: vCodec, container: vContainer, pixFmt: vPixFmt, codecParams: vCodecParams
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

    mcp.tool('get_project_files',
        'List all files in a project directory with sizes',
        {
            project: z.string().describe('Project folder name inside proyectos/')
        },
        async (args) => {
            const projectPath = path.join(APP_ROOT, 'proyectos', args.project);
            if (!fs.existsSync(projectPath)) {
                return { content: [{ type: 'text', text: `Project not found: ${args.project}` }], isError: true };
            }
            const files = [];
            walkDir(projectPath, files, '');
            return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
        }
    );

    mcp.tool('read_project_file',
        'Read a file content from a project. Use get_project_files first to list available files.',
        {
            project: z.string().describe('Project folder name inside proyectos/'),
            file: z.string().describe('Relative file path inside the project (e.g. script.js or style.css)')
        },
        async (args) => {
            try {
                const filePath = resolveSafe(APP_ROOT, 'proyectos', args.project, args.file);
                if (!fs.existsSync(filePath)) {
                    return { content: [{ type: 'text', text: `File not found: ${args.project}/${args.file}` }], isError: true };
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                return { content: [{ type: 'text', text: content }] };
            } catch (e) {
                return { content: [{ type: 'text', text: e.message }], isError: true };
            }
        }
    );

    mcp.tool('get_output_files',
        'List all rendered output video files with sizes and creation dates',
        {},
        async () => {
            const rendersDir = path.join(APP_ROOT, 'renders');
            if (!fs.existsSync(rendersDir)) {
                return { content: [{ type: 'text', text: '[]' }] };
            }
            const files = fs.readdirSync(rendersDir, { withFileTypes: true })
                .filter(d => d.isFile())
                .map(d => {
                    const stat = fs.statSync(path.join(rendersDir, d.name));
                    return {
                        name: d.name,
                        sizeBytes: stat.size,
                        sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                        created: stat.birthtime,
                        modified: stat.mtime
                    };
                })
                .sort((a, b) => new Date(b.modified) - new Date(a.modified));
            return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
        }
    );

    mcp.tool('cancel_render',
        'Cancel the currently running render and reset the status',
        {},
        async () => {
            if (renderStatus.state !== 'rendering') {
                return { content: [{ type: 'text', text: 'No render is currently running.' }] };
            }
            if (activeRender.ffmpeg) { activeRender.ffmpeg.kill('SIGKILL'); activeRender.ffmpeg = null; }
            if (activeRender.browser) { activeRender.browser.close().catch(() => {}); activeRender.browser = null; }
            renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: 'Cancelled by user' };
            return { content: [{ type: 'text', text: JSON.stringify({ message: 'Render cancelled' }) }] };
        }
    );

    mcp.tool('preview_frame',
        'Capture a single frame from a canvas project as base64 PNG. Useful for previewing before rendering.',
        {
            project: z.string().optional().describe('Project folder name inside proyectos/'),
            width: z.number().optional().describe('Viewport width (default: 640)'),
            height: z.number().optional().describe('Viewport height (default: 360)'),
            time: z.number().optional().describe('Time in milliseconds to capture (default: 0)'),
            bgColor: z.string().optional().describe('Background color for transparent pixels (hex)'),
            customProjectPath: z.string().optional().describe('Path to external project folder')
        },
        async (args) => {
            if (!chromeExecutablePath) {
                return { content: [{ type: 'text', text: 'Chrome is not ready yet. Try again shortly.' }], isError: true };
            }
            try {
                const chromeArgs = ['--disable-dev-shm-usage'];
                if (process.env.NODE_ENV === 'development') {
                    chromeArgs.push('--no-sandbox', '--disable-setuid-sandbox');
                }
                const browser = await puppeteer.launch({
                    headless: true,
                    executablePath: chromeExecutablePath,
                    args: chromeArgs,
                });
                const page = await browser.newPage();
                await page.setViewport({ width: parseInt(args.width) || 640, height: parseInt(args.height) || 360 });

                await page.evaluateOnNewDocument(() => {
                    window.__frameTime = 0;
                    Date.now = () => window.__frameTime;
                    performance.now = () => window.__frameTime;
                    window.requestAnimationFrame = (cb) => { window.__rAFCallback = cb; return 1; };
                });

                const projectUrl = args.customProjectPath
                    ? `http://localhost:${PORT}/external-project/index.html`
                    : `http://localhost:${PORT}/proyectos/${args.project}/index.html`;

                let loaded = false;
                try {
                    await Promise.race([
                        page.goto(projectUrl, { waitUntil: 'load', timeout: 15000 }),
                        page.waitForSelector('canvas', { timeout: 15000 })
                    ]);
                    loaded = true;
                } catch (e) {
                    const htmlPath = args.customProjectPath
                        ? (() => {
                            const resolved = path.isAbsolute(args.customProjectPath)
                                ? path.resolve(args.customProjectPath, 'index.html')
                                : resolveSafe(APP_ROOT, args.customProjectPath, 'index.html');
                            return resolved;
                        })()
                        : path.join(APP_ROOT, 'proyectos', args.project, 'index.html');
                    if (fs.existsSync(htmlPath)) {
                        await page.setContent(fs.readFileSync(htmlPath, 'utf-8'), { waitUntil: 'domcontentloaded', timeout: 10000 });
                        loaded = true;
                    }
                }

                if (!loaded) {
                    await browser.close();
                    return { content: [{ type: 'text', text: 'Could not load the project page.' }], isError: true };
                }

                const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
                if (!hasCanvas) {
                    await browser.close();
                    return { content: [{ type: 'text', text: 'No canvas element found on the page.' }], isError: true };
                }

                const timeMs = parseInt(args.time) || 0;
                await page.evaluate((t) => {
                    window.__frameTime = t;
                    if (window.__rAFCallback) { const cb = window.__rAFCallback; window.__rAFCallback = null; cb(t); }
                }, timeMs);

                await new Promise(r => setTimeout(r, 200));

                const base64 = await page.evaluate((bg) => {
                    const c = document.querySelector('canvas');
                    const tc = document.createElement('canvas');
                    tc.width = c.width; tc.height = c.height;
                    const ctx = tc.getContext('2d');
                    ctx.fillStyle = bg || '#000000';
                    ctx.fillRect(0, 0, tc.width, tc.height);
                    ctx.drawImage(c, 0, 0);
                    return tc.toDataURL('image/png');
                }, args.bgColor || '#000000');

                await browser.close();
                return { content: [{ type: 'image', data: base64.replace(/^data:image\/png;base64,/, ''), mimeType: 'image/png' }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );

    mcp.tool('get_system_info',
        'Check system configuration: Chrome and FFmpeg availability, versions, cache paths',
        {},
        async () => {
            const info = {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                chrome: { ready: !!chromeExecutablePath, path: chromeExecutablePath },
                ffmpeg: { path: resolveFfmpegPath(), exists: fs.existsSync(resolveFfmpegPath()) },
                appRoot: APP_ROOT,
                chromeCache: CHROME_CACHE_DIR,
                chromeCacheExists: fs.existsSync(CHROME_CACHE_DIR),
                proyectosPath: path.join(APP_ROOT, 'proyectos'),
                rendersPath: path.join(APP_ROOT, 'renders'),
                port: PORT,
                renderState: renderStatus.state
            };
            if (chromeExecutablePath) {
                try {
                    const { getInstalledBrowsers, Browser } = require('@puppeteer/browsers');
                    const installed = await getInstalledBrowsers({ cacheDir: CHROME_CACHE_DIR });
                    info.chrome.installed = installed.map(b => ({ browser: b.browser, platform: b.platform, buildId: b.buildId }));
                } catch (e) { info.chrome.installedError = e.message; }
            }
            try {
                const stat = fs.statSync(resolveFfmpegPath());
                info.ffmpeg.sizeMB = (stat.size / 1024 / 1024).toFixed(1);
            } catch (e) {}
            return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
        }
    );

    mcp.tool('get_render_logs',
        'Get recent render logs for debugging. Cleared on server restart.',
        {
            since: z.number().optional().describe('Index to fetch logs from (0 = all logs, default: 0)')
        },
        async (args) => {
            const since = args.since || 0;
            const logs = logBuffer.slice(since);
            return { content: [{ type: 'text', text: JSON.stringify({ logs, total: logBuffer.length }, null, 2) }] };
        }
    );

    mcp.tool('create_project',
        'Create a new canvas project with its files. Use this to let the AI generate custom canvas animations from scratch.',
        {
            project: z.string().describe('Name for the new project folder'),
            files: z.array(z.object({
                path: z.string().describe('File path relative to project root (e.g. index.html, script.js, style.css)'),
                content: z.string().describe('Full file content')
            })).describe('Array of files to create in the project'),
            overwrite: z.boolean().optional().describe('Overwrite existing files if project already exists (default: false)')
        },
        async (args) => {
            const projectDir = path.join(APP_ROOT, 'proyectos', args.project);
            if (fs.existsSync(projectDir) && !args.overwrite) {
                return {
                    content: [{ type: 'text', text: `Project "${args.project}" already exists. Set overwrite=true to replace it.` }],
                    isError: true
                };
            }
            if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
            }
            const created = [];
            for (const file of args.files) {
                let filePath;
                try {
                    filePath = resolveSafe(projectDir, file.path);
                } catch (e) {
                    return { content: [{ type: 'text', text: e.message }], isError: true };
                }
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, file.content, 'utf-8');
                created.push(file.path);
            }
            mcpLog('log', `Created project "${args.project}" with ${created.length} files`);
            return {
                content: [{ type: 'text', text: JSON.stringify({
                    message: `Project "${args.project}" created successfully`,
                    project: args.project,
                    filesCreated: created,
                    path: projectDir,
                    totalFiles: created.length
                }, null, 2) }]
            };
        }
    );

    mcp.tool('get_video_file',
        'Get a rendered video file. Returns the download URL and local file path. For files under 10MB, also includes the base64 content.',
        {
            fileName: z.string().describe('Name of the video file from get_output_files (e.g. Render_test-anim_1234.mp4)'),
        },
        async (args) => {
            let filePath;
            try {
                filePath = resolveSafe(APP_ROOT, 'renders', args.fileName);
            } catch (e) {
                return { content: [{ type: 'text', text: e.message }], isError: true };
            }
            if (!fs.existsSync(filePath)) {
                return {
                    content: [{ type: 'text', text: `File not found: ${args.fileName}` }],
                    isError: true
                };
            }

            const stat = fs.statSync(filePath);
            const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB
            const result = {
                fileName: args.fileName,
                filePath: filePath,
                downloadUrl: `http://localhost:${PORT}/renders/${args.fileName}`,
                sizeBytes: stat.size,
                sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                created: stat.birthtime || stat.mtime,
            };

            if (stat.size <= MAX_BASE64_SIZE) {
                const data = fs.readFileSync(filePath);
                result.contentBase64 = data.toString('base64');
                result.mimeType = 'video/mp4';
                result.encoding = 'base64';
            } else {
                result.note = 'File too large for base64 encoding. Download via the URL or access from file path.';
            }

            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    process.stderr.write('MCP server connected\n');
}

function resolveSafe(base, ...paths) {
    const resolved = path.resolve(base, ...paths);
    if (!resolved.startsWith(path.resolve(base))) {
        throw new Error(`Path traversal detected: ${paths.join('/')}`);
    }
    return resolved;
}

function walkDir(dir, files, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push({ type: 'directory', name: relPath });
            walkDir(fullPath, files, relPath);
        } else {
            const stat = fs.statSync(fullPath);
            files.push({ type: 'file', name: relPath, sizeBytes: stat.size });
        }
    }
}

async function renderLoop(params) {
    const { project, width, height, fps, duration, bgColor, customOutputDir, customProjectPath, totalFrames, fileName, outputPath, codec, container, pixFmt, codecParams, crf } = params;

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

        const chromeArgs = [
            '--disable-dev-shm-usage'
        ];
        if (!executablePath || process.env.NODE_ENV === 'development') {
            chromeArgs.push('--no-sandbox', '--disable-setuid-sandbox');
        }
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: executablePath || undefined,
            args: chromeArgs,
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

        let pageLoaded = false;
        try {
            const gotoPromise = page.goto(projectUrl, { waitUntil: 'load', timeout: 20000 });
            const canvasPromise = page.waitForSelector('canvas', { timeout: 30000 });
            await Promise.race([gotoPromise, canvasPromise]);
            pageLoaded = true;
        } catch (e) {
            process.stderr.write(`page.goto falló, intentando setContent: ${e.message}\n`);
        }

        if (!pageLoaded) {
            const htmlPath = customProjectPath
                ? path.join(customProjectPath, 'index.html')
                : path.join(APP_ROOT, 'proyectos', project, 'index.html');
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`No se encontró index.html en: ${htmlPath}`);
            }
            const html = fs.readFileSync(htmlPath, 'utf-8');
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        const codecArgs2 = ['-c:v', codec || 'libx264', '-pix_fmt', pixFmt || 'yuv420p'];
        if ((codec || 'libx264') === 'libx264') {
            codecArgs2.push('-crf', String(crf || 18));
        }
        for (const [key, val] of Object.entries(codecParams || {})) {
            if (ALLOWED_CODEC_PARAMS.has(key)) {
                codecArgs2.push(`-${key}`, String(val));
            }
        }

        const ffmpeg = spawn(resolveFfmpegPath(), [
            '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', fps.toString(),
            '-i', '-', ...codecArgs2, outputPath
        ]);
        activeRender.ffmpeg = ffmpeg;

        ffmpeg.stderr.on('data', (d) => process.stderr.write(d));

        let ffmpegError = null;
        ffmpeg.on('error', (err) => {
            ffmpegError = err.message;
            process.stderr.write('Error en ffmpeg: ' + err.message + '\n');
        });

        await new Promise((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                activeRender.ffmpeg = null;
                if (ffmpegError) {
                    renderStatus.state = 'error';
                    renderStatus.error = ffmpegError;
                    browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
                    activeRender.browser = null;
                    reject(new Error(ffmpegError));
                    return;
                }
                if (code !== 0) {
                    renderStatus.state = 'error';
                    renderStatus.error = `ffmpeg terminó con código ${code}`;
                    browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
                    activeRender.browser = null;
                    reject(new Error(`ffmpeg terminó con código ${code}`));
                    return;
                }
                browser.close().catch(e => process.stderr.write('Error closing browser: ' + e + '\n'));
                activeRender.browser = null;
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
        if (activeRender.browser) { activeRender.browser.close().catch(() => {}); activeRender.browser = null; }
        if (activeRender.ffmpeg) { activeRender.ffmpeg.kill(); activeRender.ffmpeg = null; }
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
