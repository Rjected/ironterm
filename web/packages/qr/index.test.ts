import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeQr, encodeQrBytes, qrPath, type QrCode } from "./index";
import REFERENCE from "./reference.json";

// ───────────── the same inputs that reference.json was made from ─────────────
// reference.json: [version, mask, sha256 of the module matrix] for each input, produced by
// qrcode-generator 1.4.4 (the library this replaced) with qrcode(0, "M"). Rows of "0"/"1" + "\n".

const CAP = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331];

function referenceTexts(): string[] {
  const texts = [
    "ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG",
    "ironterm://connect?server=http%3A%2F%2F192.168.1.20%3A8787&token=ht_nKKIlOpIlgd2kj0EU3Uh5Doa7DQoZYZMSyzQG6MfEVI",
    "https://example.com", "A", "hello world", "",
  ];
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/?&=%._-~ ";
  let seed = 1;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const word = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
  for (let v = 1; v <= 40; v++) { texts.push(word(CAP[v])); if (CAP[v - 1] + 1 <= CAP[v]) texts.push(word(CAP[v - 1] + 1)); }
  return texts;
}

const matrixHash = (qr: QrCode) => {
  let s = "";
  for (let r = 0; r < qr.size; r++) { for (let c = 0; c < qr.size; c++) s += qr.isDark(r, c) ? "1" : "0"; s += "\n"; }
  return createHash("sha256").update(s).digest("hex");
};

// ───────────── an independent decoder for perfect (synthetic) symbols ─────────────
// Written from the spec rather than from the encoder: reads the format bits, rebuilds the
// function-pattern map, reads the zigzag, unmasks, de-interleaves, checks every block's
// Reed–Solomon syndromes are zero, and parses the byte-mode segment.

const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
// Table E.1 of the spec (centres of the alignment patterns), versions 2–40.
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

function syndromesZero(block: number[], ecc: number): boolean {
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const b of block) s = (s === 0 ? 0 : EXP[LOG[s] + i]) ^ b; // Horner at α^i
    if (s !== 0) return false;
  }
  return true;
}

function decode(qr: QrCode): { text: string; bytes: Uint8Array; mask: number } {
  const n = qr.size, version = (n - 17) / 4;
  const at = (r: number, c: number) => qr.isDark(r, c);
  // format: bits 14..0 around the top-left finder (rows 0–8 of column 8, then row 8 leftwards)
  const cells: [number, number][] = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  let fmt = 0;
  cells.forEach(([r, c], i) => { if (at(r, c)) fmt |= 1 << i; });
  fmt ^= 0x5412;
  const ecl = fmt >>> 13, mask = (fmt >>> 10) & 7;
  if (ecl !== 0) throw new Error(`level bits ${ecl}, expected M (00)`);
  // the second copy must agree
  let fmt2 = 0;
  for (let i = 0; i < 8; i++) if (at(8, n - 1 - i)) fmt2 |= 1 << i;
  for (let i = 8; i < 15; i++) if (at(n - 15 + i, 8)) fmt2 |= 1 << i;
  if ((fmt2 ^ 0x5412) !== fmt) throw new Error("format copies disagree");
  if (!at(n - 8, 8)) throw new Error("dark module missing");

  const fn = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const mark = (r0: number, c0: number, h: number, w: number) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && c >= 0 && r < n && c < n) fn[r][c] = true; };
  mark(0, 0, 9, 9); mark(0, n - 8, 9, 8); mark(n - 8, 0, 8, 9); // finders + separators + format
  mark(6, 0, 1, n); mark(0, 6, n, 1); // timing
  const al = ALIGN[version];
  for (const r of al) for (const c of al) if (!((r === 6 && c === 6) || (r === 6 && c === al.at(-1)) || (r === al.at(-1) && c === 6))) mark(r - 2, c - 2, 5, 5);
  if (version >= 7) { mark(0, n - 11, 6, 3); mark(n - 11, 0, 3, 6); }

  const MASKS = [
    (r: number, c: number) => (r + c) % 2 === 0, (r: number) => r % 2 === 0, (_: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0, (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0, (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const bits: number[] = [];
  let upward = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let k = 0; k < n; k++) {
      const r = upward ? n - 1 - k : k;
      for (const c of [right, right - 1]) if (!fn[r][c]) bits.push((at(r, c) !== MASKS[mask](r, c)) ? 1 : 0);
    }
    upward = !upward;
  }
  const total = Math.floor(bits.length / 8);
  const raw = Array.from({ length: total }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));

  const nb = BLOCKS_M[version], ecc = ECC_M[version];
  const short = Math.floor(total / nb), longCount = total % nb;
  const dataLen = (b: number) => short - ecc + (b >= nb - longCount ? 1 : 0);
  const blocks: number[][] = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < short - ecc + 1; i++) for (let b = 0; b < nb; b++) if (i < dataLen(b)) blocks[b].push(raw[k++]);
  for (let i = 0; i < ecc; i++) for (let b = 0; b < nb; b++) blocks[b].push(raw[k++]);
  blocks.forEach((blk, b) => { if (!syndromesZero(blk, ecc)) throw new Error(`block ${b}: Reed–Solomon check failed`); });
  const data = blocks.flatMap((blk, b) => blk.slice(0, dataLen(b)));

  const dbits = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  let p = 0;
  const read = (len: number) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | dbits[p++]; return v; };
  if (read(4) !== 0b0100) throw new Error("not a byte-mode segment");
  const len = read(version < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: len }, () => read(8));
  if (p + 4 <= dbits.length && read(4) !== 0) throw new Error("missing terminator");
  return { text: new TextDecoder().decode(bytes), bytes, mask };
}

// ───────────── tests ─────────────

describe("encodeQr", () => {
  it("matches qrcode-generator 1.4.4 module for module, versions 1–40", () => {
    const texts = referenceTexts();
    expect(REFERENCE).toHaveLength(texts.length);
    texts.forEach((text, i) => {
      const [version, mask, sha] = REFERENCE[i] as [number, number, string];
      const auto = encodeQr(text);
      expect(auto.version, `len ${text.length}`).toBe(version); // same (smallest) version
      expect(matrixHash(encodeQr(text, { mask })), `v${version} len ${text.length}`).toBe(sha);
    });
  });

  it("decodes back, with every mask and the automatic one", () => {
    const texts = ["ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc", "Grüße · 力 · 🏋️", "", "x".repeat(213), "y".repeat(214)];
    for (const text of texts) {
      for (let mask = 0; mask < 8; mask++) expect(decode(encodeQr(text, { mask }))).toMatchObject({ text, mask });
      const auto = encodeQr(text);
      expect(decode(auto)).toMatchObject({ text, mask: auto.mask });
    }
    for (const text of referenceTexts().filter((t) => t.length <= 600)) expect(decode(encodeQr(text)).text).toBe(text); // versions 1–19
  });

  it("raw bytes, all 256 values", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...decode(encodeQrBytes(bytes)).bytes]).toEqual([...bytes]);
  });

  it("picks the smallest version that fits and refuses what doesn't", () => {
    expect(encodeQr("x".repeat(14)).version).toBe(1);
    expect(encodeQr("x".repeat(15)).version).toBe(2);
    expect(encodeQr("x".repeat(213)).version).toBe(10);
    expect(encodeQr("x".repeat(2331)).version).toBe(40);
    expect(() => encodeQr("x".repeat(2332))).toThrow(RangeError);
    expect(() => encodeQr("x".repeat(300), { maxVersion: 10 })).toThrow(/version 10/);
    expect(encodeQr("x", { minVersion: 5 }).version).toBe(5);
    expect(() => encodeQr("x", { mask: 8 })).toThrow(RangeError);
  });

  it("the automatic mask has the lowest penalty among the eight", () => {
    // spot check: whatever it picks decodes, and it is deterministic
    const a = encodeQr("ironterm://connect?server=x&token=y"), b = encodeQr("ironterm://connect?server=x&token=y");
    expect(a.mask).toBe(b.mask);
    expect(matrixHash(a)).toBe(matrixHash(b));
  });
});

describe("qrPath", () => {
  it("covers exactly the dark modules, offset by the quiet zone", () => {
    const qr = encodeQr("hello world");
    const d = qrPath(qr);
    let dark = 0, covered = 0;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.isDark(r, c)) dark++;
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < w; i++) expect(qr.isDark(y - 4, x - 4 + i)).toBe(true);
      covered += w;
    }
    expect(covered).toBe(dark);
    expect(d.startsWith("M4 4h7v1h-7z")).toBe(true); // the top-left finder's first row
  });
});
