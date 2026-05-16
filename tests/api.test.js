const assert = require('node:assert');
const { describe, it, before, after, mock } = require('node:test');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_ROOT = process.env.APP_ROOT || __dirname;
const TEST_PORT = 0;

function createTestApp() {
  mock.reset();

  const express = require('express');
  const app = express();
  app.use(express.json());

  const logBuffer = [];
  const MAX_LOG_LINES = 2000;
  let renderStatus = { state: 'idle', progress: 0, total: 0, fileUrl: null, error: null };

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

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

  app.get('/api/logs', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const newLogs = logBuffer.slice(since);
    res.json({ logs: newLogs, total: logBuffer.length });
  });

  app.post('/api/render', (req, res) => {
    if (renderStatus.state === 'rendering') {
      return res.status(400).json({ error: 'Ya hay un render en proceso.' });
    }

    const { project, customProjectPath, width, height, fps, duration } = req.body;

    if (!project && !customProjectPath) {
      return res.status(400).json({ error: 'Debe especificar un proyecto.' });
    }

    if (!width || !height || !fps || !duration) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (width, height, fps, duration).' });
    }

    if (customProjectPath) {
      const resolved = path.resolve(customProjectPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return res.status(400).json({ error: `Ruta de proyecto inválida: ${customProjectPath}` });
      }
    }

    const totalFrames = parseInt(fps) * parseInt(duration);
    renderStatus = { state: 'rendering', progress: 0, total: totalFrames, fileUrl: null, error: null };
    res.json({ message: 'Render iniciado' });
  });

  return { app, logBuffer, getRenderStatus: () => renderStatus, setRenderStatus: (s) => { renderStatus = s; } };
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers: {},
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('API Routes', () => {
  let server;
  let testApp;

  before(() => {
    testApp = createTestApp();
    const { app } = testApp;
    return new Promise((resolve) => {
      server = app.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
    mock.reset();
  });

  describe('GET /api/health', () => {
    it('returns ok: true', async () => {
      const res = await request(server, 'GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.ok, true);
    });
  });

  describe('GET /api/projects', () => {
    it('returns an array', async () => {
      const res = await request(server, 'GET', '/api/projects');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('GET /api/status', () => {
    it('returns current render status', async () => {
      const res = await request(server, 'GET', '/api/status');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.hasOwnProperty('state'));
      assert.ok(res.body.hasOwnProperty('progress'));
      assert.ok(res.body.hasOwnProperty('total'));
    });

    it('returns idle state initially', async () => {
      const res = await request(server, 'GET', '/api/status');
      assert.strictEqual(res.body.state, 'idle');
    });
  });

  describe('GET /api/logs', () => {
    it('returns logs array and total count', async () => {
      const res = await request(server, 'GET', '/api/logs');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.logs));
      assert.strictEqual(typeof res.body.total, 'number');
    });

    it('supports since parameter', async () => {
      const res = await request(server, 'GET', '/api/logs?since=0');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.logs));
    });
  });

  describe('POST /api/render', () => {
    it('rejects request when already rendering', async () => {
      testApp.setRenderStatus({ state: 'rendering', progress: 5, total: 100, fileUrl: null, error: null });
      const res = await request(server, 'POST', '/api/render', {
        project: 'test',
        width: 320,
        height: 240,
        fps: 10,
        duration: 2,
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('render en proceso'));
      testApp.setRenderStatus({ state: 'idle', progress: 0, total: 0, fileUrl: null, error: null });
    });

    it('rejects request without project or customProjectPath', async () => {
      const res = await request(server, 'POST', '/api/render', {
        width: 320,
        height: 240,
        fps: 10,
        duration: 2,
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('proyecto'));
    });

    it('rejects request with missing required parameters', async () => {
      const res = await request(server, 'POST', '/api/render', {
        project: 'test',
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('Faltan'));
    });

    it('rejects request with invalid customProjectPath', async () => {
      const res = await request(server, 'POST', '/api/render', {
        project: 'test',
        customProjectPath: '/nonexistent/path',
        width: 320,
        height: 240,
        fps: 10,
        duration: 2,
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('inválida'));
    });

    it('accepts valid render request', async () => {
      const res = await request(server, 'POST', '/api/render', {
        project: 'test-anim',
        width: 320,
        height: 240,
        fps: 10,
        duration: 2,
        bgColor: '#000000',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Render iniciado');
    });
  });
});
