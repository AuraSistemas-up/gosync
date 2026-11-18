// Gera assets/icon.png (256x256): círculo esmeralda com um "tênis" estilizado. Sem dependências.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const N = 256;
const px = Buffer.alloc(N * N * 4);
const set = (x, y, r, g, b, a = 255) => {
  const i = (y * N + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 128, y - 128);
    if (d > 124) continue; // fora do círculo: transparente
    const t = y / N; // degradê vertical
    set(x, y, Math.round(16 + 20 * t), Math.round(185 - 45 * t), Math.round(129 - 20 * t));
    // sola
    if (y >= 150 && y <= 172 && x >= 52 && x <= 204) set(x, y, 255, 255, 255);
    // cano + bico do tênis
    const body =
      (y >= 96 && y < 150 && x >= 60 && x <= 112) ||
      (y >= 118 && y < 150 && x >= 112 && x <= 196 && y >= 118 + (x - 112) * 0.12) ||
      inEllipse(x, y, 176, 138, 26, 16);
    if (body && y < 150) set(x, y, 255, 255, 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = path.join(__dirname, "..", "assets", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("Ícone gerado:", out);
