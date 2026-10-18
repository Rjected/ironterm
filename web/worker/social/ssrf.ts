// Which addresses a self-hosted server must never fetch on a peer's say-so. Friend servers and
// directories are URLs strangers hand us (an unsigned friend request makes us fetch its
// .well-known), so without this a self-hosted box could be used to probe its own LAN, loopback
// services or a cloud metadata endpoint. Pure functions; server/peerfetch.ts applies them to every
// resolved address (which also defeats DNS rebinding: the checked address is the one connected to).

/** a.b.c.d → 32-bit number, or null when it isn't a dotted IPv4 address. */
function v4(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4Private(n: number): boolean {
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4(base)! & mask) >>> 0);
  });
}

/** IPv6 text → 8 16-bit groups, or null. Handles "::" and a trailing dotted IPv4 part. */
function v6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    // trailing dotted IPv4 ("::ffff:1.2.3.4") → two hex groups
    const n = v4(maybeV4);
    if (n == null) return null;
    s = `${s.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h ? h.split(":") : []).map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  let groups = head;
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array<number>(fill).fill(0), ...rest];
  }
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  return groups;
}

/**
 * True for loopback, private, link-local, CGNAT, unique-local, multicast, documentation and other
 * non-public addresses, including IPv4 hidden inside IPv6 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::/96,
 * 2002::/16). Anything that doesn't parse as an IP counts as private (fail closed).
 */
export function isPrivateAddress(ip: string): boolean {
  const n4 = v4(ip);
  if (n4 != null) return v4Private(n4);
  const g = v6(ip);
  if (!g) return true;
  const embedded = (hi: number, lo: number) => v4Private(((hi << 16) >>> 0) + lo);
  if (g.slice(0, 7).every((x) => x === 0)) return true; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return embedded(g[6], g[7]); // mapped / compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard-only
  return false;
}

/** For a URL's hostname: a literal IP (v4 or [v6]) → whether it's private; a name → null (resolve it first). */
export function literalHostPrivate(hostname: string): boolean | null {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (v4(h) != null || h.startsWith("[") || h.includes(":")) return isPrivateAddress(h);
  // Bare numbers and other forms WHATWG URL would already have normalized to dotted IPv4.
  return null;
}
