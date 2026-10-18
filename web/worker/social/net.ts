// Outgoing calls: other servers' .well-known, signed requests, the directory.

import { identity } from "./db";
import { normOrigin, SIG_HEADER, signRequest } from "./sign";
import type { WellKnown } from "./types";

export const TIMEOUT_MS = 4000;
/** Largest peer response we'll read: a 100-item feed page or a profile is well under 100 KB. */
export const MAX_RESPONSE = 1_000_000;
/** .well-known, directory lookups and error bodies */
export const MAX_SMALL = 64_000;

// The fetch used for every peer and directory call. The self-hosted server swaps in one that
// refuses private addresses (server/peerfetch.ts); Workers can't reach private networks anyway.
let peerFetchImpl: typeof fetch | null = null;
export function setPeerFetch(f: typeof fetch | null) { peerFetchImpl = f; }

export interface SocialEnv {
  DB: D1Database;
  /** directory base URL, e.g. https://directory.example.com (no built-in default) */
  SOCIAL_DIRECTORY?: string;
  /** "1": allow http:// origins (local testing only) */
  SOCIAL_ALLOW_HTTP?: string;
  /** canonical origin override when the request URL isn't the public one */
  SOCIAL_ORIGIN?: string;
}

export const allowHttp = (env: SocialEnv) => env.SOCIAL_ALLOW_HTTP === "1" || env.SOCIAL_ALLOW_HTTP === "true";
export const directoryOf = (env: SocialEnv) => (env.SOCIAL_DIRECTORY ? normOrigin(env.SOCIAL_DIRECTORY, allowHttp(env)) ?? env.SOCIAL_DIRECTORY.replace(/\/+$/, "") : null);

export class PeerError extends Error {
  constructor(msg: string, public status = 502) { super(msg); }
}

/** fetch with a hard deadline (also when the underlying fetch ignores the abort signal). */
export async function timedFetch(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new PeerError(`timed out after ${ms / 1000}s`, 504)); }, ms); });
  try {
    return await Promise.race([(peerFetchImpl ?? fetch)(url, { ...init, signal: ac.signal, redirect: "manual" }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Body text of a response (or request), refusing to read past `max` bytes whatever Content-Length claims. */
export async function readLimited(r: Pick<Response, "headers" | "body">, max = MAX_RESPONSE): Promise<string> {
  if (Number(r.headers.get("content-length") ?? 0) > max) { await r.body?.cancel().catch(() => {}); throw new PeerError("response too large"); }
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); throw new PeerError("response too large"); }
    chunks.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** JSON body within `max` bytes; null when it's too large or not JSON. */
export async function peerJson<T>(r: Response, max = MAX_RESPONSE): Promise<T | null> {
  try { return JSON.parse(await readLimited(r, max)) as T; } catch { return null; }
}

export async function fetchWellKnown(origin: string): Promise<WellKnown> {
  let r: Response;
  try { r = await timedFetch(`${origin}/.well-known/ironterm`, { headers: { accept: "application/json" } }); }
  catch (e) { throw e instanceof PeerError ? e : new PeerError(`couldn't reach ${origin}`); }
  if (!r.ok) throw new PeerError(`${origin} isn't an Ironterm server (${r.status})`);
  const w = await peerJson<WellKnown>(r, MAX_SMALL);
  if (!w || w.software !== "ironterm" || typeof w.publicKey !== "string") throw new PeerError(`${origin} isn't an Ironterm server`);
  if (w.server !== origin) throw new PeerError(`${origin} says its address is ${w.server}`);
  return w;
}

export interface DirectoryUser { handle: string; name: string | null; server: string; publicKey: string; updatedAt: string }

export async function directoryUser(directory: string, handle: string): Promise<DirectoryUser | null> {
  let r: Response;
  try { r = await timedFetch(`${directory}/v1/users/${encodeURIComponent(handle)}`); }
  catch { throw new PeerError("couldn't reach the directory"); }
  if (r.status === 404) return null;
  if (!r.ok) throw new PeerError(`directory error (${r.status})`);
  const u = await peerJson<DirectoryUser>(r, MAX_SMALL);
  if (!u || typeof u.server !== "string" || typeof u.publicKey !== "string") throw new PeerError("bad directory response");
  return u;
}

/** A request signed with this server's key. */
export async function signedFetch(db: D1Database, self: string, url: string, method = "GET", body?: unknown): Promise<Response> {
  const { key } = await identity(db);
  const text = body === undefined ? "" : JSON.stringify(body);
  const sig = await signRequest({ key, server: self, method, url, body: text });
  const headers: Record<string, string> = { [SIG_HEADER]: sig, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    return await timedFetch(url, { method, headers, body: body === undefined ? undefined : text });
  } catch (e) {
    throw e instanceof PeerError ? e : new PeerError(`couldn't reach ${new URL(url).origin}`);
  }
}
