import { demoData } from "../shared/demo";
import type { ProgramConfig } from "../shared/program";
import { clearCookie, csrfBlock, isAuthed, safeEqual, sessionCookie, verifyAccess } from "./auth";
import { snapshot } from "../shared/snapshot";
import { finishPRs, appBody, appCalendar, appGym, appHistory, appHome, appInsights, appLift, appLifts, appProgram, appProgramDetail, appPrograms, appStats, appWorkout, startProgram, startSession } from "../shared/appapi";
import type { Bootstrap } from "../src/api";
import { bearer, checkToken, createToken, listTokens, revokeToken } from "./tokens";
import { clearFlowCookie, handleCallback as googleCallback, loginRedirect, type GoogleConfig } from "./google";
import { Hevy, HevyError } from "./hevy";
import { applyNotes, toHevyUpdate, type NotesEdit } from "../shared/notes";
import { authUrl, disconnect, ensureWhoopSchema, handleCallback, handleWebhookEvent, syncWhoop, verifyWebhook, whoopConfigured, whoopData } from "./whoop";
import { allWorkouts, ensureSchema, kvGet, kvPut, upsertWorkouts, workoutCount, workoutJson } from "./store";
import { parseStrong, StrongError } from "../shared/strong";
import { finishLive, getTemplates, pushRoutines, pushSessions, sync, syncOne, type SyncState } from "./sync";
import type { PlannedSession } from "../shared/program";
import type { Trip } from "../shared/travel";
import { toStoredWorkout, type LiveSession } from "../shared/live";
import { localTemplateId } from "../shared/lifts";
import type { HevyWorkout } from "../shared/hevy";
import { ensureSocialSchema, handleOwner, handlePeer, isPeerPath, socialOrigin, type SocialCtx } from "./social";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  HEVY_API_KEY?: string;
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
  WEBHOOK_SECRET?: string;
  TIMEZONE?: string;
  /** Cloudflare Access: e.g. "yourteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application audience tag */
  ACCESS_AUD?: string;
  /** comma-separated emails allowed through, e.g. "you@example.com" */
  ALLOWED_EMAILS?: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  /** Google OAuth client for the app's own sign-in (used when the app is on your own domain) */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** social: directory base URL (no default; friends by server URL work without one) */
  SOCIAL_DIRECTORY?: string;
  /** social: "1" allows http:// peers (local testing only) */
  SOCIAL_ALLOW_HTTP?: string;
  /** social: this server's public origin, when the request URL isn't it */
  SOCIAL_ORIGIN?: string;
}

export interface Settings {
  unit: "lb" | "kg";
  tz: string;
  /** Re-push routines to Hevy after each synced workout. */
  autoPush: boolean;
  graphMetric: "volume" | "sets" | "duration";
  /** in `unit`; overrides Hevy / WHOOP bodyweight */
  bodyweight?: number;
  sex?: "male" | "female";
  distUnit?: "mi" | "km";
  /** training weekdays, 0 = Monday */
  trainingDays?: number[];
  /** ramp back in after breaks (default on) */
  reentry?: boolean;
}

/** Strong exports run ~1 MB per 1,000 workouts; this leaves years of headroom. */
const MAX_IMPORT = 50_000_000;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...init.headers } });

export type Mode = "demo" | "live" | "local";

/**
 * live: a Hevy key is set, Hevy is the source of truth.
 * local: no key, but real workouts are here (a Strong import, sessions logged in GYM) or the
 *        owner chose "start fresh". Ironterm is the source of truth.
 * demo: neither; generated data, nothing real is touched.
 */
async function mode(env: Env): Promise<Mode> {
  if (env.HEVY_API_KEY) return "live";
  if ((await kvGet<string>(env.DB, "mode")) === "local") return "local";
  return (await workoutCount(env.DB)) > 0 ? "local" : "demo";
}
// Demo mode keeps its own settings so trying things out never touches real config.
const k = (m: Mode, key: string) => (m === "demo" ? `demo:${key}` : key);
const NO_HEVY: Record<Mode, string> = {
  demo: "Demo mode: add HEVY_API_KEY to",
  local: "No Hevy connected (local mode). Set HEVY_API_KEY to",
  live: "",
};

async function settings(env: Env, m: Mode): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>(env.DB, k(m, "settings"));
  return { unit: "lb", tz: env.TIMEZONE ?? "America/New_York", autoPush: true, graphMetric: "volume", ...s };
}

function today(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

async function program(env: Env, m: Mode): Promise<ProgramConfig | null> {
  return kvGet<ProgramConfig>(env.DB, k(m, "program"));
}

/** After new data lands: keep Hevy routines in step with the program. */
async function afterSync(env: Env) {
  if (!env.HEVY_API_KEY) return;
  const [s, cfg] = await Promise.all([settings(env, "live"), program(env, "live")]);
  if (!s.autoPush || !cfg || !cfg.routineDays || !Object.keys(cfg.routineDays).length) return;
  const r = await pushRoutines(env.DB, env.HEVY_API_KEY!, cfg);
  await kvPut(env.DB, "program", r.cfg);
}

async function api(req: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  const method = req.method;

  // Hevy webhook: its own bearer secret, and it must answer within 5 s.
  if (path === "/api/hevy/webhook" && method === "POST") {
    const auth = req.headers.get("authorization") ?? "";
    if (!env.WEBHOOK_SECRET || !safeEqual(auth, `Bearer ${env.WEBHOOK_SECRET}`)) return json({ error: "unauthorized" }, { status: 401 });
    const body = await req.json<{ workoutId?: string }>().catch(() => ({}) as { workoutId?: string });
    if (body.workoutId && env.HEVY_API_KEY) {
      ctx.waitUntil(syncOne(env.DB, env.HEVY_API_KEY, body.workoutId).then(() => afterSync(env)).catch((e) => console.error("webhook sync", e)));
    }
    return json({ ok: true });
  }

  // WHOOP webhook: verified by HMAC signature with the client secret, not by app login.
  if (path === "/api/whoop/webhook" && method === "POST") {
    const raw = await req.text();
    if (!(await verifyWebhook(env, req, raw))) return json({ error: "bad signature" }, { status: 401 });
    const ev = JSON.parse(raw) as { id: string; type: string };
    ctx.waitUntil(Promise.resolve(handleWebhookEvent(env, ev)).catch((e) => console.error("whoop webhook", e)));
    return json({ ok: true });
  }

  // Social, server to server: no login, but every /social/v1/* request must be signed (social/peer.ts).
  if (isPeerPath(path)) return handlePeer(req, socialCtx(req, env, ctx, "none"), path);

  // ── who's allowed in ─────────────────────────────────────────────
  // Any one of: the app's own Google sign-in session (your own domain), a Cloudflare Access
  // token (workers.dev), or the optional password session. Off localhost, no login configured
  // means no data.
  const url = new URL(req.url);
  // Cookie-authenticated writes must come from our own pages (auth.ts). /auth/app is exempt: it
  // carries its own app token, and a native web view's form post may have no usable Origin.
  if (path !== "/auth/app") {
    const why = csrfBlock(req, [url.origin, socialOrigin(env, url)]);
    if (why) return json({ error: `Blocked ${why}.` }, { status: 403 });
  }
  const allowed = (env.ALLOWED_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const google: GoogleConfig | null = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && allowed.length
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, sessionSecret: env.SESSION_SECRET, allowed }
    : null;
  const sessionSecret = env.SESSION_SECRET ?? env.APP_PASSWORD;

  if (path === "/auth/login") {
    if (!google) return new Response("Google sign-in isn't configured.", { status: 404 });
    return loginRedirect(google, url.origin, url.searchParams.get("next") ?? "/");
  }
  if (path === "/auth/callback") {
    if (!google) return new Response("Google sign-in isn't configured.", { status: 404 });
    try {
      const { returnTo } = await googleCallback(google, req);
      const h = new Headers({ location: returnTo });
      h.append("set-cookie", await sessionCookie(google.sessionSecret));
      h.append("set-cookie", clearFlowCookie);
      return new Response(null, { status: 302, headers: h });
    } catch (e) {
      const msg = String((e as Error).message ?? e).replace(/[<>&]/g, "");
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#000;color:#ff6b5e;font:14px ui-monospace,monospace;padding:24px">Sign-in failed: ${msg}<br><br><a style="color:#ffb000" href="/auth/login">Try again</a></body>`, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  }
  // Native app → embedded web view: trade an app token for a normal session cookie.
  if (path === "/auth/app" && method === "POST") {
    const form = await req.formData().catch(() => null);
    const tok = await checkToken(env.DB, String(form?.get("token") ?? ""));
    const next = String(form?.get("next") ?? "/");
    if (!tok) return new Response("Invalid or revoked app token.", { status: 403 });
    const h = new Headers({ location: /^\/(?![\/\\])/.test(next) ? next : "/" });
    if (sessionSecret) h.append("set-cookie", await sessionCookie(sessionSecret));
    return new Response(null, { status: 302, headers: h });
  }
  if (path === "/auth/logout") return new Response(null, { status: 302, headers: { location: "/", "set-cookie": clearCookie } });

  const authMode = google ? "google" : env.ACCESS_AUD ? "access" : env.APP_PASSWORD ? "password" : "none";
  const host = url.hostname;
  if (authMode === "none" && host !== "localhost" && host !== "127.0.0.1") {
    return json({ error: "No login configured for this deployment." }, { status: 403 });
  }
  if (path === "/api/login" && method === "POST") {
    const { password } = await req.json<{ password: string }>();
    if (!env.APP_PASSWORD || !safeEqual(password ?? "", env.APP_PASSWORD)) return json({ error: "Wrong password" }, { status: 401 });
    return json({ ok: true }, { headers: { "set-cookie": await sessionCookie(sessionSecret!) } });
  }
  if (path === "/api/logout" && method === "POST") return json({ ok: true }, { headers: { "set-cookie": clearCookie } });

  let ok = authMode === "none";
  if (!ok && sessionSecret && (await isAuthed(req, sessionSecret))) ok = true;
  if (!ok && env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN && (await verifyAccess(req, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD, allowed).catch(() => null))) ok = true;
  if (!ok && (await checkToken(env.DB, bearer(req)))) ok = true;
  if (!ok) return json({ error: "login required", auth: authMode }, { status: 401 });

  if (path.startsWith("/api/social/")) return handleOwner(req, socialCtx(req, env, ctx, authMode), path);

  const m = await mode(env);
  if (path === "/api/bootstrap" && method === "GET") return json(await bootstrap(env, authMode, m));
  if (path === "/api/snapshot" && method === "GET") return json(snapshot(await bootstrap(env, authMode, m)), { headers: { "cache-control": "no-store" } });

  // "Start fresh (no Hevy)": use Ironterm as the log even before any workout exists.
  if (path === "/api/mode" && method === "PUT") {
    if (m === "live") return json({ error: "A Hevy key is set; mode follows Hevy." }, { status: 400 });
    const { mode: want } = await req.json<{ mode?: string }>().catch(() => ({}) as { mode?: string });
    if (want !== "local" && want !== "demo") return json({ error: "mode must be local or demo" }, { status: 400 });
    await kvPut(env.DB, "mode", want === "local" ? "local" : null);
    return json({ mode: await mode(env) });
  }

  // Strong CSV export → workouts table. Re-importing the same file updates in place.
  if (path === "/api/import/strong" && method === "POST") {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_IMPORT) return json({ error: `File too large (max ${MAX_IMPORT / 1e6} MB).` }, { status: 413 });
    const body = await req.json<{ csv?: string; unit?: string; distUnit?: string; preview?: boolean }>().catch(() => null);
    if (!body || typeof body.csv !== "string") return json({ error: "Send {csv} with the Strong export's text." }, { status: 400 });
    if (body.csv.length > MAX_IMPORT) return json({ error: `File too large (max ${MAX_IMPORT / 1e6} MB).` }, { status: 413 });
    const s = await settings(env, m);
    const unit = body.unit === "kg" || body.unit === "lb" ? body.unit : undefined;
    const distUnit = body.distUnit === "km" || body.distUnit === "mi" ? body.distUnit : undefined;
    let r: ReturnType<typeof parseStrong>;
    // A preview without a unit assumes the settings unit, so its new/changed counts stay meaningful.
    try { r = parseStrong(body.csv, { tz: s.tz, unit: unit ?? s.unit, distUnit, liftMap: (await program(env, m))?.liftMap }); }
    catch (e) { if (e instanceof StrongError) return json({ error: e.message }, { status: 400 }); throw e; }
    const have = await workoutJson(env.DB, r.workouts.map((w) => w.id));
    let added = 0, updated = 0, skipped = 0;
    const changed = r.workouts.filter((w) => {
      const prev = have.get(w.id);
      if (prev == null) { added++; return true; }
      // Unchanged, or notes edited here since (local edits win over a re-import).
      if (prev === JSON.stringify(w) || (JSON.parse(prev) as HevyWorkout).updated_at) { skipped++; return false; }
      updated++;
      return true;
    });
    const out = { workouts: r.workouts.length, added, updated, skipped, from: r.from, to: r.to, unmatchedExercises: r.unmatchedExercises, unitDetected: r.unitDetected, rows: r.rows, ignoredRows: r.ignoredRows };
    if (body.preview) return json({ ...out, preview: true });
    if (!r.unitDetected && !unit) return json({ error: "This export has no Weight Unit column: say whether its weights are kg or lb." }, { status: 400 });
    for (let i = 0; i < changed.length; i += 200) await upsertWorkouts(env.DB, changed.slice(i, i + 200));
    if (m === "demo") {
      // First real data: leave demo. Carry over the unit so numbers read the way they were logged.
      await kvPut(env.DB, "mode", "local");
      if (!(await kvGet(env.DB, "settings"))) await kvPut(env.DB, "settings", { ...s, unit: r.unitDetected ?? unit });
    }
    return json({ ...out, mode: await mode(env) });
  }

  // Edit a past workout's notes. Live: fetch it fresh from Hevy, change only the notes, PUT it
  // back, store what Hevy returns. Demo: notes are kept locally.
  const notesM = path.match(/^\/api\/workouts\/([^/]+)\/notes$/);
  if (notesM && method === "PUT") {
    const id = decodeURIComponent(notesM[1]);
    const edit = await req.json<NotesEdit>();
    if (typeof edit?.description !== "string" || !Array.isArray(edit.exercises)) return json({ error: "bad request" }, { status: 400 });
    if (m === "local") {
      const w = (await allWorkouts(env.DB)).find((x) => x.id === id);
      if (!w) return json({ error: "workout not found" }, { status: 404 });
      let next: HevyWorkout;
      try { next = applyNotes(w, edit); } catch (e) { return json({ error: (e as Error).message }, { status: 409 }); }
      await upsertWorkouts(env.DB, [{ ...next, updated_at: new Date().toISOString() }]);
      return json({ ok: true, local: true, workout: next });
    }
    if (m === "demo") {
      const w = (await bootstrap(env, authMode, m)).workouts.find((x) => x.id === id);
      if (!w) return json({ error: "workout not found" }, { status: 404 });
      try { applyNotes(w, edit); } catch (e) { return json({ error: (e as Error).message }, { status: 409 }); }
      const notes = (await kvGet<Record<string, NotesEdit>>(env.DB, "demo:notes")) ?? {};
      notes[id] = edit;
      await kvPut(env.DB, "demo:notes", notes);
      return json({ ok: true, demo: true });
    }
    const hevy = new Hevy(env.HEVY_API_KEY!);
    const fresh = await hevy.workout(id);
    const next = applyNotes(fresh, edit);
    const saved = await hevy.updateWorkout(id, toHevyUpdate(next));
    const stored = saved?.id ? saved : await hevy.workout(id).catch(() => next);
    await upsertWorkouts(env.DB, [stored]);
    return json({ ok: true, workout: stored });
  }

  // ── native app screens (shared/appapi.ts) ──
  if (path.startsWith("/api/app/")) {
    const b = await bootstrap(env, authMode, m);
    const sub = path.slice(9);
    const q = url.searchParams;
    const none = () => json({ error: "not found" }, { status: 404 });
    if (method === "GET") {
      if (sub === "home") return json(appHome(b));
      if (sub === "gym") return json(appGym(b));
      if (sub === "lifts") return json(appLifts(b));
      if (sub.startsWith("lifts/")) { const r = appLift(b, decodeURIComponent(sub.slice(6))); return r ? json(r) : none(); }
      if (sub === "history") return json(appHistory(b, { cursor: q.get("cursor"), limit: Number(q.get("limit") ?? 30), q: q.get("q") ?? undefined }));
      if (sub.startsWith("workouts/")) { const r = appWorkout(b, decodeURIComponent(sub.slice(9))); return r ? json(r) : none(); }
      if (sub === "calendar") return json(appCalendar(b, q.get("month") ?? undefined));
      if (sub === "program") return json(appProgram(b));
      if (sub === "body") return json(appBody(b, q.get("mode") === "load" ? "load" : "ready"));
      if (sub === "insights") return json(appInsights(b));
      if (sub === "stats") return json(appStats(b));
      if (sub === "programs") return json(appPrograms(b));
      if (sub.startsWith("programs/") && !sub.slice(9).includes("/")) {
        const opt: Record<string, string> = {};
        for (const [key, v] of q) if (key.startsWith("opt.")) opt[key.slice(4)] = v;
        const r = appProgramDetail(b, decodeURIComponent(sub.slice(9)), opt);
        return "error" in r ? json({ error: r.error }, { status: r.status }) : json(r);
      }
    }
    const startM = sub.match(/^programs\/([^/]+)\/start$/);
    if (startM && method === "POST") {
      const raw = await req.text();
      let body: unknown = null;
      try { body = raw.trim() ? JSON.parse(raw) : null; } catch { return json({ error: "body must be JSON" }, { status: 400 }); }
      const r = startProgram(b, decodeURIComponent(startM[1]), body);
      if ("error" in r) return json({ error: r.error }, { status: r.status });
      // same as PUT /api/program (+ the training days, if given)
      await kvPut(env.DB, k(m, "program"), r.cfg);
      if (r.trainingDays) await kvPut(env.DB, k(m, "settings"), { ...(await settings(env, m)), trainingDays: r.trainingDays });
      return json({ ok: true, program: appProgram(await bootstrap(env, authMode, m)) });
    }
    if (sub === "gym/start" && method === "POST") {
      const body = await req.json<{ dayIndex?: number; empty?: boolean }>().catch(() => ({}));
      const s = startSession(b, body);
      await kvPut(env.DB, k(m, "live"), s);
      return json(s);
    }
    return none();
  }

  if (path === "/api/tokens" && method === "GET") return json(await listTokens(env.DB));
  if (path === "/api/tokens" && method === "POST") {
    const { name } = await req.json<{ name?: string }>().catch(() => ({ name: "" }));
    return json(await createToken(env.DB, name ?? ""));
  }
  if (path.startsWith("/api/tokens/") && method === "DELETE") return json({ ok: await revokeToken(env.DB, decodeURIComponent(path.slice(12))) });

  if (path === "/api/settings" && method === "PUT") {
    const next = { ...(await settings(env, m)), ...(await req.json<Partial<Settings>>()) };
    await kvPut(env.DB, k(m, "settings"), next);
    return json(next);
  }

  if (path === "/api/program" && method === "PUT") {
    const cfg = await req.json<ProgramConfig | null>();
    await kvPut(env.DB, k(m, "program"), cfg);
    return json({ ok: true });
  }

  if (path === "/api/sync" && method === "POST") {
    if (m !== "live") return json({ error: `${NO_HEVY[m]} sync from Hevy.` }, { status: 400 });
    const st = await sync(env.DB, env.HEVY_API_KEY!);
    if (!st.error && (st.last?.added || st.last?.deleted)) ctx.waitUntil(afterSync(env).catch((e) => console.error("autopush", e)));
    return json(st);
  }

  if (path === "/api/routines/push" && method === "POST") {
    if (m !== "live") return json({ error: `${NO_HEVY[m]} push routines.` }, { status: 400 });
    const { dayIndex } = await req.json<{ dayIndex?: number }>().catch(() => ({}) as { dayIndex?: number });
    const cfg = await program(env, m);
    if (!cfg) return json({ error: "Set up a program first." }, { status: 400 });
    const r = await pushRoutines(env.DB, env.HEVY_API_KEY!, cfg, dayIndex);
    await kvPut(env.DB, "program", r.cfg);
    return json(r);
  }

  // ── gym mode: the in-progress session lives server-side so a phone refresh never loses it
  // A debounced save that lands after FINISH (or a retry from another device) must not bring
  // the finished session back as the live one.
  if (path === "/api/live" && method === "PUT" && (await alreadyFinished(env, m, req.clone() as Request))) return json({ ok: true, finished: true });
  if (path === "/api/live" && method === "PUT") {
    await kvPut(env.DB, k(m, "live"), await req.json<LiveSession>());
    return json({ ok: true });
  }
  if (path === "/api/live" && method === "DELETE") {
    await kvPut(env.DB, k(m, "live"), null);
    return json({ ok: true });
  }
  if (path === "/api/live/finish" && method === "POST") {
    const session = await req.json<LiveSession>();
    if (typeof session?.id !== "string" || !Array.isArray(session.exercises)) return json({ error: "bad request" }, { status: 400 });
    if (m === "demo") {
      // Demo: keep the workout locally so the program advances.
      const w = toStoredWorkout(session, `demo-live-${session.id}`, (ex) => ex.templateId ?? `demo-${ex.lift}`);
      const extra = (await kvGet<HevyWorkout[]>(env.DB, "demo:extra")) ?? [];
      await kvPut(env.DB, "demo:extra", [...extra.filter((x) => x.id !== w.id), w]);
      await kvPut(env.DB, k(m, "live"), null);
      return json({ workout: w, demo: true, prs: finishPRs(await bootstrap(env, authMode, m), w.id) });
    }
    // Idempotent per session: a retry after a lost response must not log the workout twice.
    const doneKey = `finished:${session.id}`;
    const prior = await kvGet<{ pending?: string; workout?: HevyWorkout }>(env.DB, doneKey);
    if (prior?.workout) return json({ workout: prior.workout, prs: finishPRs(await bootstrap(env, authMode, m), prior.workout.id), duplicate: true, ...(m === "local" ? { local: true } : {}) });
    if (prior?.pending && Date.now() - Date.parse(prior.pending) < 120_000) return json({ error: "This workout is still being saved. Try again in a moment." }, { status: 409 });
    await kvPut(env.DB, doneKey, { pending: new Date().toISOString() });
    if (m === "local") {
      // Local: this table is the log. Library lifts get a stable `lift:<key>` id so they always match.
      const cfg = await program(env, m);
      const w = toStoredWorkout(session, `local-${session.id}`, (ex) => ex.templateId ?? cfg?.liftMap?.[ex.lift] ?? localTemplateId(ex.lift));
      await upsertWorkouts(env.DB, [w]);
      await kvPut(env.DB, doneKey, { workout: { id: w.id, title: w.title, start_time: w.start_time, end_time: w.end_time, exercises: [] } });
      await kvPut(env.DB, "live", null);
      return json({ workout: w, local: true, prs: finishPRs(await bootstrap(env, authMode, m), w.id) });
    }
    let w: HevyWorkout;
    try {
      w = await finishLive(env.DB, env.HEVY_API_KEY!, session, await program(env, m));
    } catch (e) {
      await kvPut(env.DB, doneKey, null);
      throw e;
    }
    await kvPut(env.DB, doneKey, { workout: { id: w.id, title: w.title, start_time: w.start_time, end_time: w.end_time, exercises: [] } });
    await kvPut(env.DB, "live", null);
    ctx.waitUntil(afterSync(env).catch((e) => console.error("autopush", e)));
    return json({ workout: w, prs: finishPRs(await bootstrap(env, authMode, m), w.id) });
  }

  // ── trips
  if (path === "/api/trips" && method === "PUT") {
    await kvPut(env.DB, k(m, "trips"), await req.json<Trip[]>());
    return json({ ok: true });
  }
  if (path === "/api/routines/travel" && method === "POST") {
    if (m !== "live") return json({ error: `${NO_HEVY[m]} push routines.` }, { status: 400 });
    const { sessions, unit } = await req.json<{ sessions: PlannedSession[]; unit: "lb" | "kg" }>();
    return json({ pushed: await pushSessions(env.DB, env.HEVY_API_KEY!, sessions, unit) });
  }

  // ── manual weigh-ins (Hevy's own log is rarely used)
  if (path === "/api/weighin" && method === "POST") {
    const w = await req.json<{ date: string; kg: number }>();
    const list = ((await kvGet<{ date: string; kg: number }[]>(env.DB, k(m, "weighins"))) ?? []).filter((x) => x.date !== w.date);
    if (w.kg > 0) list.push({ date: w.date, kg: w.kg });
    await kvPut(env.DB, k(m, "weighins"), list.sort((a, z) => a.date.localeCompare(z.date)));
    return json({ ok: true });
  }

  // ── WHOOP
  if (path === "/api/whoop/connect" && method === "GET") {
    if (!whoopConfigured(env)) return json({ error: "Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first." }, { status: 400 });
    return Response.redirect(await authUrl(env, new URL(req.url).origin), 302);
  }
  if (path === "/api/whoop/callback" && method === "GET") {
    const url = new URL(req.url);
    try {
      await handleCallback(env, url);
      ctx.waitUntil(settings(env, m).then((st) => syncWhoop(env, 400, st.tz)).catch((e) => console.error("whoop initial sync", e)));
      return Response.redirect(`${url.origin}/#set`, 302);
    } catch (e) {
      return new Response(`WHOOP connect failed: ${(e as Error).message}`, { status: 400 });
    }
  }
  if (path === "/api/whoop/sync" && method === "POST") return json(await syncWhoop(env, 30, (await settings(env, m)).tz));
  if (path === "/api/whoop" && method === "DELETE") { await disconnect(env); return json({ ok: true }); }

  if (path === "/api/templates" && method === "GET") {
    if (m !== "live") return json([]);
    return json(await getTemplates(env.DB, env.HEVY_API_KEY!));
  }

  return json({ error: "not found" }, { status: 404 });
}

/** Is this PUT /api/live body a session that was already saved as a workout? */
async function alreadyFinished(env: Env, m: Mode, req: Request): Promise<boolean> {
  const s = await req.json<{ id?: unknown }>().catch(() => null);
  if (!s || typeof s.id !== "string") return false;
  if (m === "demo") return ((await kvGet<HevyWorkout[]>(env.DB, "demo:extra")) ?? []).some((w) => w.id === `demo-live-${s.id}`);
  return !!(await kvGet<{ workout?: unknown }>(env.DB, `finished:${s.id}`))?.workout;
}

function socialCtx(
req: Request, env: Env, ctx: ExecutionContext, authMode: string): SocialCtx {
  return {
    env, self: socialOrigin(env, new URL(req.url)),
    boot: async () => bootstrap(env, authMode, await mode(env)),
    waitUntil: (p) => ctx.waitUntil(p),
  };
}

async function bootstrap(env: Env, authMode: string, m: Mode): Promise<Bootstrap> {
  const s = await settings(env, m);
  if (m === "demo") {
    const demo = demoData(today(s.tz));
    const extra = (await kvGet<HevyWorkout[]>(env.DB, "demo:extra")) ?? [];
    const demoNotes = (await kvGet<Record<string, NotesEdit>>(env.DB, "demo:notes")) ?? {};
    const workouts = [...demo.workouts, ...extra].map((w) => {
      const n = demoNotes[w.id];
      try { return n ? applyNotes(w, n) : w; } catch { return w; }
    });
    return ({ mode: "demo" as const, auth: authMode, settings: s, program: (await program(env, m)) ?? demo.config, workouts, sync: { cursor: null, at: new Date().toISOString(), count: workouts.length }, today: today(s.tz), live: await kvGet(env.DB, k(m, "live")), weighins: (await kvGet(env.DB, k(m, "weighins"))) ?? [], trips: (await kvGet(env.DB, k(m, "trips"))) ?? [] }) as Bootstrap;
  }
  const [cfg, workouts, st] = await Promise.all([program(env, m), allWorkouts(env.DB), kvGet<SyncState>(env.DB, "sync")]);
  const sync: SyncState = m === "live" ? (st ?? { cursor: null }) : { cursor: null, count: workouts.length };
  return ({ mode: m, auth: authMode, settings: s, program: cfg, workouts, sync, today: today(s.tz), live: await kvGet(env.DB, "live"), whoop: await whoopData(env), body: (await kvGet(env.DB, "body")) ?? [], weighins: (await kvGet(env.DB, "weighins")) ?? [], trips: (await kvGet(env.DB, "trips")) ?? [] }) as Bootstrap;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/") && !isPeerPath(url.pathname)) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
    await ensureSchema(env.DB);
    await ensureWhoopSchema(env.DB);
    await ensureSocialSchema(env.DB);
    try {
      return await api(req, env, ctx, url.pathname);
    } catch (e) {
      console.error(e);
      const status = e instanceof HevyError ? 502 : 500;
      return json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  },

  async scheduled(_ev, env, ctx) {
    if (!env.HEVY_API_KEY) return;
    await ensureSchema(env.DB);
    const st = await sync(env.DB, env.HEVY_API_KEY);
    if (!st.error && (st.last?.added || st.last?.deleted)) ctx.waitUntil(afterSync(env));
    // Recovery and body weight have no webhook; pick them up here.
    if (whoopConfigured(env)) {
      await ensureWhoopSchema(env.DB);
      ctx.waitUntil(settings(env, await mode(env)).then((st) => syncWhoop(env, 3, st.tz)).catch((e) => console.error("whoop cron", e)));
    }
  },
} satisfies ExportedHandler<Env>;
