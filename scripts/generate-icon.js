'use strict';

const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 4;

const GRAD_A = { r: 139, g: 92, b: 246 };
const GRAD_B = { r: 59, g: 29, b: 143 };
const TRI = { r: 255, g: 255, b: 255 };

function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}

function orient(px, py, x1, y1, x2, y2) {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = orient(px, py, ax, ay, bx, by);
  const d2 = orient(px, py, bx, by, cx, cy);
  const d3 = orient(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function rasterize(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const hw = size / 2;
  const hh = size / 2;
  const radius = size * 0.22;

  const tw = size * 0.20;
  const th = size * 0.26;
  const shiftX = size * 0.07;
  const ax = cx - tw + shiftX;
  const ay = cy - th;
  const bx = cx - tw + shiftX;
  const by = cy + th;
  const tx = cx + tw + shiftX;
  const ty = cy;

  const denom = 2 * (size - 1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (sdRoundBox(px, py, cx, cy, hw, hh, radius) < 0) {
            a += 255;
            if (pointInTriangle(px, py, ax, ay, bx, by, tx, ty)) {
              r += TRI.r;
              g += TRI.g;
              b += TRI.b;
            } else {
              const t = (px + py) / denom;
              r += GRAD_A.r + (GRAD_B.r - GRAD_A.r) * t;
              g += GRAD_A.g + (GRAD_B.g - GRAD_A.g) * t;
              b += GRAD_A.b + (GRAD_B.b - GRAD_A.b) * t;
            }
          }
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

function bgraData(width, height, rgba) {
  const data = Buffer.alloc(width * height * 4);
  let o = 0;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      data[o++] = rgba[s + 2];
      data[o++] = rgba[s + 1];
      data[o++] = rgba[s];
      data[o++] = rgba[s + 3];
    }
  }
  return data;
}

function andMask(width, height, rgba) {
  const rowBytes = Math.ceil(width / 32) * 4;
  const mask = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      if (rgba[(srcRow * width + x) * 4 + 3] === 0) {
        const byteIdx = y * rowBytes + Math.floor(x / 8);
        mask[byteIdx] |= 0x80 >> (x % 8);
      }
    }
  }
  return mask;
}

function dibEntry(width, height, rgba) {
  const bgra = bgraData(width, height, rgba);
  const mask = andMask(width, height, rgba);
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(width, 4);
  bih.writeInt32LE(height * 2, 8);
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(0, 16);
  bih.writeUInt32LE(bgra.length, 20);
  return Buffer.concat([bih, bgra, mask]);
}

function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + 16 * count;
  const dir = [];
  const blobs = [];
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

function main() {
  const out = path.join(__dirname, '..', 'build', 'icon.ico');
  const entries = SIZES.map((size) => ({ size, data: dibEntry(size, size, rasterize(size)) }));
  fs.writeFileSync(out, buildIco(entries));
  console.log(
    `Icon written to ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB, ${SIZES.length} sizes: ${SIZES.join(', ')})`
  );
}

main();
