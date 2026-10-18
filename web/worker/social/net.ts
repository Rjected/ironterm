// Outgoing calls: other servers' .well-known, signed requests, the directory.

import { identity } from "./db";
import { normOrigin, SIG_HEADER, signRequest } from "./sign";
import type { WellKnown } from "./types";

export const TIMEOUT_MS = 4000;

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
    return await Promise.race([fetch(url, { ...init, signal: ac.signal, redirect: "manual" }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWellKnown(origin: string): Promise<WellKnown> {
  let r: Response;
  try { r = await timedFetch(`${origin}/.well-known/ironterm`, { headers: { accept: "application/json" } }); }
  catch (e) { throw e instanceof PeerError ? e : new PeerError(`couldn't reach ${origin}`); }
  if (!r.ok) throw new PeerError(`${origin} isn't an Ironterm server (${r.status})`);
  const w = (await r.json().catch(() => null)) as WellKnown | null;
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
  return (await r.json()) as DirectoryUser;
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
