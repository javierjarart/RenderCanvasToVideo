const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const http = require('https');

function getPlatformInfo(platform) {
  const map = {
    'win32': 'win32-x64',
    'win64': 'win32-x64',
    'linux': 'linux-x64',
    'linux64': 'linux-x64',
    'darwin': 'darwin-arm64',
    'mac': 'darwin-arm64',
    'mac-arm64': 'darwin-arm64',
  };
  const mapped = map[platform];
  if (!mapped) throw new Error(`Unknown platform: ${platform}`);
  return {
    fileSuffix: mapped,
    binaryName: platform.startsWith('win') ? 'ffmpeg.exe' : 'ffmpeg',
  };
}

const platform = process.argv[2] || process.platform;
const root = path.join(__dirname, '..');
const binDir = path.join(root, 'bin');

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

const info = getPlatformInfo(platform);
const releaseTag = 'b6.1.1';
const gzUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}/ffmpeg-${info.fileSuffix}.gz`;
const rawUrl = `https://github.com/eugeneware/ffmpeg-static/releases/download/${releaseTag}/ffmpeg-${info.fileSuffix}`;
const outPath = path.join(binDir, info.binaryName);

async function downloadGz(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    http.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadGz(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const gunzip = zlib.createGunzip();
      const file = fs.createWriteStream(dest);
      res.pipe(gunzip).pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadRaw(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    http.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadRaw(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  try {
    await downloadGz(gzUrl, outPath);
  } catch (e) {
    console.log(`GZ download failed (${e.message}), trying raw...`);
    try {
      await downloadRaw(rawUrl, outPath);
    } catch (e2) {
      throw new Error(`Failed to download ffmpeg: ${e2.message}`);
    }
  }
  fs.chmodSync(outPath, 0o755);
  const stats = fs.statSync(outPath);
  console.log(`Saved ${outPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
