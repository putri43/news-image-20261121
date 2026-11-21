// Saturday 21 November 2026 — The World in One Day
// A program that draws one newspaper front page (1600x2000 PNG) summing up
// the world's news of Saturday 21 November 2026.
// Node standard library only. No network. Deterministic: identical bytes
// on every run. Writes to /output/entry.png by default, or argv[2].
import * as fs from "node:fs";
import * as zlib from "node:zlib";

const W = 1600;
const H = 2000;

// ---------------------------------------------------------------- palette
const C = {
  paper: [247, 243, 234],
  ink: [20, 33, 61],
  inkSoft: [52, 64, 92],
  white: [255, 255, 255],
  red: [193, 39, 45],
  redDark: [140, 24, 30],
  amber: [217, 119, 6],
  amberBg: [254, 243, 199],
  green: [21, 128, 61],
  greenBg: [220, 252, 231],
  blue: [37, 99, 235],
  sky: [191, 227, 240],
  skyDeep: [147, 197, 253],
  teal: [13, 148, 136],
  gold: [180, 83, 9],
  purple: [124, 58, 237],
  land: [213, 232, 204],
  landDark: [168, 205, 158],
  sea: [186, 220, 236],
  grey: [120, 126, 138],
  line: [20, 33, 61],
  cream: [255, 251, 235],
};

// ---------------------------------------------------------------- framebuffer
const fb = Buffer.alloc(W * H * 3);
function px(x: number, y: number, c: number[]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2]; i += 3;
    }
  }
}
function hline(x0: number, x1: number, y: number, c: number[]): void {
  if (y < 0 || y >= H) return;
  const a = Math.max(0, Math.min(x0, x1)), b = Math.min(W - 1, Math.max(x0, x1));
  for (let x = a; x <= b; x++) px(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: number[]): void {
  if (x < 0 || x >= W) return;
  const a = Math.max(0, Math.min(y0, y1)), b = Math.min(H - 1, Math.max(y0, y1));
  for (let y = a; y <= b; y++) px(x, y, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) { px(Math.round(x0), Math.round(y0), c); return; }
  for (let i = 0; i <= steps; i++) px(Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps), c);
}
function circle(cx: number, cy: number, r: number, c: number[]): void {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -w; x <= w; x++) px(cx + x, cy + y, c);
  }
}
function ring(cx: number, cy: number, r: number, c: number[]): void {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: number[]): void {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    for (let x = -w; x <= w; x++) px(cx + x, cy + y, c);
  }
}
// filled polygon (scanline)
function poly(pts: number[][], c: number[]): void {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(Math.ceil(xs[k]), Math.floor(xs[k + 1]), y, c);
    }
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number[]): void {
  poly([[x0, y0], [x1, y1], [x2, y2]], c);
}
function box(x: number, y: number, w: number, h: number, c: number[], border?: number[]): void {
  rect(x, y, w, h, c);
  if (border) {
    hline(x, x + w - 1, y, border); hline(x, x + w - 1, y + h - 1, border);
    vline(x, y, y + h - 1, border); vline(x + w - 1, y, y + h - 1, border);
  }
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    fb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}
function writePNG(path: string): void {
  fs.writeFileSync(path, encodePNG());
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows, 5 bits each (bit 4 = leftmost column). Written fresh.
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x11, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x09, 0x08, 0x1e, 0x08, 0x08, 0x08],
  g: [0x00, 0x0e, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x08, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "-": [0, 0, 0, 0x1f, 0, 0, 0],
  "–": [0, 0, 0, 0x1f, 0, 0, 0],
  "—": [0, 0, 0, 0x1f, 0, 0, 0],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "\\": [0x10, 0x10, 0x08, 0x04, 0x02, 0x01, 0x01],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "$": [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "@": [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "*": [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
  "·": [0, 0, 0, 0x0c, 0x0c, 0, 0],
  "°": [0x0e, 0x11, 0x11, 0x0e, 0, 0, 0],
  "↑": [0x04, 0x0e, 0x15, 0x04, 0x04, 0x04, 0x04],
  "↓": [0x04, 0x04, 0x04, 0x04, 0x15, 0x0e, 0x04],
  "→": [0, 0x04, 0x02, 0x1f, 0x02, 0x04, 0],
  "←": [0, 0x04, 0x08, 0x1f, 0x08, 0x04, 0],
  "✓": [0, 0, 0x01, 0x02, 0x14, 0x08, 0x04],
  "×": [0, 0, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  _: [0, 0, 0, 0, 0, 0, 0x1f],
  "|": [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  "~": [0, 0, 0, 0x0a, 0x15, 0, 0],
  "`": [0x08, 0x04, 0x02, 0, 0, 0, 0],
  "^": [0x04, 0x0a, 0x11, 0, 0, 0, 0],
};
const NORMALIZE: Record<string, string> = {
  "’": "'", "‘": "'", "“": '"', "”": '"', "−": "-", "…": "...",
  "₹": "Rs", "£": "GBP", "€": "EUR",
};
function norm(s: string): string {
  let out = "";
  for (const ch of s) out += NORMALIZE[ch] ?? ch;
  return out;
}
function drawChar(x: number, y: number, ch: string, s: number, c: number[]): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (1 << (4 - col))) rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textW(s: string, sc: number): number {
  return norm(s).length * 6 * sc - sc;
}
function drawText(x: number, y: number, s: string, sc: number, c: number[]): number {
  const t = norm(s);
  let cx = x;
  for (const ch of t) { drawChar(cx, y, ch, sc, c); cx += 6 * sc; }
  return cx;
}
function wrapText(s: string, sc: number, maxW: number): string[] {
  const words = norm(s).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textW(test, sc) <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawTextBlock(x: number, y: number, s: string, sc: number, c: number[], maxW: number, lh: number, maxLines = 99): number {
  const lines = wrapText(s, sc, maxW).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(x, y + i * lh, ln, sc, c));
  return y + lines.length * lh;
}

// ---------------------------------------------------------------- stories
// All 48 stories were first reported Saturday 21 November 2026, verified
// from primary wires and outlets named beside each story. Headlines and
// summaries are written fresh for this page.
type Story = {
  n: number; region: string; headline: string; summary: string; source: string;
  status: "DEV" | "SET"; lon: number; lat: number; scene: number;
};
const FEATURES: Story[] = [
  { n: 1, region: "S. AMERICA", headline: "THE ANDES SHAKE AT 00:09", summary: "A 6.7 quake strikes 9 km from Carhuamayo, 108 km deep. Felt in Lima, 320 km away. No deaths reported; USGS alert green.", source: "USGS / AFP", status: "SET", lon: -76, lat: -11, scene: 1 },
  { n: 2, region: "EUROPE", headline: "THE WORD THAT VANISHED", summary: "COP31 runs into overtime in Antalya. The draft deal drops the words fossil fuels entirely. Activists call it the worst COP ever.", source: "AP", status: "DEV", lon: 30.7, lat: 36.9, scene: 2 },
  { n: 3, region: "M. EAST", headline: "THIRD NIGHT OVER RIYADH", summary: "Saudi defences down three Houthi ballistic missiles aimed at the capital, hours after a 1:53 a.m. civil defence alert.", source: "REUTERS", status: "DEV", lon: 46.7, lat: 24.6, scene: 3 },
  { n: 4, region: "N. AMERICA", headline: "WALL STREET INTO CORRECTION", summary: "S&P 500 falls 3.7% and the Nasdaq 5.3% as AI shares sell off. The Nasdaq closes at its lowest since April.", source: "AP / CNBC", status: "SET", lon: -74, lat: 40.7, scene: 4 },
  { n: 5, region: "N. AMERICA", headline: "BITCOIN UNDER $60,000", summary: "$1.6bn of leveraged bets liquidated in a day as BTC sinks to $57,778, its lowest since September 2024. Fear index: 12.", source: "COINGLASS", status: "DEV", lon: -87.6, lat: 41.9, scene: 5 },
  { n: 6, region: "EUROPE", headline: "BRUSSELS RESETS THE RULES", summary: "UK and EU sign three deals: most food and farm checks scrapped from 2028, carbon markets linked, youth mobility for 100,000.", source: "GOV.UK", status: "SET", lon: 4.4, lat: 50.9, scene: 6 },
  { n: 7, region: "ASIA", headline: "THREE LEADERS, FEW ANSWERS", summary: "Trump, Xi and Putin leave the first trilateral summit in Shenzhen with little concrete — but a pledge to keep humans in charge of military AI.", source: "ONE TURN", status: "SET", lon: 114, lat: 22.5, scene: 7 },
  { n: 8, region: "M. EAST", headline: "FOURTEEN TANKERS AT KHARG", summary: "Iranian-flagged tankers mass at Kharg Island, ready to sail as a convoy and test the US blockade. Trump defers any strike past the New Year.", source: "DAILY BRIEF", status: "DEV", lon: 50.3, lat: 29.2, scene: 8 },
  { n: 9, region: "ASIA", headline: "98% OF TRADE, FREED", summary: "Indonesia and the EU sign the CEPA in Brussels: 98% of bilateral trade liberalised, worth about $30bn a year.", source: "ANTARA", status: "SET", lon: 106.8, lat: -6.2, scene: 9 },
  { n: 10, region: "OCEANIA", headline: "A CENTURY IN EVERY LAND", summary: "KL Rahul scores 100 in Wellington and becomes the first Indian opener with Test centuries in all four SENA countries.", source: "DAILY SHORT", status: "SET", lon: 174.8, lat: -41.3, scene: 10 },
  { n: 11, region: "N. AMERICA", headline: "SECRET LAUNCH AT 04:20", summary: "SpaceX lifts the classified USSF-317 payload for the US Space Force from Vandenberg. Booster B1100 lands back on its droneship.", source: "SPACEFLIGHT NOW", status: "SET", lon: -120.6, lat: 34.7, scene: 11 },
  { n: 12, region: "N. AMERICA", headline: "RUSSELL FASTEST IN VEGAS", summary: "George Russell tops final practice at 1:34.041 as Mercedes lock out the front row of the timesheets before qualifying.", source: "CRASH / PLANETF1", status: "DEV", lon: -115.1, lat: 36.2, scene: 12 },
  { n: 13, region: "N. AMERICA", headline: "RIKERS GETS A DATE: 2032", summary: "Mayor Mamdani unveils the first full plan to close the Rikers Island jail complex — five years past the 2027 deadline in law.", source: "DAILY SHORT", status: "SET", lon: -71, lat: 42.5, scene: 13 },
];
type ListItem = { n: number; region: string; text: string; source: string };
const LIST: ListItem[] = [
  { n: 14, region: "N. AMERICA", text: "Nvidia: SEC examines accounting; shares fall 13.8% in the rout", source: "CNBC" },
  { n: 15, region: "M. EAST", text: "Saudi-led strikes hit Hodeidah, Sanaa, Saada and Taiz in Yemen", source: "REUTERS" },
  { n: 16, region: "N. AMERICA", text: "Trump threatens to bar US firms building AI data centres abroad", source: "AP" },
  { n: 17, region: "EUROPE", text: "NATO chief Rutte visits Warsaw after the Polish airspace breach", source: "AP" },
  { n: 18, region: "M. EAST", text: "Iran war nears its ninth month; Trump in no rush on strikes", source: "ONE TURN" },
  { n: 19, region: "EUROPE", text: "Kryvyi Rih: two dead and 42 injured in a Russian strike", source: "VILKUL" },
  { n: 20, region: "N. AMERICA", text: "Jury convicts the man who started the Palisades Fire in LA", source: "ONE TURN" },
  { n: 21, region: "ASIA", text: "Myanmar calls the ICJ genocide ruling against it 'unfair'", source: "AP" },
  { n: 22, region: "ASIA", text: "Quad business forum set for early 2027, Rubio confirms", source: "NATION PRESS" },
  { n: 23, region: "ASIA", text: "Manila: $17bn in SE Asia deals; 20 Dreamliners for PAL", source: "NATION PRESS" },
  { n: 24, region: "ASIA", text: "Nepal PM Balen begins his first foreign visit in Delhi", source: "DAILY SHORT" },
  { n: 25, region: "ASIA", text: "Record Rs1.22 lakh crore of foreign money into Indian shares", source: "DAILY SHORT" },
  { n: 26, region: "ASIA", text: "NSE becomes the world's fifth-largest listed exchange", source: "OBSERVER VOICE" },
  { n: 27, region: "ASIA", text: "Botswana-born cheetah gives birth to four cubs at Kuno", source: "OBSERVER VOICE" },
  { n: 28, region: "ASIA", text: "Japanese forces to use Indian ranges for live-fire drills, a first", source: "OBSERVER VOICE" },
  { n: 29, region: "ASIA", text: "Indonesia fire losses could reach $30bn, research finds", source: "OBSERVER VOICE" },
  { n: 30, region: "ASIA", text: "Malaysia to resettle 10,000 Rohingya refugees to Turkiye", source: "OBSERVER VOICE" },
  { n: 31, region: "EUROPE", text: "Denmark expels a Russian diplomat over an alleged murder plot", source: "VIRAL SA METRO" },
  { n: 32, region: "EUROPE", text: "Cost-of-living protests disrupt cities across Italy", source: "VIRAL SA METRO" },
  { n: 33, region: "N. AMERICA", text: "American woman freed after ten years in a Cuban prison", source: "VIRAL SA METRO" },
  { n: 34, region: "N. AMERICA", text: "Top court allows the Deepathoon lamp lighting, one time only", source: "TOI" },
  { n: 35, region: "N. AMERICA", text: "Indian man gets 19 years in the Sikh separatist murder plot", source: "AP" },
  { n: 36, region: "ASIA", text: "India: no change on the Indus Water Treaty, Delhi says", source: "TOI" },
  { n: 37, region: "OCEANIA", text: "Jaiswal and Rahul share a 130-run opening stand in Wellington", source: "OBSERVER VOICE" },
  { n: 38, region: "N. AMERICA", text: "GTA 6 PC scam: a $200 malware kit targets gamers' crypto", source: "TOI" },
  { n: 39, region: "M. EAST", text: "Likud demands Netanyahu as sole PM in any unity deal", source: "TIMES OF ISRAEL" },
  { n: 40, region: "N. AMERICA", text: "Dragon splashes down off California with 6,300 lbs of cargo", source: "NASA" },
  { n: 41, region: "N. AMERICA", text: "Coinbase plans in-house US prediction markets for early 2027", source: "JOY" },
  { n: 42, region: "EUROPE", text: "N. Korea hackers laundered $149m of stolen Binance bitcoin", source: "ELLIPTIC" },
  { n: 43, region: "AFRICA", text: "US consortium wins Kenya mining deal, beating Chinese rivals", source: "BBC" },
  { n: 44, region: "AFRICA", text: "Obi vows to end kidnappings and corruption in Nigeria", source: "PUNCH" },
  { n: 45, region: "AFRICA", text: "Migrant boat capsizes off Senegal; dozens missing", source: "BBC" },
  { n: 46, region: "AFRICA", text: "Nigeria moves to end jail terms for attempted suicide", source: "BBC" },
  { n: 47, region: "AFRICA", text: "South Sudan delays its first elections to February 2027", source: "WH NEWS" },
  { n: 48, region: "GLOBAL", text: "Gold $3,539 an ounce (-4%), silver -7.4%, oil $83.62", source: "COINBELL" },
];
const REGION_COUNTS: [string, number][] = [
  ["N. AMERICA", 13], ["S. AMERICA", 1], ["EUROPE", 7], ["M. EAST", 5],
  ["AFRICA", 5], ["ASIA", 14], ["OCEANIA", 2], ["GLOBAL", 1],
];

// ---------------------------------------------------------------- scene helpers
function skyBands(x: number, y: number, w: number, h: number, bands: number[][]): void {
  const n = bands.length;
  for (let i = 0; i < n; i++) rect(x, y + Math.floor((h * i) / n), w, Math.ceil(h / n) + 1, bands[i]);
}
function cloud(x: number, y: number, s: number, c: number[]): void {
  ellipse(x, y, 14 * s, 6 * s, c); ellipse(x + 12 * s, y - 3 * s, 10 * s, 6 * s, c); ellipse(x + 24 * s, y, 12 * s, 5 * s, c);
}
function birds(x: number, y: number, c: number[]): void {
  line(x, y, x + 6, y - 4, c); line(x + 6, y - 4, x + 12, y, c);
  line(x + 16, y + 3, x + 22, y - 1, c); line(x + 22, y - 1, x + 28, y + 3, c);
}
function stars(x: number, y: number, w: number, h: number, n: number, seed: number): void {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    const sx = x + Math.floor(rnd() * w), sy = y + Math.floor(rnd() * h);
    px(sx, sy, C.white); if (rnd() > 0.6) px(sx + 1, sy, C.white);
  }
}
function flag(x: number, y: number, w: number, h: number, stripes: number[][]): void {
  const n = stripes.length;
  for (let i = 0; i < n; i++) rect(x, y + Math.floor((h * i) / n), w, Math.ceil(h / n), stripes[i]);
  rect(x, y, w, h, C.ink); // thin frame via outline below
  hline(x, x + w - 1, y, C.ink); hline(x, x + w - 1, y + h - 1, C.ink);
  vline(x, y, y + h - 1, C.ink); vline(x + w - 1, y, y + h - 1, C.ink);
}
function pole(x: number, y0: number, y1: number): void { vline(x, y0, y1, [90, 90, 90]); }

// ---------------------------------------------------------------- the 13 scenes
function scene1(x: number, y: number, w: number, h: number): void {
  // Peru: dusk over the Andes, seismic waves, cracked ground
  skyBands(x, y, w, h, [[64, 50, 96], [122, 74, 110], [214, 128, 84]]);
  circle(x + w - 42, y + 26, 15, [255, 214, 130]);
  cloud(x + 18, y + 22, 1, [255, 255, 255]);
  cloud(x + w - 110, y + 44, 1, [240, 220, 210]);
  const gy = y + h - 52;
  poly([[x, gy + 40], [x, gy], [x + w * 0.22, gy - 58], [x + w * 0.38, gy], [x + w * 0.55, gy - 78], [x + w * 0.72, gy - 6], [x + w * 0.88, gy - 40], [x + w, gy + 4], [x + w, gy + 40]], [58, 62, 84]);
  poly([[x + w * 0.2, gy - 54], [x + w * 0.26, gy - 58], [x + w * 0.32, gy - 40], [x + w * 0.26, gy - 44]], C.white);
  poly([[x + w * 0.53, gy - 74], [x + w * 0.6, gy - 78], [x + w * 0.66, gy - 58], [x + w * 0.6, gy - 62]], C.white);
  rect(x, gy + 38, w, h - (gy + 38 - y), [52, 44, 40]);
  line(x + w * 0.42, gy + 38, x + w * 0.46, gy + 52, C.red); line(x + w * 0.46, gy + 52, x + w * 0.4, gy + 64, C.red); line(x + w * 0.4, gy + 64, x + w * 0.48, gy + 78, C.red);
  // seismic arcs
  for (let r = 10; r <= 40; r += 10) {
    for (let a = 200; a <= 340; a += 6) {
      const t = (a * Math.PI) / 180;
      px(Math.round(x + w * 0.62 + r * Math.cos(t)), Math.round(gy - 8 + r * Math.sin(t) * 0.6), [255, 220, 120]);
    }
  }
  rect(x + 14, gy + 8, 26, 20, [230, 200, 160]); tri(x + 12, gy + 8, x + 27, gy - 6, x + 42, gy + 8, [160, 40, 40]);
  rect(x + w - 52, gy + 12, 24, 18, [220, 190, 150]); tri(x + w - 54, gy + 12, x + w - 40, gy - 2, x + w - 26, gy + 12, [160, 40, 40]);
  birds(x + w * 0.6, y + 18, [30, 30, 40]);
}
function scene2(x: number, y: number, w: number, h: number): void {
  // COP31: summit hall, flags, rising thermometer, smoke
  skyBands(x, y, w, h, [[168, 208, 224], [214, 232, 238], [240, 240, 232]]);
  cloud(x + 20, y + 18, 1, C.white); cloud(x + w - 90, y + 30, 1, C.white);
  const gy = y + h - 46;
  // hall: dome + colonnade
  rect(x + w * 0.18, gy - 58, w * 0.64, 58, [240, 232, 210]);
  poly([[x + w * 0.18, gy - 58], [x + w * 0.5, gy - 98], [x + w * 0.82, gy - 58]], [193, 39, 45]);
  circle(x + w * 0.5, gy - 98, 5, [255, 214, 130]);
  for (let i = 0; i < 5; i++) rect(x + w * (0.24 + i * 0.13), gy - 44, 10, 44, [120, 110, 96]);
  rect(x + w * 0.42, gy - 30, w * 0.16, 30, [90, 70, 60]);
  // flags row
  const flagCols = [[193, 39, 45], [37, 99, 235], [21, 128, 61], [217, 119, 6], [124, 58, 237]];
  for (let i = 0; i < 5; i++) { pole(x + w * (0.14 + i * 0.18), gy - 96, gy - 58); flag(x + w * (0.14 + i * 0.18) + 2, gy - 96, 20, 12, [flagCols[i], C.white]); }
  // thermometer
  rect(x + w - 34, gy - 84, 10, 66, C.white); rect(x + w - 34, gy - 84, 10, 66, C.ink);
  circle(x + w - 29, gy - 14, 9, [193, 39, 45]); rect(x + w - 31, gy - 60, 4, 44, [193, 39, 45]);
  // smoke puffs
  circle(x + 26, gy - 66, 9, [120, 126, 138]); circle(x + 40, gy - 76, 11, [140, 146, 158]); circle(x + 56, gy - 64, 8, [120, 126, 138]);
  // protest placard
  line(x + w * 0.78, gy - 40, x + w * 0.78, gy - 8, [90, 70, 60]);
  rect(x + w * 0.72, gy - 62, 44, 22, [255, 255, 255]); rect(x + w * 0.72, gy - 62, 44, 22, C.ink);
  drawText(x + w * 0.72 + 5, gy - 58, "NO", 1, C.red);
  rect(x, gy, w, h - (gy - y), [90, 110, 80]);
  hline(x, x + w - 1, gy, [60, 80, 55]);
}
function scene3(x: number, y: number, w: number, h: number): void {
  // Riyadh: night skyline, intercept trails, bursts
  skyBands(x, y, w, h, [[16, 24, 48], [28, 42, 78], [52, 68, 110]]);
  stars(x, y, w, Math.floor(h * 0.5), 26, 7);
  circle(x + w - 40, y + 24, 13, [240, 230, 200]);
  const gy = y + h - 44;
  // skyline
  rect(x + 10, gy - 46, 34, 46, [24, 34, 62]); rect(x + 52, gy - 70, 26, 70, [32, 46, 84]);
  rect(x + 86, gy - 38, 40, 38, [24, 34, 62]); rect(x + 134, gy - 58, 30, 58, [32, 46, 84]);
  rect(x + w - 62, gy - 96, 30, 96, [20, 30, 56]);
  // Kingdom Centre tower: tapered with arch cut
  poly([[x + w - 58, gy], [x + w - 52, gy - 96], [x + w - 36, gy - 96], [x + w - 30, gy]], [24, 34, 62]);
  poly([[x + w - 52, gy - 96], [x + w - 44, gy - 78], [x + w - 36, gy - 96]], [52, 68, 110]);
  // lit windows
  for (let i = 0; i < 8; i++) { rect(x + 16 + (i % 4) * 8, gy - 40 + Math.floor(i / 4) * 14, 4, 6, [255, 214, 130]); }
  for (let i = 0; i < 6; i++) rect(x + w - 58 + (i % 3) * 9, gy - 88 + Math.floor(i / 3) * 16, 4, 6, [255, 214, 130]);
  // missile trails (white arcs) + bursts
  line(x + 30, y + 18, x + 70, y + 52, C.white); line(x + 70, y + 52, x + 96, y + 44, C.white);
  line(x + w - 90, y + 14, x + w - 60, y + 46, C.white);
  for (let a = 0; a < 360; a += 30) { const t = (a * Math.PI) / 180; line(x + 100, y + 46, Math.round(x + 100 + 16 * Math.cos(t)), Math.round(y + 46 + 16 * Math.sin(t)), [255, 200, 60]); }
  circle(x + 100, y + 46, 5, [255, 220, 100]);
  for (let a = 0; a < 360; a += 45) { const t = (a * Math.PI) / 180; line(x + w - 56, y + 50, Math.round(x + w - 56 + 12 * Math.cos(t)), Math.round(y + 50 + 12 * Math.sin(t)), [255, 200, 60]); }
  circle(x + w - 56, y + 50, 4, [255, 220, 100]);
  rect(x, gy, w, h - (gy - y), [18, 26, 44]);
  // shield
  poly([[x + 16, gy + 12], [x + 30, gy + 6], [x + 44, gy + 12], [x + 44, gy + 26], [x + 30, gy + 36], [x + 16, gy + 26]], [37, 99, 235]);
  drawText(x + 24, gy + 14, "3", 2, C.white);
}
function scene4(x: number, y: number, w: number, h: number): void {
  // Wall Street: exchange facade, falling candlesticks, red arrow
  skyBands(x, y, w, h, [[226, 232, 238], [240, 240, 236], [250, 246, 238]]);
  const gy = y + h - 40;
  // facade, sized to fit inside the scene
  rect(x + w * 0.08, gy - 48, w * 0.84, 48, [232, 226, 210]);
  tri(x + w * 0.08, gy - 48, x + w * 0.5, gy - 66, x + w * 0.92, gy - 48, [200, 188, 160]);
  circle(x + w * 0.5, gy - 56, 6, [180, 160, 120]);
  for (let i = 0; i < 6; i++) rect(x + w * (0.13 + i * 0.14), gy - 38, 12, 38, [160, 148, 122]);
  rect(x + w * 0.44, gy - 28, w * 0.12, 28, [90, 70, 60]);
  // candlesticks falling left to right
  const candles: [number, number, number][] = [[0.12, 26, 40], [0.26, 34, 52], [0.4, 44, 60], [0.54, 52, 68], [0.68, 62, 78], [0.82, 74, 88]];
  for (const [fx, top, bot] of candles) {
    const cx = x + w * fx;
    vline(cx + 5, y + top - 8, y + bot + 8, [140, 40, 40]);
    rect(cx, y + top, 11, bot - top, [193, 39, 45]);
  }
  // big red down arrow
  poly([[x + w * 0.55, y + 12], [x + w * 0.72, y + 12], [x + w * 0.72, y + 26], [x + w * 0.86, y + 26], [x + w * 0.63, y + 52], [x + w * 0.4, y + 26], [x + w * 0.55, y + 26]], [193, 39, 45]);
  rect(x, gy, w, h - (gy - y), [70, 78, 88]);
  drawText(x + 10, gy + 10, "S&P -3.7%", 2, C.white);
  drawText(x + w - 96, gy + 10, "NASDAQ -5.3%", 1, [255, 200, 190]);
}
function scene5(x: number, y: number, w: number, h: number): void {
  // Bitcoin: gold coin, falling chart, fear gauge
  skyBands(x, y, w, h, [[24, 28, 52], [44, 48, 84], [70, 72, 110]]);
  stars(x, y, w, Math.floor(h * 0.45), 18, 11);
  // big coin
  circle(x + w * 0.32, y + h * 0.42, 44, [247, 147, 26]);
  ring(x + w * 0.32, y + h * 0.42, 44, [180, 100, 10]);
  ring(x + w * 0.32, y + h * 0.42, 36, [255, 200, 90]);
  drawText(x + w * 0.32 - 16, y + h * 0.42 - 18, "B", 4, [255, 255, 255]);
  // falling chart
  line(x + w * 0.58, y + 22, x + w * 0.68, y + 44, [255, 90, 90]);
  line(x + w * 0.68, y + 44, x + w * 0.78, y + 40, [255, 90, 90]);
  line(x + w * 0.78, y + 40, x + w * 0.9, y + 66, [255, 90, 90]);
  line(x + w * 0.9, y + 66, x + w * 0.97, y + 88, [255, 90, 90]);
  // fear gauge
  const gx = x + w * 0.78, gyy = y + h - 46;
  for (let a = 180; a <= 360; a += 6) {
    const t = (a * Math.PI) / 180;
    px(Math.round(gx + 34 * Math.cos(t)), Math.round(gyy + 30 * Math.sin(t)), [255, 220, 100]);
  }
  line(gx, gyy, gx - 26, gyy - 16, [255, 80, 80]);
  circle(gx, gyy, 4, C.white);
  drawText(x + w * 0.62, gyy + 6, "FEAR 12", 2, [255, 200, 90]);
  rect(x, y + h - 24, w, 24, [16, 20, 36]);
  drawText(x + 10, y + h - 18, "$58,311", 2, [247, 147, 26]);
  const lowTag = "LOWEST SINCE SEP 2024";
  drawText(x + w - textW(lowTag, 1) - 10, y + h - 18, lowTag, 1, [200, 200, 210]);
}
function scene6(x: number, y: number, w: number, h: number): void {
  // UK-EU: bridge over the Channel, flags, documents with ticks
  skyBands(x, y, w, h, [[170, 210, 235], [205, 228, 240], [238, 242, 240]]);
  cloud(x + 16, y + 16, 1, C.white); cloud(x + w - 100, y + 26, 1, C.white);
  birds(x + w * 0.55, y + 16, [40, 50, 60]);
  const gy = y + h - 52;
  // sea
  rect(x, gy - 6, w, h - (gy - 6 - y), [90, 150, 190]);
  for (let i = 0; i < 5; i++) hline(x + 10 + i * 22, x + 34 + i * 22, gy + 12 + (i % 2) * 10, [220, 235, 245]);
  // bridge arc
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const bx = x + w * 0.08 + t * w * 0.84;
    const by = gy - 6 - Math.sin(t * Math.PI) * 48;
    rect(Math.round(bx), Math.round(by), 5, 5, [120, 110, 100]);
  }
  hline(x + w * 0.06, x + w * 0.94, gy - 6, [120, 110, 100]);
  // flags on the bridge
  pole(x + w * 0.3, gy - 56, gy - 6); flag(x + w * 0.3 + 2, gy - 56, 22, 13, [[193, 39, 45], C.white, [37, 99, 235]]);
  pole(x + w * 0.66, gy - 56, gy - 6); flag(x + w * 0.66 + 2, gy - 56, 22, 13, [[37, 99, 235]]);
  circle(x + w * 0.66 + 13, gy - 50, 1, [255, 220, 60]);
  // documents with ticks
  rect(x + 12, gy - 44, 40, 30, C.white); rect(x + 12, gy - 44, 40, 30, C.ink);
  drawText(x + 18, gy - 40, "FOOD", 1, C.ink); line(x + 18, gy - 26, x + 24, gy - 18, C.green); line(x + 24, gy - 18, x + 36, gy - 34, C.green);
  rect(x + w - 54, gy - 44, 40, 30, C.white); rect(x + w - 54, gy - 44, 40, 30, C.ink);
  drawText(x + w - 48, gy - 40, "YOUTH", 1, C.ink); line(x + w - 48, gy - 26, x + w - 42, gy - 18, C.green); line(x + w - 42, gy - 18, x + w - 30, gy - 34, C.green);
}
function scene7(x: number, y: number, w: number, h: number): void {
  // Shenzhen: skyline, three flags, summit table
  skyBands(x, y, w, h, [[232, 196, 160], [214, 170, 150], [190, 150, 140]]);
  circle(x + w - 44, y + 26, 16, [255, 220, 150]);
  cloud(x + 20, y + 20, 1, [255, 244, 230]);
  const gy = y + h - 44;
  // towers, heights scaled to fit inside the scene
  const tH = h - 50;
  rect(x + 12, gy - Math.floor(tH * 0.72), 30, Math.floor(tH * 0.72), [90, 80, 110]);
  rect(x + 48, gy - tH, 26, tH, [110, 96, 128]);
  rect(x + 80, gy - Math.floor(tH * 0.59), 34, Math.floor(tH * 0.59), [90, 80, 110]);
  rect(x + w - 96, gy - Math.floor(tH * 0.85), 28, Math.floor(tH * 0.85), [110, 96, 128]);
  rect(x + w - 58, gy - Math.floor(tH * 0.52), 34, Math.floor(tH * 0.52), [90, 80, 110]);
  for (let i = 0; i < 5; i++) rect(x + 18 + (i % 3) * 9, gy - Math.floor(tH * 0.72) + 8 + Math.floor(i / 3) * 16, 4, 6, [255, 220, 150]);
  for (let i = 0; i < 4; i++) rect(x + 53 + (i % 2) * 9, gy - tH + 8 + Math.floor(i / 2) * 18, 4, 6, [255, 220, 150]);
  // three flags on poles, kept inside the scene near the top
  const fcols = [[[193, 39, 45], C.white, [37, 99, 235]], [[193, 39, 45], [255, 220, 60]], [[240, 240, 240], [37, 99, 235]]];
  for (let i = 0; i < 3; i++) {
    const fx = x + w * (0.3 + i * 0.2);
    pole(fx, y + 10, y + 44);
    flag(fx + 2, y + 10, 24, 14, fcols[i]);
  }
  // summit table + chairs
  rect(x + w * 0.28, gy - 26, w * 0.44, 10, [140, 100, 70]);
  rect(x + w * 0.3, gy - 16, 8, 16, [120, 85, 55]); rect(x + w * 0.66, gy - 16, 8, 16, [120, 85, 55]);
  circle(x + w * 0.5, gy - 40, 8, [240, 220, 200]);
  rect(x, gy, w, h - (gy - y), [70, 66, 88]);
  drawText(x + 10, gy + 10, "SHENZHEN", 2, C.white);
  drawText(x + w - 118, gy + 10, "3 LEADERS", 1, [230, 220, 210]);
}
function scene8(x: number, y: number, w: number, h: number): void {
  // Kharg: tankers at sea, blockade chain, sun
  skyBands(x, y, w, h, [[250, 210, 140], [240, 180, 120], [220, 150, 110]]);
  circle(x + w * 0.5, y + 24, 17, [255, 240, 180]);
  cloud(x + 16, y + 18, 1, [255, 250, 240]);
  const sy = y + Math.floor(h * 0.48);
  rect(x, sy, w, h - (sy - y), [38, 96, 140]);
  for (let i = 0; i < 6; i++) hline(x + 8 + (i % 3) * 30, x + 30 + (i % 3) * 30, sy + 12 + Math.floor(i / 3) * 16, [140, 190, 220]);
  // three tankers
  const tank = (tx: number, ty: number, s: number, hull: number[]) => {
    rect(tx, ty, 74 * s, 16 * s, hull);
    rect(tx + 8 * s, ty - 12 * s, 22 * s, 12 * s, [240, 240, 235]);
    rect(tx + 52 * s, ty - 18 * s, 8 * s, 18 * s, [200, 60, 50]);
    rect(tx + 34 * s, ty - 8 * s, 12 * s, 8 * s, [255, 220, 90]);
    line(tx - 6 * s, ty + 16 * s, tx + 80 * s, ty + 16 * s, [220, 235, 245]);
  };
  tank(x + 12, sy + 22, 1, [30, 50, 80]);
  tank(x + w * 0.42, sy + 38, 1, [40, 60, 90]);
  tank(x + w * 0.68, sy + 14, 0.8, [30, 50, 80]);
  // blockade chain across the top of the sea
  for (let i = 0; i < 12; i++) circle(x + 12 + i * Math.floor(w / 12), sy + 2, 4, [255, 220, 100]);
  birds(x + w * 0.7, y + 20, [60, 50, 40]);
  rect(x, y + h - 22, w, 22, [20, 40, 70]);
  drawText(x + 10, y + h - 17, "14 TANKERS", 2, [255, 220, 100]);
  drawText(x + w - 118, y + h - 17, "KHARG ISLAND", 1, [200, 215, 230]);
}
function scene9(x: number, y: number, w: number, h: number): void {
  // CEPA: container port, crane, flags, handshake
  skyBands(x, y, w, h, [[180, 220, 235], [210, 232, 240], [240, 242, 238]]);
  cloud(x + 18, y + 16, 1, C.white); cloud(x + w - 110, y + 30, 1, C.white);
  const gy = y + h - 40;
  // crane
  rect(x + w - 66, y + 20, 8, gy - y - 20, [220, 80, 60]);
  line(x + w - 62, y + 20, x + 20, y + 34, [220, 80, 60]);
  line(x + 30, y + 34, x + 30, y + 58, [90, 90, 90]);
  rect(x + 22, y + 58, 18, 12, [37, 99, 235]);
  // container stacks
  const cont = (cx: number, cy: number, c: number[]) => { rect(cx, cy, 44, 18, c); rect(cx, cy, 44, 18, C.ink); hline(cx + 4, cx + 40, cy + 9, C.ink); };
  cont(x + 16, gy - 58, [193, 39, 45]); cont(x + 16, gy - 38, [37, 99, 235]); cont(x + 16, gy - 18, [21, 128, 61]);
  cont(x + 66, gy - 38, [217, 119, 6]); cont(x + 66, gy - 18, [124, 58, 237]);
  cont(x + w - 150, gy - 38, [13, 148, 136]); cont(x + w - 150, gy - 18, [193, 39, 45]);
  // flags: EU stars + Indonesia red-white
  pole(x + w * 0.52, gy - 66, gy - 18); flag(x + w * 0.52 + 2, gy - 66, 24, 14, [[37, 99, 235]]);
  for (let i = 0; i < 5; i++) px(x + w * 0.52 + 6 + (i % 3) * 6, gy - 62 + Math.floor(i / 3) * 6, [255, 220, 60]);
  pole(x + w * 0.66, gy - 66, gy - 18); flag(x + w * 0.66 + 2, gy - 66, 24, 14, [[193, 39, 45], C.white]);
  // handshake: two clasped hands simplified as interlocked arcs
  circle(x + w * 0.58, gy - 8, 10, [240, 200, 160]); circle(x + w * 0.62, gy - 8, 10, [220, 180, 140]);
  rect(x, gy, w, h - (gy - y), [60, 70, 80]);
  drawText(x + 10, gy + 10, "98% FREE", 2, C.white);
  drawText(x + w - 96, gy + 10, "$30BN TRADE", 1, [220, 230, 240]);
}
function scene10(x: number, y: number, w: number, h: number): void {
  // Wellington: cricket pitch, batsman, stumps, 100
  skyBands(x, y, w, h, [[150, 200, 235], [190, 220, 240], [225, 238, 240]]);
  cloud(x + 16, y + 16, 1, C.white); cloud(x + w - 100, y + 28, 1, C.white);
  const gy = y + h - 52;
  // stands
  rect(x, gy - 34, w, 34, [120, 130, 140]);
  for (let i = 0; i < 14; i++) circle(x + 12 + i * Math.floor((w - 24) / 14), gy - 22 + (i % 2) * 10, 3, [[255, 255, 255], [255, 220, 100], [193, 39, 45]][i % 3]);
  // outfield + pitch
  rect(x, gy, w, h - (gy - y), [46, 130, 70]);
  rect(x + w * 0.42, gy, w * 0.16, h - (gy - y), [210, 190, 140]);
  hline(x, x + w - 1, gy, [255, 255, 255]);
  // stumps
  vline(x + w * 0.72, gy + 8, gy + 26, [240, 220, 160]); vline(x + w * 0.72 + 5, gy + 8, gy + 26, [240, 220, 160]); vline(x + w * 0.72 + 10, gy + 8, gy + 26, [240, 220, 160]);
  hline(x + w * 0.72, x + w * 0.72 + 10, gy + 7, [240, 220, 160]);
  // batsman
  circle(x + w * 0.3, gy + 12, 8, [200, 150, 110]);
  rect(x + w * 0.3 - 7, gy + 20, 14, 20, [30, 60, 140]);
  line(x + w * 0.3 + 6, gy + 26, x + w * 0.3 + 22, gy + 44, [190, 160, 110]);
  line(x + w * 0.3 + 22, gy + 44, x + w * 0.3 + 26, gy + 48, [190, 160, 110]);
  // ball in flight
  circle(x + w * 0.55, gy - 6, 5, [193, 39, 45]);
  line(x + w * 0.5, gy - 2, x + w * 0.6, gy - 10, [255, 255, 255]);
  // score badge
  rect(x + w - 74, y + 12, 62, 30, [20, 33, 61]);
  drawText(x + w - 66, y + 18, "100", 3, [255, 220, 100]);
}
function scene11(x: number, y: number, w: number, h: number): void {
  // Vandenberg: night launch, rocket, flame, stars
  skyBands(x, y, w, h, [[10, 16, 36], [20, 30, 62], [36, 52, 96]]);
  stars(x, y, w, Math.floor(h * 0.6), 30, 23);
  circle(x + 34, y + 24, 12, [235, 228, 210]);
  const gy = y + h - 30;
  // pad + tower
  rect(x + w * 0.2, gy - 58, 10, 58, [120, 120, 130]);
  rect(x + w * 0.2 - 6, gy - 66, 22, 8, [150, 150, 160]);
  rect(x, gy, w, h - (gy - y), [30, 34, 44]);
  // rocket, compressed to fit inside the scene
  const rx = x + w * 0.5;
  rect(rx - 7, gy - 52, 14, 34, [240, 240, 238]);
  tri(rx - 7, gy - 52, rx, gy - 64, rx + 7, gy - 52, [193, 39, 45]);
  rect(rx - 7, gy - 44, 14, 4, [37, 99, 235]);
  tri(rx - 7, gy - 18, rx - 15, gy - 8, rx - 7, gy - 8, [180, 40, 40]);
  tri(rx + 7, gy - 18, rx + 15, gy - 8, rx + 7, gy - 8, [180, 40, 40]);
  // flame + smoke
  tri(rx - 5, gy - 8, rx, gy + 10, rx + 5, gy - 8, [255, 180, 40]);
  tri(rx - 3, gy - 8, rx, gy + 4, rx + 3, gy - 8, [255, 240, 150]);
  circle(rx - 22, gy - 2, 5, [180, 185, 195]); circle(rx + 24, gy, 6, [160, 165, 175]); circle(rx + 34, gy - 4, 4, [180, 185, 195]);
  // classified band
  rect(x + w - 118, y + 12, 106, 22, [193, 39, 45]);
  drawText(x + w - 110, y + 17, "CLASSIFIED", 1, C.white);
}
function scene12(x: number, y: number, w: number, h: number): void {
  // Las Vegas: night street circuit, F1 car, neon, Stratosphere tower
  skyBands(x, y, w, h, [[18, 16, 44], [44, 28, 78], [80, 44, 100]]);
  stars(x, y, w, Math.floor(h * 0.4), 16, 31);
  const gy = y + h - 46;
  // towers
  rect(x + 14, gy - 58, 12, 58, [60, 50, 90]); circle(x + 20, gy - 58, 5, [255, 220, 100]);
  tri(x + w - 74, gy, x + w - 52, gy - 62, x + w - 30, gy, [70, 60, 100]);
  rect(x + w - 40, gy - 44, 26, 44, [50, 44, 84]);
  for (let i = 0; i < 4; i++) rect(x + w - 38 + (i % 2) * 12, gy - 40 + Math.floor(i / 2) * 16, 5, 7, [255, 220, 100]);
  // neon strips
  hline(x + 10, x + w - 10, gy - 30, [255, 60, 180]); hline(x + 10, x + w - 10, gy - 24, [60, 220, 255]);
  // track
  rect(x, gy, w, h - (gy - y), [36, 36, 44]);
  hline(x, x + w - 1, gy + 18, [255, 255, 255]);
  for (let i = 0; i < 8; i++) rect(x + 10 + i * Math.floor((w - 20) / 8), gy + 30, 18, 4, [255, 220, 100]);
  // F1 car
  const cx = x + w * 0.42, cy = gy + 8;
  rect(cx - 34, cy - 4, 68, 7, [193, 39, 45]);
  poly([[cx - 34, cy - 4], [cx - 20, cy - 12], [cx + 8, cy - 12], [cx + 20, cy - 4]], [220, 60, 60]);
  rect(cx + 26, cy - 16, 6, 12, [120, 20, 20]);
  circle(cx - 20, cy + 5, 7, [20, 20, 24]); circle(cx + 18, cy + 5, 7, [20, 20, 24]);
  circle(cx - 20, cy + 5, 3, [200, 200, 210]); circle(cx + 18, cy + 5, 3, [200, 200, 210]);
  // chequered flag
  pole(x + w - 24, gy - 34, gy + 2);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) rect(x + w - 22 + c * 5, gy - 34 + r * 6, 5, 6, (r + c) % 2 ? C.white : C.ink);
  drawText(x + 10, y + 12, "1:34.041", 2, [255, 220, 100]);
}
function scene13(x: number, y: number, w: number, h: number): void {
  // New York: skyline at sunrise, jail bars, key, 2032
  skyBands(x, y, w, h, [[250, 190, 120], [240, 160, 110], [220, 140, 120]]);
  circle(x + w - 46, y + 26, 15, [255, 230, 160]);
  cloud(x + 18, y + 20, 1, [255, 240, 225]);
  const gy = y + h - 46;
  // skyline
  rect(x + 10, gy - 52, 26, 52, [70, 66, 96]); rect(x + 42, gy - 58, 24, 58, [84, 78, 112]);
  tri(x + 42, gy - 58, x + 54, gy - 62, x + 66, gy - 58, [84, 78, 112]);
  rect(x + 72, gy - 40, 30, 40, [70, 66, 96]); rect(x + w - 88, gy - 56, 28, 56, [84, 78, 112]);
  rect(x + w - 52, gy - 46, 30, 46, [70, 66, 96]);
  for (let i = 0; i < 8; i++) rect(x + 16 + (i % 4) * 7, gy - 46 + Math.floor(i / 4) * 14, 4, 6, [255, 220, 130]);
  for (let i = 0; i < 4; i++) rect(x + 47 + (i % 2) * 9, gy - 52 + Math.floor(i / 2) * 16, 4, 6, [255, 220, 130]);
  // jail bars + key
  for (let i = 0; i < 5; i++) vline(x + w * 0.62 + i * 12, gy - 44, gy - 4, [40, 40, 52]);
  hline(x + w * 0.62, x + w * 0.62 + 48, gy - 44, [40, 40, 52]); hline(x + w * 0.62, x + w * 0.62 + 48, gy - 4, [40, 40, 52]);
  circle(x + w * 0.82, gy - 30, 7, [255, 200, 60]); ring(x + w * 0.82, gy - 30, 7, [180, 130, 20]);
  line(x + w * 0.82 + 6, gy - 26, x + w * 0.82 + 20, gy - 14, [255, 200, 60]);
  line(x + w * 0.82 + 16, gy - 18, x + w * 0.82 + 16, gy - 10, [255, 200, 60]);
  line(x + w * 0.82 + 20, gy - 16, x + w * 0.82 + 20, gy - 8, [255, 200, 60]);
  rect(x, gy, w, h - (gy - y), [60, 56, 84]);
  drawText(x + 10, gy + 10, "2032", 3, [255, 220, 100]);
  drawText(x + 92, gy + 14, "CLOSING DATE SET", 1, [235, 228, 220]);
}
const SCENES: ((x: number, y: number, w: number, h: number) => void)[] = [
  () => {}, scene1, scene2, scene3, scene4, scene5, scene6, scene7, scene8, scene9, scene10, scene11, scene12, scene13,
];

// ---------------------------------------------------------------- layout
const MX = 24;            // margin
const RX = 1576;          // right edge
const CW = RX - MX;       // content width 1552

function chip(x: number, y: number, text: string, bg: number[], scale: number): number {
  const w = textW(text, scale) + 16;
  rect(x, y, w, scale === 2 ? 30 : 20, bg);
  drawText(x + 8, y + (scale === 2 ? 8 : 5), text, scale, C.white);
  return w;
}
function centerText(cx: number, y: number, text: string, scale: number, color: number[]): void {
  drawText(cx - Math.floor(textW(text, scale) / 2), y, text, scale, color);
}

// ---------------------------------------------------------------- header
function drawHeader(): void {
  drawText(MX, 14, "SATURDAY 21 NOVEMBER 2026", 2, C.ink);
  const ed = "EDITION 052 - ALL TIMES UTC";
  drawText(RX - textW(ed, 1), 18, ed, 1, [120, 120, 120]);
  drawText(MX, 42, "THE WORLD IN ONE DAY", 6, C.ink);
  // red 48 badge
  rect(1486, 30, 90, 90, C.red);
  drawText(1501, 44, "48", 5, C.white);
  drawText(1510, 94, "STORIES", 1, C.white);
  drawText(MX, 96, "48 STORIES - 13 ILLUSTRATED FEATURES - EVERY STORY FIRST REPORTED TODAY", 2, [90, 90, 90]);
  rect(MX, 122, CW, 4, C.ink);
}

// ---------------------------------------------------------------- status strip
function drawStatus(): void {
  const y = 132;
  rect(MX, y, CW, 46, [245, 240, 222]);
  drawText(MX + 12, y + 16, "STATUS AT PRESS TIME", 2, C.ink);
  let cx = MX + 280;
  cx += chip(cx, y + 8, "5 STILL MOVING", [217, 119, 6], 2) + 12;
  cx += chip(cx, y + 8, "8 SETTLED", C.green, 2) + 12;
  // segmented bar: 5 amber + 8 green
  const bx = 700, bw = RX - bx, seg = Math.floor(bw / 13);
  for (let i = 0; i < 13; i++) rect(bx + i * seg, y + 8, seg - 2, 24, i < 5 ? [217, 119, 6] : C.green);
  drawText(bx, y + 36, "EVERY FEATURE MARKED - AMBER IS STILL MOVING, GREEN IS SETTLED", 1, [90, 90, 90]);
}

// ---------------------------------------------------------------- KPI strip
function drawKPI(): void {
  const y = 178, h = 96;
  const kpis: [string, string, number[]][] = [
    ["48", "STORIES TODAY", C.ink],
    ["6.7", "PERU QUAKE MAGNITUDE", C.ink],
    ["-5.3%", "NASDAQ FALL", C.red],
    ["$58,311", "BITCOIN CLOSE", C.ink],
    ["3", "MISSILES DOWN OVER RIYADH", C.ink],
    ["14", "TANKERS AT KHARG", C.ink],
  ];
  const cw = CW / 6;
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(MX + i * cw);
    const w = Math.floor(cw);
    rect(x, y, w, h, i % 2 ? [247, 245, 238] : C.white);
    const [num, label, col] = kpis[i];
    centerText(x + Math.floor(w / 2), y + 14, num, 5, col);
    centerText(x + Math.floor(w / 2), y + 66, label, 1, [100, 100, 100]);
    if (i > 0) vline(x, y, y + h - 1, [220, 220, 215]);
  }
  hline(MX, RX - 1, y, C.ink); hline(MX, RX - 1, y + h - 1, C.ink);
}

// ---------------------------------------------------------------- timeline
function drawTimeline(): void {
  const y = 274;
  drawText(MX, y + 6, "THE DAY, BY THE CLOCK - ALL TIMES UTC", 2, C.ink);
  const nodes: [string, string, string][] = [
    ["00:09", "PERU QUAKE", "6.7"],
    ["01:17", "COP31 DRAFT", "DROPS FOSSIL FUELS"],
    ["01:53", "RIYADH ALERT", "MISSILES INBOUND"],
    ["04:20", "USSF-317", "LAUNCHES"],
    ["MORNING", "BRUSSELS DEALS", "UK-EU + CEPA"],
    ["EVENING", "US MARKETS", "CLOSE DOWN"],
    ["NIGHT", "WELLINGTON", "RAHUL 100 - VEGAS FP3"],
  ];
  const lineY = y + 44;
  hline(MX + 8, RX - 8, lineY, [150, 150, 145]);
  for (let i = 0; i < nodes.length; i++) {
    const nx = Math.floor(MX + 8 + (i * (CW - 16)) / (nodes.length - 1));
    circle(nx, lineY, 6, C.red);
    circle(nx, lineY, 3, C.white);
    const [t, l1, l2] = nodes[i];
    const clamp = (tx: number, w: number) => Math.max(MX, Math.min(RX - w, tx));
    centerText(nx, lineY - 20, t, 2, C.ink);
    drawText(clamp(nx - Math.floor(textW(l1, 1) / 2), textW(l1, 1)), lineY + 12, l1, 1, C.ink);
    drawText(clamp(nx - Math.floor(textW(l2, 1) / 2), textW(l2, 1)), lineY + 24, l2, 1, [100, 100, 100]);
  }
}

// ---------------------------------------------------------------- feature cards
function featureCard(f: Story, x: number, y: number, w: number, h: number, big: boolean): void {
  const sceneH = big ? 150 : 110;
  rect(x, y, w, h, C.white);
  SCENES[f.scene](x + 1, y + 1, w - 2, sceneH - 1);
  hline(x, x + w - 1, y, C.ink); hline(x, x + w - 1, y + h - 1, C.ink);
  vline(x, y, y + h - 1, C.ink); vline(x + w - 1, y, y + h - 1, C.ink);
  // number badge
  rect(x + 8, y + sceneH + 8, 26, 26, C.red);
  drawText(x + 8 + (f.n < 10 ? 8 : 4), y + sceneH + 14, String(f.n), 1, C.white);
  drawText(x + 42, y + sceneH + 16, f.region, 1, [110, 110, 110]);
  // status chip
  const ctext = f.status === "DEV" ? "DEVELOPING" : "SETTLED";
  const cw2 = textW(ctext, 1) + 12;
  rect(x + w - cw2 - 8, y + sceneH + 8, cw2, 18, f.status === "DEV" ? [217, 119, 6] : C.green);
  drawText(x + w - cw2 - 2, y + sceneH + 12, ctext, 1, C.white);
  // headline
  let ty = y + sceneH + 44;
  for (const ln of wrapText(f.headline, 2, w - 32)) { drawText(x + 16, ty, ln, 2, C.ink); ty += 16; }
  // summary, max 3 lines
  let sl = wrapText(f.summary, 1, w - 32);
  const more = sl.length > 3;
  sl = sl.slice(0, 3);
  if (more) sl[2] += " ...";
  for (const ln of sl) { drawText(x + 16, ty + 2, ln, 1, [60, 60, 60]); ty += 11; }
  // source
  const src = "SOURCE: " + f.source;
  drawText(x + w - textW(src, 1) - 10, y + h - 18, src, 1, [140, 140, 140]);
}
function drawFeatures(): void {
  const y0 = 354;
  // row 1: 3 big cards 496x300
  for (let i = 0; i < 3; i++) featureCard(FEATURES[i], MX + i * (496 + 32), y0, 496, 300, true);
  // rows 2-3: 5 medium cards 296x240
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 5; i++) {
      featureCard(FEATURES[3 + r * 5 + i], MX + i * (296 + 18), y0 + 314 + r * 254, 296, 240, false);
    }
  }
}

// ---------------------------------------------------------------- world map
function drawMap(): void {
  const y0 = 1178;
  drawText(MX, y0, "WHERE IT HAPPENED - 13 FEATURES, 13 PINS", 2, C.ink);
  const note = "PINS NUMBERED AS IN THE FEATURES ABOVE";
  drawText(RX - textW(note, 1), y0 + 4, note, 1, [120, 120, 120]);
  const my = y0 + 26, mh = 224;
  rect(MX, my, CW, mh, [190, 215, 230]);
  const px = (lon: number) => MX + ((lon + 180) / 360) * CW;
  const py = (lat: number) => my + ((90 - lat) / 150) * mh;
  const rxx = (d: number) => (d * CW) / 360;
  const ryy = (d: number) => (d * mh) / 150;
  // graticule
  for (let lon = -150; lon <= 150; lon += 30) vline(Math.round(px(lon)), my, my + mh - 1, [210, 228, 238]);
  for (let lat = 60; lat >= -30; lat -= 30) hline(MX, RX - 1, Math.round(py(lat)), [210, 228, 238]);
  // continents (ellipse unions)
  const land: [number, number, number, number][] = [
    [-100, 48, 28, 14], [-88, 32, 18, 10], [-82, 22, 10, 7], [-42, 74, 10, 5],
    [-60, -10, 14, 14], [-66, -28, 9, 12],
    [12, 52, 14, 8], [28, 58, 10, 6], [-2, 54, 4, 4],
    [16, 8, 16, 12], [24, -14, 13, 12], [42, 12, 8, 8],
    [70, 52, 30, 12], [105, 42, 22, 12], [122, 28, 12, 10], [138, 38, 8, 8],
    [100, 12, 10, 10], [78, 18, 8, 8], [134, -25, 16, 8],
  ];
  for (const [lon, lat, a, b] of land) ellipse(Math.round(px(lon)), Math.round(py(lat)), Math.round(rxx(a)), Math.round(ryy(b)), [205, 210, 185]);
  // region labels, set in the open water and land clear of the pins
  const mapLabel = (lon: number, lat: number, s: string) => {
    drawText(Math.round(px(lon)) - Math.floor(textW(s, 1) / 2), Math.round(py(lat)) - 3, s, 1, [110, 118, 102]);
  };
  mapLabel(-105, 58, "NORTH AMERICA");
  mapLabel(-62, -28, "SOUTH AMERICA");
  mapLabel(15, 63, "EUROPE");
  mapLabel(18, -8, "AFRICA");
  mapLabel(85, 62, "ASIA");
  mapLabel(134, -33, "AUSTRALIA");
  // pins
  const nudge: Record<number, [number, number]> = { 8: [26, 16], 12: [24, 18], 13: [28, -20] };
  for (const f of FEATURES) {
    const tx = Math.round(px(f.lon)), tyy = Math.round(py(f.lat));
    const [dx, dy] = nudge[f.n] || [0, 0];
    const cx = tx + dx, cy = tyy + dy;
    if (dx || dy) line(tx, tyy, cx, cy, C.ink);
    circle(cx, cy, 11, C.red);
    ring(cx, cy, 11, C.white);
    const ns = String(f.n);
    drawText(cx - Math.floor(textW(ns, 1) / 2), cy - 4, ns, 1, C.white);
  }
  hline(MX, RX - 1, my, C.ink); hline(MX, RX - 1, my + mh - 1, C.ink);
  vline(MX, my, my + mh - 1, C.ink); vline(RX - 1, my, my + mh - 1, C.ink);
}

// ---------------------------------------------------------------- full list
function drawList(): void {
  const y0 = 1444;
  drawText(MX, y0, "THE FULL LIST - STORIES 14-48", 2, C.ink);
  const note = "(1-13 FEATURED ABOVE)";
  drawText(RX - textW(note, 1), y0 + 4, note, 1, [120, 120, 120]);
  const colW = 764;
  const cols: [number, ListItem[]][] = [
    [MX, LIST.slice(0, 18)],
    [MX + 788, LIST.slice(18)],
  ];
  for (const [cx, items] of cols) {
    let ry = y0 + 30;
    for (const it of items) {
      drawText(cx, ry, String(it.n), 1, C.red);
      drawText(cx + 28, ry, it.region, 1, [120, 120, 120]);
      drawText(cx + 100, ry, it.text, 1, C.ink);
      const sw = textW(it.source, 1);
      drawText(cx + colW - sw, ry, it.source, 1, [140, 140, 140]);
      ry += 24;
    }
  }
}

// ---------------------------------------------------------------- footer
function drawFooter(): void {
  const y0 = 1916;
  hline(MX, RX - 1, y0, C.ink);
  drawText(MX, y0 + 10, "DATE-CHECKED - THESE WERE EXCLUDED AS NOT FROM 21 NOVEMBER:", 1, C.red);
  drawText(MX, y0 + 24, "POLAND MISSILE CRASH (20 NOV) - ICJ MYANMAR RULING (19 NOV) - DARAXONRASIB CANCER DATA (19 NOV) - PETE ROSE PARDON (19 NOV) - EU 1BN UKRAINE AID (20 NOV) - CYCLONE AKVAN (20 NOV) - TETHER 4BN USDT BURN (20 NOV) - SENATE IRAN VOTE (20 NOV)", 1, C.ink);
  drawText(MX, y0 + 40, "SOURCES: USGS, AP, REUTERS, CNBC, COINGLASS, GOV.UK, ANTARA, NASA, BBC, ELLIPTIC, TOI, TIMES OF ISRAEL, CRASH, PLANETF1, SPACEFLIGHT NOW, OBSERVER VOICE, VIRAL SA METRO, PUNCH, WH NEWS, JOY, COINBELL, VILKUL, ONE TURN, DAILY BRIEF, DAILY SHORT, NATION PRESS", 1, [90, 90, 90]);
  drawText(MX, y0 + 56, "ALL 48 STORIES FIRST REPORTED SATURDAY 21 NOVEMBER 2026 - RENDERED WITH NODE STDLIB ONLY - DETERMINISTIC, IDENTICAL ON EVERY RUN", 1, [90, 90, 90]);
  const pg = "PAGE 1 OF 1";
  drawText(RX - textW(pg, 1), y0 + 56, pg, 1, [120, 120, 120]);
}

// ---------------------------------------------------------------- main
function main(): void {
  rect(0, 0, W, H, [250, 248, 242]);
  drawHeader();
  drawStatus();
  drawKPI();
  drawTimeline();
  drawFeatures();
  drawMap();
  drawList();
  drawFooter();
  const out = process.argv[2] || "/output/entry.png";
  writePNG(out);
  console.log("wrote " + out);
}
main();
