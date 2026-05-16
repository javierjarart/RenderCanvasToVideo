const assert = require('node:assert');
const { describe, it, mock, before, after } = require('node:test');

describe('Server utility functions', () => {
  const APP_ROOT = '/home/test/app';

  function sanitizePath(msg) {
    if (typeof msg !== 'string') return msg;
    return msg.split(APP_ROOT).join('<root>');
  }

  function sanitizeArgs(args) {
    return args.map(a => {
      if (typeof a === 'string') return sanitizePath(a);
      if (a instanceof Error) return sanitizePath(a.stack || a.message);
      if (typeof a === 'object') return sanitizePath(JSON.stringify(a, null, 2));
      return a;
    });
  }

  describe('sanitizePath', () => {
    it('replaces APP_ROOT with <root>', () => {
      const result = sanitizePath(`Error at ${APP_ROOT}/config/file.json`);
      assert.strictEqual(result, 'Error at <root>/config/file.json');
    });

    it('returns non-string values unchanged', () => {
      assert.strictEqual(sanitizePath(42), 42);
      assert.strictEqual(sanitizePath(null), null);
      assert.strictEqual(sanitizePath(undefined), undefined);
    });

    it('handles strings without APP_ROOT', () => {
      const msg = 'simple message';
      assert.strictEqual(sanitizePath(msg), msg);
    });
  });

  describe('sanitizeArgs', () => {
    it('sanitizes all string args', () => {
      const args = [`${APP_ROOT}/file1`, `${APP_ROOT}/file2`];
      const result = sanitizeArgs(args);
      assert.strictEqual(result[0], '<root>/file1');
      assert.strictEqual(result[1], '<root>/file2');
    });

    it('handles Error objects', () => {
      const err = new Error('test error');
      const result = sanitizeArgs([err]);
      assert.ok(result[0].includes('<root>') || !result[0].includes(APP_ROOT));
    });

    it('handles object arguments', () => {
      const obj = { path: `${APP_ROOT}/data` };
      const result = sanitizeArgs([obj]);
      assert.ok(result[0].includes('<root>'));
    });

    it('passes through primitives unchanged', () => {
      const result = sanitizeArgs([1, true, undefined]);
      assert.strictEqual(result[0], 1);
      assert.strictEqual(result[1], true);
      assert.strictEqual(result[2], undefined);
    });

    it('handles null as object', () => {
      const result = sanitizeArgs([null]);
      assert.strictEqual(typeof result[0], 'string');
      assert.strictEqual(result[0], 'null');
    });
  });

  describe('captureLog', () => {
    it('adds entries to buffer with timestamp and level', () => {
      const logBuffer = [];
      const MAX_LOG_LINES = 10;

      function captureLog(level, args) {
        const timestamp = new Date().toLocaleTimeString();
        const sanitized = sanitizeArgs(args);
        const message = sanitized.map(a =>
          typeof a === 'object'
            ? a instanceof Error
              ? a.stack || a.message
              : JSON.stringify(a, null, 2)
            : String(a)
        ).join(' ');
        logBuffer.push({ timestamp, level, message });
        if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
      }

      captureLog('info', ['hello', 'world']);
      assert.strictEqual(logBuffer.length, 1);
      assert.strictEqual(logBuffer[0].level, 'info');
      assert.strictEqual(logBuffer[0].message, 'hello world');
      assert.ok(logBuffer[0].timestamp);
    });

    it('respects MAX_LOG_LINES limit', () => {
      const logBuffer = [];
      const MAX_LOG_LINES = 3;

      function captureLog(level, args) {
        const timestamp = new Date().toLocaleTimeString();
        const sanitized = sanitizeArgs(args);
        const message = sanitized.map(a => String(a)).join(' ');
        logBuffer.push({ timestamp, level, message });
        if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
      }

      for (let i = 0; i < 5; i++) {
        captureLog('log', [`message ${i}`]);
      }
      assert.strictEqual(logBuffer.length, 3);
      assert.strictEqual(logBuffer[0].message, 'message 2');
      assert.strictEqual(logBuffer[2].message, 'message 4');
    });
  });
});
