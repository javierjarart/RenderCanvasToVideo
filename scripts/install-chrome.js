const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.argv[2];
const root = path.join(__dirname, '..');

const chromeDir = path.join(root, '.cache', 'puppeteer', 'chrome');
if (fs.existsSync(chromeDir)) {
  fs.rmSync(chromeDir, { recursive: true, force: true });
  console.log('Cleared existing Chrome installation.');
}

const cmd = platform
  ? `puppeteer browsers install chrome --platform ${platform}`
  : 'puppeteer browsers install chrome';

console.log(`Installing Chrome${platform ? ' for ' + platform : ''}...`);
execSync(cmd, { stdio: 'inherit', cwd: root });
