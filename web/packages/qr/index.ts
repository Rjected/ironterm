// QR code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1–40, automatic
// mask choice. Replaces qrcode-generator for the app-token QR in SETUP. No dependencies.
//
//   const qr = encodeQr("ironterm://connect?…");
//   qr.size; qr.isDark(row, col)

// Error correction level M: codewords per block and number of blocks, by version (index 0 unused).
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
/** Format-information bits for level M. */
const ECL_BITS_M = 0;

export interface QrCode {
  version: number;
  mask: number;
  /** modules per side (without the quiet zone) */
  size: number;
  isDark(row: number, col: number): boolean;
}

export interface QrOptions {
  /** Force a mask pattern 0–7 (default: the one with the lowest penalty, as the spec says). */
  mask?: number;
  minVersion?: number;
  maxVersion?: number;
}

/** Encodes [text] as UTF-8 bytes. Throws if it doesn't fit in [maxVersion]. */
export function encodeQr(text: string, opts: QrOptions = {}): QrCode {
  return encodeQrBytes(new TextEncoder().encode(text), opts);
}

export function encodeQrBytes(data: Uint8Array, opts: QrOptions = {}): QrCode {
  const minV = opts.minVersion ?? 1, maxV = opts.maxVersion ?? 40;
  let version = minV;
  for (; ; version++) {
    if (version > maxV) throw new RangeError(`${data.length} bytes don't fit in a version ${maxV} QR code (level M)`);
    if (4 + countBits(version) + data.length * 8 <= dataCodewords(version) * 8) break;
  }

  // segment: mode 0100 (byte), length, data; then terminator, byte alignment and pad bytes
  const bits: number[] = [];
  const put = (value: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(data.length, countBits(version));
  for (const b of data) put(b, 8);
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const codewords = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) codewords[i >>> 3] |= bits[i] << (7 - (i & 7));

  const m = new Matrix(version);
  m.drawFunctionPatterns();
  m.drawCodewords(addEccAndInterleave(codewords, version));

  let mask = opts.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      m.applyMask(k);
      m.drawFormatBits(k);
      const p = m.penalty();
      if (p < best) { best = p; mask = k; }
      m.applyMask(k); // XOR again undoes it
    }
  }
  if (mask < 0 || mask > 7) throw new RangeError("mask must be 0–7");
  m.applyMask(mask);
  m.drawFormatBits(mask);
  const { size, modules } = m;
  return { version, mask, size, isDark: (r, c) => r >= 0 && c >= 0 && r < size && c < size && modules[r][c] };
}

/** Character-count bits for byte mode. */
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** Data + ECC modules available, after the function patterns (Nayuki's formula). */
function rawDataModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (version: number) => Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * NUM_BLOCKS[version];

// ───────────────────────────── Reed–Solomon over GF(256), x⁸+x⁴+x³+x²+1 ─────────────────────────────

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Generator polynomial (without the leading 1) with roots α⁰ … α^(degree−1). */
function rsDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

/** Splits into blocks, appends each block's ECC, and interleaves (short blocks first). */
function addEccAndInterleave(data: Uint8Array, version: number): Uint8Array {
  const numBlocks = NUM_BLOCKS[version], eccLen = ECC_PER_BLOCK[version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    blocks.push({ data: d, ecc: rsRemainder(d, divisor) });
  }
  const out: number[] = [];
  for (let i = 0; i <= shortLen - eccLen; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return Uint8Array.from(out);
}

// ───────────────────────────── module matrix ─────────────────────────────

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly fixed: boolean[][];
  readonly version: number;

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false));
  }

  private set(row: number, col: number, dark: boolean) {
    this.modules[row][col] = dark;
    this.fixed[row][col] = true;
  }

  drawFunctionPatterns() {
    const n = this.size;
    for (let i = 0; i < n; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); } // timing
    this.finder(3, 3); this.finder(3, n - 4); this.finder(n - 4, 3);
    const align = alignmentPositions(this.version);
    for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0);
      if (!corner) this.alignment(align[i], align[j]);
    }
    this.drawFormatBits(0); // reserve; overwritten once the mask is known
    this.drawVersion();
  }

  private finder(cr: number, cc: number) {
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const r = cr + dr, c = cc + dc;
      if (r < 0 || c < 0 || r >= this.size || c >= this.size) continue;
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      this.set(r, c, d !== 2 && d !== 4); // 3×3 core, light ring, dark ring, light separator
    }
  }

  private alignment(cr: number, cc: number) {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) this.set(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }

  drawFormatBits(mask: number) {
    const data = (ECL_BITS_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    const n = this.size;
    // around the top-left finder
    for (let i = 0; i <= 5; i++) this.set(i, 8, bit(i));
    this.set(7, 8, bit(6));
    this.set(8, 8, bit(7));
    this.set(8, 7, bit(8));
    for (let i = 9; i < 15; i++) this.set(8, 14 - i, bit(i));
    // the copy split between the other two finders
    for (let i = 0; i < 8; i++) this.set(8, n - 1 - i, bit(i));
    for (let i = 8; i < 15; i++) this.set(n - 15 + i, 8, bit(i));
    this.set(n - 8, 8, true); // the always-dark module
  }

  private drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3), b = Math.floor(i / 3);
      this.set(b, a, dark);
      this.set(a, b, dark);
    }
  }

  /** Data bits in the two-column zigzag, right to left, skipping function modules. */
  drawCodewords(data: Uint8Array) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const col = right - j;
          const upward = ((right + 1) & 2) === 0;
          const row = upward ? n - 1 - vert : vert;
          if (!this.fixed[row][col] && i < data.length * 8) {
            this.modules[row][col] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  /** XORs the mask over the data modules (applying it twice undoes it). */
  applyMask(mask: number) {
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      if (!this.fixed[r][c] && maskBit(mask, r, c)) this.modules[r][c] = !this.modules[r][c];
    }
  }

  /** The spec's mask penalty (N1 runs, N2 2×2 blocks, N3 finder-like patterns, N4 balance). */
  penalty(): number {
    const n = this.size, m = this.modules;
    let score = 0;
    const line = (get: (i: number) => boolean) => {
      // N1: runs of 5+ of one colour
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && get(i) === get(i - 1)) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      // N3: 1:1:3:1:1 dark–light with 4 light modules on one side (outside the symbol counts as light)
      const at = (i: number) => i >= 0 && i < n && get(i);
      for (let i = -4; i < n; i++) {
        if (at(i) || at(i + 1) || at(i + 2) || at(i + 3)) {
          // pattern dark-light-dark×3-light-dark followed by 4 light
          if (!(at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6))) continue;
          const before = !at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4);
          const after = !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10);
          if (before || after) score += 40;
        }
      }
    };
    for (let r = 0; r < n; r++) line((i) => m[r][i]);
    for (let c = 0; c < n; c++) line((i) => m[i][c]);
    // N2: 2×2 blocks of one colour
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    // N4: how far the dark share is from 50 %, in 5 % steps
    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    const total = n * n;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: throw new RangeError("mask must be 0–7");
  }
}

/** Centre rows/columns of the alignment patterns. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = version * 4 + 17 - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** SVG path data for the dark modules, offset by a [quiet]-module border. */
export function qrPath(qr: QrCode, quiet = 4): string {
  let d = "";
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.isDark(r, c)) continue;
      // one horizontal run per path command keeps the path short
      let end = c;
      while (end + 1 < qr.size && qr.isDark(r, end + 1)) end++;
      d += `M${c + quiet} ${r + quiet}h${end - c + 1}v1h${-(end - c + 1)}z`;
      c = end;
    }
  }
  return d;
}
