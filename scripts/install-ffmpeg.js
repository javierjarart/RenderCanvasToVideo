const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getFfmpegUrl(platform) {
  const release = 'ffmpeg-release-essentials.zip';
  switch (platform) {
    case 'win32':
    case 'win64':
      return {
        url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${platform}-x64`,
        name: 'ffmpeg.exe',
      };
    case 'linux':
    case 'linux64':
      return {
        url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/linux-x64`,
        name: 'ffmpeg',
      };
    case 'mac-arm64':
      return {
        url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/darwin-arm64`,
        name: 'ffmpeg',
      };
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

const platform = process.argv[2] || process.platform;
const root = path.join(__dirname, '..');
const binDir = path.join(root, 'bin');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const { url, name } = getFfmpegUrl(platform);
const outPath = path.join(binDir, name);

console.log(`Downloading ffmpeg for ${platform}...`);
execSync(`curl -sL "${url}" -o "${outPath}"`, { stdio: 'inherit', cwd: root });
fs.chmodSync(outPath, 0o755);
console.log(`Saved to ${outPath}`);
