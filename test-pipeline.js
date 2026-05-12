const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = 3456;
const APP_ROOT = __dirname;

const TEST_PROJECT = path.join(APP_ROOT, 'proyectos', 'test-pipeline');
const TEST_OUTPUT = path.join(APP_ROOT, 'test-output');

let serverProcess;

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: PORT, path: url, method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer(attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request('GET', '/api/projects');
      if (res.status === 200) return;
    } catch {}
    await wait(500);
  }
  throw new Error('Server did not start in time');
}

async function main() {
  let ok = false;
  try {
    // 1. Create a minimal canvas test project
    if (fs.existsSync(TEST_PROJECT)) fs.rmSync(TEST_PROJECT, { recursive: true });
    if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true });
    fs.mkdirSync(TEST_PROJECT, { recursive: true });
    fs.mkdirSync(TEST_OUTPUT, { recursive: true });

    const indexHtml = `<!DOCTYPE html>
<html>
<body>
<canvas id="c" width="320" height="240"></canvas>
<script>
const c = document.getElementById('c'), ctx = c.getContext('2d');
let x = 0;
function draw(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,320,240);
  ctx.fillStyle = '#0f0'; ctx.fillRect(x,100,40,40);
  x = (x + 3) % 320;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script>
</body>
</html>`;
    fs.writeFileSync(path.join(TEST_PROJECT, 'index.html'), indexHtml);

    // 2. Start the Express server as a child process
    serverProcess = fork(path.join(APP_ROOT, 'server.js'), [], {
      env: {
        ...process.env,
        APP_ROOT,
        PORT: String(PORT),
        CHROME_CACHE_DIR: path.join(APP_ROOT, '.cache', 'puppeteer'),
      },
      silent: true,
    });

    serverProcess.stdout.on('data', d => process.stdout.write('[server] ' + d));
    serverProcess.stderr.on('data', d => process.stderr.write('[server] ' + d));

    // 3. Wait for the server to be ready
    console.log('Waiting for server to start...');
    await waitForServer();
    console.log('Server is ready.');

    // 4. Send a render request (small, short, fast)
    console.log('Sending render request...');
    const renderRes = await request('POST', '/api/render', {
      project: 'test-pipeline',
      width: 320,
      height: 240,
      fps: 10,
      duration: 2,
      bgColor: '#000000',
      customOutputDir: TEST_OUTPUT,
    });
    console.log('Render response:', renderRes.status, JSON.stringify(renderRes.body));
    if (renderRes.status !== 200) {
      throw new Error('Render request failed: ' + JSON.stringify(renderRes.body));
    }

    // 5. Poll status until done
    let lastStatus = null;
    while (true) {
      await wait(1000);
      const statusRes = await request('GET', '/api/status');
      lastStatus = statusRes.body;
      console.log('Status:', lastStatus.state, lastStatus.progress + '/' + lastStatus.total);

      if (lastStatus.state === 'done') break;
      if (lastStatus.state === 'error') throw new Error('Render failed: ' + lastStatus.error);
    }

    // 6. Verify the output file
    const fileUrl = lastStatus.fileUrl;
    if (!fileUrl) throw new Error('No fileUrl in status');

    const fileName = path.basename(fileUrl);
    const outputFile = path.join(TEST_OUTPUT, fileName);

    if (!fs.existsSync(outputFile)) throw new Error('Output file not found: ' + outputFile);
    const stats = fs.statSync(outputFile);
    if (stats.size < 1000) throw new Error('Output file too small: ' + stats.size + ' bytes');

    // Quick MP4 header check
    const header = fs.readFileSync(outputFile).subarray(0, 12).toString('latin1');
    // MP4 files start with ftyp box
    if (header.indexOf('ftyp') === -1) {
      throw new Error('Output file does not look like a valid MP4 (no ftyp box)');
    }

    console.log('\n✓ Pipeline test PASSED');
    console.log('  Output: ' + outputFile);
    console.log('  Size  : ' + (stats.size / 1024).toFixed(1) + ' KB');
    ok = true;

  } catch (err) {
    console.error('\n✗ Pipeline test FAILED:', err.message);
    process.exit(1);
  } finally {
    // 7. Cleanup
    if (serverProcess) {
      serverProcess.kill();
      await wait(500);
    }
    fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
    fs.rmSync(TEST_OUTPUT, { recursive: true, force: true });
    if (ok) {
      console.log('Cleanup done.');
    }
  }
}

main();
