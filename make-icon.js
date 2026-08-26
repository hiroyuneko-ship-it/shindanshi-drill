// apple-touch-icon.png (180x180) を生成するだけの使い捨てスクリプト
// 実行:  node make-icon.js
const zlib = require('zlib');
const fs = require('fs');

const W = 180, H = 180;
const px = Buffer.alloc(W * H * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const na = a / 255;
  px[i]   = Math.round(px[i]   * (1 - na) + r * na);
  px[i+1] = Math.round(px[i+1] * (1 - na) + g * na);
  px[i+2] = Math.round(px[i+2] * (1 - na) + b * na);
  px[i+3] = 255;
}
// 背景（角丸なし。iOSが自動でマスクする）＋ 斜めグラデーション
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    set(x, y, Math.round(47 + (18 - 47) * t), Math.round(92 + (40 - 92) * t), Math.round(138 + (63 - 138) * t), 255);
  }
}
function rrect(x0, y0, w, h, rad, col) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + rad - x, x - (x0 + w - 1 - rad), 0);
      const dy = Math.max(y0 + rad - y, y - (y0 + h - 1 - rad), 0);
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = d <= rad - 1 ? 255 : d >= rad ? 0 : Math.round((rad - d) * 255);
      if (a > 0) set(x, y, col[0], col[1], col[2], a);
    }
  }
}
function circle(cx, cy, r, col) {
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = d <= r - 1 ? 255 : d >= r ? 0 : Math.round((r - d) * 255);
      if (a > 0) set(x, y, col[0], col[1], col[2], a);
    }
  }
}
function line(x1, y1, x2, y2, w, col) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circle(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), w / 2, col);
  }
}
rrect(42, 30, 96, 120, 12, [255, 255, 255]);
rrect(58, 56, 44, 8, 4, [195, 206, 219]);
rrect(58, 80, 64, 8, 4, [195, 206, 219]);
rrect(58, 104, 52, 8, 4, [195, 206, 219]);
circle(126, 122, 30, [224, 123, 57]);
line(112, 122, 122, 133, 9, [255, 255, 255]);
line(122, 133, 141, 111, 9, [255, 255, 255]);

// PNG 書き出し
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
let TBL = null;
function crc32(buf) {
  if (!TBL) {
    TBL = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(__dirname + '/apple-touch-icon.png', png);
console.log('apple-touch-icon.png written:', png.length, 'bytes');
