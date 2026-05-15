const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const http = require('https');
const { spawnSync, execSync } = require('child_process');

function getPlatformInfo(platform) {
  const isWin = platform.startsWith('win');
  const binName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const arch = platform.includes('arm64') ? 'arm64' : 'x64';
  return { binName, arch, isWin };
}

function findFfmpegStaticPath() {
  const root = path.join(__dirname, '..');
  const p = path.join(root, 'node_modules', 'ffmpeg-static');
  if (!fs.existsSync(p)) return null;
  try {
    const fp = require(path.join(p, 'index.js'));
    return typeof fp === 'string' ? fp : null;
  } catch { return null; }
}

function hasHapEncoder(ffpath) {
  if (!ffpath || !fs.existsSync(ffpath)) return false;
  try {
    const r = spawnSync(ffpath, ['-encoders'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    return r.status === 0 && r.stdout.toString().includes(' hap ');
  } catch { return false; }
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    http.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve).catch(reject);
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

async function downloadGz(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    http.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

function extractTarXz(src, destDir, innerPath) {
  const tmp = path.join(path.dirname(src), 'ffmpeg_extracted');
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execSync(`tar -xJf "${src}" -C "${tmp}"`, { stdio: 'pipe' });
    const extracted = path.join(tmp, innerPath);
    if (!fs.existsSync(extracted)) throw new Error(`Expected binary not found: ${extracted}`);
    return extracted;
  } catch (e) {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
    throw e;
  }
}

function extractZip(src, destDir, innerPath) {
  const tmp = path.join(path.dirname(src), 'ffmpeg_extracted');
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${src}' -DestinationPath '${tmp}'"`, { stdio: 'pipe' });
    const extracted = path.join(tmp, innerPath);
    if (!fs.existsSync(extracted)) {
      execSync(`unzip -o "${src}" -d "${tmp}"`, { stdio: 'pipe' });
    }
    const extracted2 = path.join(tmp, innerPath);
    if (!fs.existsSync(extracted2)) throw new Error(`Expected binary not found: ${extracted2}`);
    return extracted2;
  } catch (e) {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true });
    throw e;
  }
}

(async () => {
  const platformArg = process.argv[2] || process.platform;
  let platform = platformArg;
  if (platform === 'win32') platform = 'win64';
  if (platform === 'darwin' || platform === 'mac') platform = 'macos';
  if (platform === 'linux') platform = 'linux64';

  const root = path.join(__dirname, '..');
  const binDir = path.join(root, 'bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const { binName, arch } = getPlatformInfo(platform);
  const outPath = path.join(binDir, binName);

  // Check if existing bin/ffmpeg already has hap
  if (hasHapEncoder(outPath)) {
    console.log(`✓ ${outPath} already has HAP encoder.`);
    process.exit(0);
  }

  // Try ffmpeg-static (npm package) first
  const staticPath = findFfmpegStaticPath();
  if (hasHapEncoder(staticPath)) {
    console.log(`✓ ${staticPath} has HAP encoder.`);
    if (outPath !== staticPath) {
      fs.copyFileSync(staticPath, outPath);
      fs.chmodSync(outPath, 0o755);
      console.log(`Copied to ${outPath}`);
    }
    process.exit(0);
  }

  if (staticPath) {
    console.log(`ffmpeg-static at ${staticPath} does NOT have HAP encoder.`);
  }

  // Download full FFmpeg build with HAP support
  const sources = {
    linux64: {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
      innerPath: 'bin/ffmpeg',
      extract: 'tarxz',
    },
    win64: {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      innerPath: 'bin/ffmpeg.exe',
      extract: 'zip',
    },
    macos: {
      // EXPERIMENTAL: soporte para macOS mediante builds de evermeet.cx.
      // La disponibilidad del encoder HAP puede variar. Si se necesita HAP,
      // instalar ffmpeg via homebrew: brew install ffmpeg
      url: 'https://evermeet.cx/ffmpeg/ffmpeg-8.1.1.zip',
      innerPath: 'ffmpeg',
      extract: 'zip',
    },
  };

  const src = sources[platform];
  if (!src) {
    console.error(`No download source for platform: ${platform}`);
    console.error('Please install FFmpeg with HAP support manually and place it in bin/');
    process.exit(1);
  }

  const ext = src.url.endsWith('.xz') ? '.tar.xz' : src.url.endsWith('.zip') ? '.zip' : '.bin';
  const archivePath = path.join(binDir, `ffmpeg-dl${ext}`);

  try {
    // Download
    if (src.url.endsWith('.tar.xz') || src.url.endsWith('.xz')) {
      await download(src.url, archivePath);
    } else if (src.url.endsWith('.gz')) {
      await downloadGz(src.url, archivePath);
    } else {
      await download(src.url, archivePath);
    }

    // Extract
    let extractedPath;
    if (src.extract === 'tarxz') {
      extractedPath = extractTarXz(archivePath, binDir, src.innerPath);
      fs.copyFileSync(extractedPath, outPath);
    } else if (src.extract === 'zip') {
      // For zip, try unzip command first (cross-platform)
      const extDir = path.join(binDir, 'ffmpeg_extracted');
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true });
      fs.mkdirSync(extDir, { recursive: true });
      try {
        execSync(`unzip -o "${archivePath}" -d "${extDir}"`, { stdio: 'pipe' });
      } catch {
        execSync(`tar -xf "${archivePath}" -C "${extDir}"`, { stdio: 'pipe' });
      }
      extractedPath = path.join(extDir, src.innerPath);
      if (!fs.existsSync(extractedPath)) {
        // Search for ffmpeg binary
        const files = execSync(`find "${extDir}" -name "${binName}" -type f`, { encoding: 'utf8' }).trim().split('\n');
        if (files.length > 0) extractedPath = files[0];
        else throw new Error(`Cannot find ${binName} in extracted archive`);
      }
      fs.copyFileSync(extractedPath, outPath);
      if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true });
    }

    fs.chmodSync(outPath, 0o755);
    fs.unlinkSync(archivePath);

    // Verify HAP
    if (hasHapEncoder(outPath)) {
      const stats = fs.statSync(outPath);
      console.log(`✓ Installed FFmpeg with HAP encoder: ${outPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      console.warn(`⚠ FFmpeg installed at ${outPath} but HAP encoder check failed.`);
      console.warn('It may still work. Run: ffmpeg -encoders | grep hap');
    }
  } catch (err) {
    console.error(`Failed to install FFmpeg with HAP: ${err.message}`);
    // Cleanup partial downloads
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    const extDir = path.join(binDir, 'ffmpeg_extracted');
    if (fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true });
    console.error('Please manually download an FFmpeg binary with HAP support');
    console.error('  Windows: https://github.com/BtbN/FFmpeg-Builds/releases/latest');
    console.error('  Linux:   https://johnvansickle.com/ffmpeg/ (build with --enable-encoder=hap)');
    console.error('  macOS:   brew install ffmpeg (includes HAP)');
    process.exit(1);
  }
})();
