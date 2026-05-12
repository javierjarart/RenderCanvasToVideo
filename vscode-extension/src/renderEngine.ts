import * as puppeteer from 'puppeteer';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let ffmpegPath: string;

try {
    const resolved = require('ffmpeg-static');
    ffmpegPath = resolved;
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        throw new Error('ffmpeg-static not found');
    }
} catch {
    const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    ffmpegPath = binaryName;
}

export interface RenderConfig {
    projectPath: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    bgColor: string;
    outputPath: string;
}

export type ProgressCallback = (current: number, total: number) => void;

export async function renderFrames(
    config: RenderConfig,
    onProgress?: ProgressCallback,
    cancelToken?: { cancelled: boolean }
): Promise<void> {
    const totalFrames = config.fps * config.duration;
    let browser: puppeteer.Browser | null = null;
    let ffmpeg: ChildProcess | null = null;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: config.width, height: config.height });

        await page.evaluateOnNewDocument(`() => {
            window.__frameTime = 0;
            Date.now = () => window.__frameTime;
            performance.now = () => window.__frameTime;
            window.requestAnimationFrame = (callback) => {
                window.__rAFCallback = callback;
                return 1;
            };
        }`);

        const projectUrl =
            `file://${config.projectPath.replace(/\\/g, '/')}/index.html`;

        await page.goto(projectUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('canvas', { timeout: 10000 });

        const outDir = path.dirname(config.outputPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        ffmpeg = spawn(ffmpegPath, [
            '-y',
            '-f',
            'image2pipe',
            '-vcodec',
            'png',
            '-r',
            config.fps.toString(),
            '-i',
            '-',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-crf',
            '18',
            config.outputPath,
        ]);

        const ffmpegStderr: Uint8Array[] = [];
        ffmpeg.stderr?.on('data', (d: Uint8Array) => ffmpegStderr.push(d));

        const ffmpegExit = new Promise<void>((resolve, reject) => {
            ffmpeg!.on('error', (err) => reject(err));
            ffmpeg!.on('close', (code) => {
                if (code !== 0) {
                    const msg = Buffer.concat(ffmpegStderr as any).toString('utf8').slice(-500);
                    reject(new Error(`ffmpeg exited with code ${code}: ${msg}`));
                } else {
                    resolve();
                }
            });
        });

        for (let i = 1; i <= totalFrames; i++) {
            if (cancelToken?.cancelled) break;

            const timeMs = i * (1000 / config.fps);

            await page.evaluate(`(time) => {
                window.__frameTime = time;
                if (window.__rAFCallback) {
                    const cb = window.__rAFCallback;
                    window.__rAFCallback = null;
                    cb(time);
                }
            }`, timeMs);

            const base64Data: string = (await page.evaluate(`(bg) => {
                const target = document.querySelector('canvas');
                if (!window.__exportCanvas) {
                    window.__exportCanvas = document.createElement('canvas');
                    window.__exportCtx = window.__exportCanvas.getContext('2d');
                }
                const tc = window.__exportCanvas;
                const ctx = window.__exportCtx;
                tc.width = target.width;
                tc.height = target.height;
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, tc.width, tc.height);
                ctx.drawImage(target, 0, 0);
                return tc.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '');
            }`, config.bgColor || '#000000')) as unknown as string;

            ffmpeg.stdin!.write(Buffer.from(base64Data, 'base64'));
            onProgress?.(i, totalFrames);
        }

        ffmpeg.stdin!.end();
        await ffmpegExit;
    } finally {
        if (ffmpeg && !ffmpeg.killed) {
            ffmpeg.kill('SIGKILL');
        }
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}
