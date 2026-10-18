// WHOOP v2 integration: OAuth (with refresh), sync of workouts / recovery / body, signed webhooks.
// Docs: developer.whoop.com (OAuth, webhooks, pagination). Needs WHOOP_CLIENT_ID / _SECRET and
// the app's /api/whoop/callback registered as a redirect URL in the WHOOP developer dashboard.

import type { WhoopBody, WhoopData, WhoopRecovery, WhoopWorkout } from "../shared/whoop";
import { kvGet, kvPut } from "./store";

const AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";
const SCOPES = "offline read:workout read:recovery read:sleep read:cycles read:profile read:body_measurement";

interface Tokens { access: string; refresh: string; expires: number }
export interface WhoopEnv { DB: D1Database; WHOOP_CLIENT_ID?: string; WHOOP_CLIENT_SECRET?: string }

export const whoopConfigured = (env: WhoopEnv) => !!(env.WHOOP_CLIENT_ID && env.WHOOP_CLIENT_SECRET);

export function ensureWhoopSchema(db: D1Database) {
  return db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS whoop (id TEXT PRIMARY KEY, kind TEXT NOT NULL, start TEXT NOT NULL, json TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS whoop_kind_start ON whoop(kind, start)"),
  ]);
}

export async function authUrl(env: WhoopEnv, origin: string): Promise<string> {
  // WHOOP wants an 8-character state.
  const state = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  await kvPut(env.DB, "whoop:state", state);
  const q = new URLSearchParams({ response_type: "code", client_id: env.WHOOP_CLIENT_ID!, redirect_uri: `${origin}/api/whoop/callback`, scope: SCOPES, state });
  return `${AUTH}?${q}`;
}

async function tokenRequest(env: WhoopEnv, body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.WHOOP_CLIENT_ID!, client_secret: env.WHOOP_CLIENT_SECRET!, ...body }) });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`WHOOP token error ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const t = { access: j.access_token, refresh: j.refresh_token ?? "", expires: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 };
  await kvPut(env.DB, "whoop:tokens", t);
  return t;
}

export async function handleCallback(env: WhoopEnv, url: URL): Promise<void> {
  const state = await kvGet<string>(env.DB, "whoop:state");
  if (!state || url.searchParams.get("state") !== state) throw new Error("WHOOP state mismatch — try connecting again.");
  await kvPut(env.DB, "whoop:state", null);
  const code = url.searchParams.get("code");
  if (!code) throw new Error(url.searchParams.get("error_description") ?? "WHOOP didn't return a code.");
  await tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: `${url.origin}/api/whoop/callback` });
}

async function access(env: WhoopEnv): Promise<string | null> {
  const t = await kvGet<Tokens>(env.DB, "whoop:tokens");
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  // Refreshing invalidates the old refresh token, so the new pair is stored immediately.
  return (await tokenRequest(env, { grant_type: "refresh_token", refresh_token: t.refresh, scope: "offline" })).access;
}

async function get<T>(env: WhoopEnv, path: string): Promise<T> {
  const tok = await access(env);
  if (!tok) throw new Error("WHOOP not connected");
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${tok}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`WHOOP ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function collection<T>(env: WhoopEnv, path: string, start: string, maxPages = 40): Promise<T[]> {
  const out: T[] = [];
  let next = "";
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ limit: "25", start });
    if (next) q.set("nextToken", next);
    const r = await get<{ records: T[]; next_token?: string | null }>(env, `${path}?${q}`);
    out.push(...r.records);
    if (!r.next_token) break;
    next = r.next_token;
  }
  return out;
}

const workout = (r: any): WhoopWorkout => ({
  id: String(r.id), start: r.start, end: r.end, sport: r.sport_name ?? String(r.sport_id ?? "activity"),
  strain: r.score?.strain, avgHr: r.score?.average_heart_rate, maxHr: r.score?.max_heart_rate, kj: r.score?.kilojoule,
  distanceM: r.score?.distance_meter ?? undefined,
  zones: r.score?.zone_durations ? ["zero", "one", "two", "three", "four", "five"].map((z) => r.score.zone_durations[`zone_${z}_milli`] ?? 0) : undefined,
});

const recovery = (r: any, date: string): WhoopRecovery => ({
  date, score: r.score?.recovery_score, hrv: r.score?.hrv_rmssd_milli, rhr: r.score?.resting_heart_rate, spo2: r.score?.spo2_percentage,
});

async function put(db: D1Database, kind: string, id: string, start: string, v: unknown) {
  await db.prepare("INSERT INTO whoop (id, kind, start, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET start = excluded.start, json = excluded.json").bind(`${kind}:${id}`, kind, start, JSON.stringify(v)).run();
}

const localDay = (iso: string, tz: string) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)) : "");

export async function syncWhoop(env: WhoopEnv, days = 30, tz = "America/New_York"): Promise<{ workouts: number; recoveries: number }> {
  const start = new Date(Date.now() - days * 864e5).toISOString();
  const ws = await collection<any>(env, "/activity/workout", start);
  for (const r of ws) await put(env.DB, "workout", String(r.id), r.start, workout(r));
  const recs = await collection<any>(env, "/recovery", start);
  // Recovery belongs to a sleep/cycle; date it by the cycle's start.
  for (const r of recs) await put(env.DB, "recovery", String(r.cycle_id ?? r.sleep_id), r.created_at ?? start, recovery(r, localDay(String(r.created_at ?? ""), tz)));
  try {
    const b = await get<any>(env, "/user/measurement/body");
    await kvPut(env.DB, "whoop:body", { weightKg: b.weight_kilogram, heightM: b.height_meter, maxHr: b.max_heart_rate } satisfies WhoopBody);
  } catch { /* scope may be missing */ }
  await kvPut(env.DB, "whoop:synced", new Date().toISOString());
  return { workouts: ws.length, recoveries: recs.length };
}

/** base64(HMAC-SHA256(timestamp + rawBody, client secret)) — constant-time compare. */
export async function verifyWebhook(env: WhoopEnv, req: Request, raw: string): Promise<boolean> {
  const sig = req.headers.get("x-whoop-signature"), ts = req.headers.get("x-whoop-signature-timestamp");
  if (!sig || !ts || !env.WHOOP_CLIENT_SECRET) return false;
  // Milliseconds since the epoch. A non-number made the window check NaN > x, i.e. false: no window.
  if (!/^\d{1,15}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 15 * 60_000) return false; // stale replay
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHOOP_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + raw)))));
  if (mac.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < mac.length; i++) d |= mac.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

export async function handleWebhookEvent(env: WhoopEnv, ev: { id: string | number; type: string }) {
  const id = String(ev.id);
  if (ev.type === "workout.deleted") return env.DB.prepare("DELETE FROM whoop WHERE id = ?").bind(`workout:${id}`).run();
  if (ev.type === "workout.updated") {
    const r = await get<any>(env, `/activity/workout/${id}`);
    return put(env.DB, "workout", id, r.start, workout(r));
  }
  // Recovery events carry the sleep id; a short resync is simpler than chasing ids.
  if (ev.type.startsWith("recovery") || ev.type.startsWith("sleep")) return syncWhoop(env, 3);
}

export async function whoopData(env: WhoopEnv, sinceDays = 800): Promise<WhoopData> {
  const configured = whoopConfigured(env);
  const tokens = await kvGet<Tokens>(env.DB, "whoop:tokens");
  if (!configured || !tokens) return { connected: false, configured, workouts: [], recoveries: [] };
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  const rows = (await env.DB.prepare("SELECT kind, json FROM whoop WHERE start >= ? ORDER BY start").bind(since).all<{ kind: string; json: string }>()).results;
  return {
    connected: true, configured,
    workouts: rows.filter((r) => r.kind === "workout").map((r) => JSON.parse(r.json)),
    recoveries: rows.filter((r) => r.kind === "recovery").map((r) => JSON.parse(r.json)),
    body: (await kvGet<WhoopBody>(env.DB, "whoop:body")) ?? undefined,
    syncedAt: (await kvGet<string>(env.DB, "whoop:synced")) ?? undefined,
  };
}

export async function disconnect(env: WhoopEnv) {
  try {
    const tok = await access(env);
    if (tok) await fetch(`${API}/user/access`, { method: "DELETE", headers: { authorization: `Bearer ${tok}` } });
  } catch { /* already gone */ }
  await kvPut(env.DB, "whoop:tokens", null);
}
