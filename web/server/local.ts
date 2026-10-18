// "Is this request from this machine?" for the no-login mode of the self-hosted server.
//
// A loopback socket isn't enough: a web page can point its own hostname at 127.0.0.1 (DNS
// rebinding) and then talk to this server from the owner's browser as "same origin". Such a request
// carries the attacker's hostname in Host, and it can add any non-forbidden header it likes,
// X-Forwarded-Host included. So: loopback socket, no proxy headers at all, and a loopback Host.

export interface LocalReq {
  socket: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

const LOOPBACK_ADDR = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOST = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PROXY_HEADERS = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded"];

/** Hostname part of a Host header ("localhost:8787" → "localhost", "[::1]:80" → "[::1]"). */
export function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

export function isLocal(req: LocalReq): boolean {
  if (!LOOPBACK_ADDR.has(req.socket.remoteAddress ?? "")) return false;
  if (PROXY_HEADERS.some((h) => req.headers[h] != null)) return false;
  const host = req.headers.host;
  return typeof host === "string" && LOOPBACK_HOST.has(hostName(host));
}
