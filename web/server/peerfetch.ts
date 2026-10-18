// fetch for server-to-server social calls on a self-hosted box: refuses private, loopback and
// link-local destinations (worker/social/ssrf.ts). The check runs inside the socket's DNS lookup,
// so the address that's checked is the address that's connected to: a hostname that resolves to a
// public address for the check and 127.0.0.1 for the connection (DNS rebinding) can't slip by.
// Never follows redirects (the social code asks for redirect: "manual" anyway).
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { isPrivateAddress, literalHostPrivate } from "../worker/social/ssrf";

export class BlockedAddressError extends TypeError {
  constructor(host: string) { super(`${host} is a private or local address`); }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that fails when any resolved address is private. */
export function guardedLookup(hostname: string, options: { all?: boolean; family?: number }, cb: LookupCb) {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs: LookupAddress[]) => {
    if (err) return cb(err, []);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(new BlockedAddressError(hostname), []);
    if (options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

export async function peerFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const req = new Request(input as RequestInfo, init);
  const url = new URL(req.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError(`unsupported protocol ${url.protocol}`);
  if (literalHostPrivate(url.hostname)) throw new BlockedAddressError(url.hostname);
  const body = req.body ? Buffer.from(await req.arrayBuffer()) : undefined;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  if (body) headers["content-length"] = String(body.length);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const r = send(url, { method: req.method, headers, lookup: guardedLookup as never, signal: init.signal ?? undefined }, (res: IncomingMessage) => {
      const h = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v != null) for (const x of Array.isArray(v) ? v : [v]) h.append(k, x);
      const status = res.statusCode ?? 502;
      const nullBody = status === 204 || status === 304 || req.method === "HEAD";
      if (nullBody) res.resume();
      resolve(new Response(nullBody ? null : (Readable.toWeb(res) as ReadableStream), { status, headers: h }));
    });
    r.on("error", reject);
    r.end(body);
  });
}
