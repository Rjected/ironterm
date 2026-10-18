import { demoData } from "../shared/demo";
import type { ProgramConfig } from "../shared/program";
import { clearCookie, isAuthed, safeEqual, sessionCookie, verifyAccess } from "./auth";
import { snapshot } from "../shared/snapshot";
import { finishPRs, appBody, appCalendar, appGym, appHistory, appHome, appInsights, appLift, appLifts, appProgram, appStats, appWorkout, startSession } from "../shared/appapi";
import type { Bootstrap } from "../src/api";
import { bearer, checkToken, createToken, listTokens, revokeToken } from "./tokens";
import { clearFlowCookie, handleCallback as googleCallback, loginRedirect, type GoogleConfig } from "./google";
import { Hevy, HevyError } from "./hevy";
import { applyNotes, toHevyUpdate, type NotesEdit } from "../shared/notes";
import { authUrl, disconnect, ensureWhoopSchema, handleCallback, handleWebhookEvent, syncWhoop, verifyWebhook, whoopConfigured, whoopData } from "./whoop";
import { allWorkouts, ensureSchema, kvGet, kvPut, upsertWorkouts } from "./store";
import { finishLive, getTemplates, pushRoutines, pushSessions, sync, syncOne, type SyncState } from "./sync";
import type { PlannedSession } from "../shared/program";
import type { Trip } from "../shared/travel";
import { toHevyWorkout, type LiveSession } from "../shared/live";
import { LIFTS } from "../shared/lifts";
import type { HevyWorkout } from "../shared/hevy";

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

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...init.headers } });

const live = (env: Env) => !!env.HEVY_API_KEY;
// Demo mode keeps its own settings so trying things out never touches real config.
const k = (env: Env, key: string) => (live(env) ? key : `demo:${key}`);

async function settings(env: Env): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>(env.DB, k(env, "settings"));
  return { unit: "lb", tz: env.TIMEZONE ?? "America/New_York", autoPush: true, graphMetric: "volume", ...s };
}

function today(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

async function program(env: Env): Promise<ProgramConfig | null> {
  return kvGet<ProgramConfig>(env.DB, k(env, "program"));
}

/** After new data lands: keep Hevy routines in step with the program. */
async function afterSync(env: Env) {
  if (!live(env)) return;
  const [s, cfg] = await Promise.all([settings(env), program(env)]);
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

  // ── who's allowed in ─────────────────────────────────────────────
  // Any one of: the app's own Google sign-in session (your own domain), a Cloudflare Access
  // token (workers.dev), or the optional password session. Off localhost, no login configured
  // means no data.
  const url = new URL(req.url);
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

  if (path === "/api/bootstrap" && method === "GET") return json(await bootstrap(env, authMode));
  if (path === "/api/snapshot" && method === "GET") return json(snapshot(await bootstrap(env, authMode)), { headers: { "cache-control": "no-store" } });

  // Edit a past workout's notes. Live: fetch it fresh from Hevy, change only the notes, PUT it
  // back, store what Hevy returns. Demo: notes are kept locally.
  const notesM = path.match(/^\/api\/workouts\/([^/]+)\/notes$/);
  if (notesM && method === "PUT") {
    const id = decodeURIComponent(notesM[1]);
    const edit = await req.json<NotesEdit>();
    if (typeof edit?.description !== "string" || !Array.isArray(edit.exercises)) return json({ error: "bad request" }, { status: 400 });
    if (!live(env)) {
      const w = (await bootstrap(env, authMode)).workouts.find((x) => x.id === id);
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
    const b = await bootstrap(env, authMode);
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
    }
    if (sub === "gym/start" && method === "POST") {
      const body = await req.json<{ dayIndex?: number; empty?: boolean }>().catch(() => ({}));
      const s = startSession(b, body);
      await kvPut(env.DB, k(env, "live"), s);
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
    const next = { ...(await settings(env)), ...(await req.json<Partial<Settings>>()) };
    await kvPut(env.DB, k(env, "settings"), next);
    return json(next);
  }

  if (path === "/api/program" && method === "PUT") {
    const cfg = await req.json<ProgramConfig | null>();
    await kvPut(env.DB, k(env, "program"), cfg);
    return json({ ok: true });
  }

  if (path === "/api/sync" && method === "POST") {
    if (!live(env)) return json({ error: "Demo mode: add HEVY_API_KEY to sync." }, { status: 400 });
    const st = await sync(env.DB, env.HEVY_API_KEY!);
    if (!st.error && (st.last?.added || st.last?.deleted)) ctx.waitUntil(afterSync(env).catch((e) => console.error("autopush", e)));
    return json(st);
  }

  if (path === "/api/routines/push" && method === "POST") {
    if (!live(env)) return json({ error: "Demo mode: add HEVY_API_KEY to push routines." }, { status: 400 });
    const { dayIndex } = await req.json<{ dayIndex?: number }>().catch(() => ({}) as { dayIndex?: number });
    const cfg = await program(env);
    if (!cfg) return json({ error: "Set up a program first." }, { status: 400 });
    const r = await pushRoutines(env.DB, env.HEVY_API_KEY!, cfg, dayIndex);
    await kvPut(env.DB, "program", r.cfg);
    return json(r);
  }

  // ── gym mode: the in-progress session lives server-side so a phone refresh never loses it
  if (path === "/api/live" && method === "PUT") {
    await kvPut(env.DB, k(env, "live"), await req.json<LiveSession>());
    return json({ ok: true });
  }
  if (path === "/api/live" && method === "DELETE") {
    await kvPut(env.DB, k(env, "live"), null);
    return json({ ok: true });
  }
  if (path === "/api/live/finish" && method === "POST") {
    const session = await req.json<LiveSession>();
    if (!live(env)) {
      // Demo: keep the workout locally so the program advances.
      const body = toHevyWorkout(session, (ex) => ex.templateId ?? `demo-${ex.lift}`);
      const w: HevyWorkout = {
        id: `demo-live-${session.id}`, title: body.workout.title, description: body.workout.description,
        start_time: body.workout.start_time, end_time: body.workout.end_time,
        exercises: body.workout.exercises.map((e) => ({ title: LIFTS[session.exercises.find((x) => (x.templateId ?? `demo-${x.lift}`) === e.exercise_template_id)?.lift ?? ""]?.hevy[0] ?? e.exercise_template_id, exercise_template_id: e.exercise_template_id, sets: e.sets })),
      };
      const extra = (await kvGet<HevyWorkout[]>(env.DB, "demo:extra")) ?? [];
      await kvPut(env.DB, "demo:extra", [...extra.filter((x) => x.id !== w.id), w]);
      await kvPut(env.DB, k(env, "live"), null);
      return json({ workout: w, demo: true, prs: finishPRs(await bootstrap(env, authMode), w.id) });
    }
    // Idempotent per session: a retry after a lost response must not log the workout twice.
    const doneKey = `finished:${session.id}`;
    const prior = await kvGet<{ pending?: string; workout?: HevyWorkout }>(env.DB, doneKey);
    if (prior?.workout) return json({ workout: prior.workout, prs: finishPRs(await bootstrap(env, authMode), prior.workout.id), duplicate: true });
    if (prior?.pending && Date.now() - Date.parse(prior.pending) < 120_000) return json({ error: "This workout is still being saved. Try again in a moment." }, { status: 409 });
    await kvPut(env.DB, doneKey, { pending: new Date().toISOString() });
    let w: HevyWorkout;
    try {
      w = await finishLive(env.DB, env.HEVY_API_KEY!, session, await program(env));
    } catch (e) {
      await kvPut(env.DB, doneKey, null);
      throw e;
    }
    await kvPut(env.DB, doneKey, { workout: { id: w.id, title: w.title, start_time: w.start_time, end_time: w.end_time, exercises: [] } });
    await kvPut(env.DB, "live", null);
    ctx.waitUntil(afterSync(env).catch((e) => console.error("autopush", e)));
    return json({ workout: w, prs: finishPRs(await bootstrap(env, authMode), w.id) });
  }

  // ── trips
  if (path === "/api/trips" && method === "PUT") {
    await kvPut(env.DB, k(env, "trips"), await req.json<Trip[]>());
    return json({ ok: true });
  }
  if (path === "/api/routines/travel" && method === "POST") {
    if (!live(env)) return json({ error: "Demo mode: add HEVY_API_KEY to push routines." }, { status: 400 });
    const { sessions, unit } = await req.json<{ sessions: PlannedSession[]; unit: "lb" | "kg" }>();
    return json({ pushed: await pushSessions(env.DB, env.HEVY_API_KEY!, sessions, unit) });
  }

  // ── manual weigh-ins (Hevy's own log is rarely used)
  if (path === "/api/weighin" && method === "POST") {
    const w = await req.json<{ date: string; kg: number }>();
    const list = ((await kvGet<{ date: string; kg: number }[]>(env.DB, k(env, "weighins"))) ?? []).filter((x) => x.date !== w.date);
    if (w.kg > 0) list.push({ date: w.date, kg: w.kg });
    await kvPut(env.DB, k(env, "weighins"), list.sort((a, z) => a.date.localeCompare(z.date)));
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
      ctx.waitUntil(settings(env).then((st) => syncWhoop(env, 400, st.tz)).catch((e) => console.error("whoop initial sync", e)));
      return Response.redirect(`${url.origin}/#set`, 302);
    } catch (e) {
      return new Response(`WHOOP connect failed: ${(e as Error).message}`, { status: 400 });
    }
  }
  if (path === "/api/whoop/sync" && method === "POST") return json(await syncWhoop(env, 30, (await settings(env)).tz));
  if (path === "/api/whoop" && method === "DELETE") { await disconnect(env); return json({ ok: true }); }

  if (path === "/api/templates" && method === "GET") {
    if (!live(env)) return json([]);
    return json(await getTemplates(env.DB, env.HEVY_API_KEY!));
  }

  return json({ error: "not found" }, { status: 404 });
}

async function bootstrap(env: Env, authMode: string): Promise<Bootstrap> {
  const s = await settings(env);
  if (!live(env)) {
    const demo = demoData(today(s.tz));
    const extra = (await kvGet<HevyWorkout[]>(env.DB, "demo:extra")) ?? [];
    const demoNotes = (await kvGet<Record<string, NotesEdit>>(env.DB, "demo:notes")) ?? {};
    const workouts = [...demo.workouts, ...extra].map((w) => {
      const n = demoNotes[w.id];
      try { return n ? applyNotes(w, n) : w; } catch { return w; }
    });
    return ({ mode: "demo" as const, auth: authMode, settings: s, program: (await program(env)) ?? demo.config, workouts, sync: { cursor: null, at: new Date().toISOString(), count: workouts.length }, today: today(s.tz), live: await kvGet(env.DB, k(env, "live")), weighins: (await kvGet(env.DB, k(env, "weighins"))) ?? [], trips: (await kvGet(env.DB, k(env, "trips"))) ?? [] }) as Bootstrap;
  }
  const [cfg, workouts, st] = await Promise.all([program(env), allWorkouts(env.DB), kvGet<SyncState>(env.DB, "sync")]);
  return ({ mode: "live" as const, auth: authMode, settings: s, program: cfg, workouts, sync: st ?? { cursor: null }, today: today(s.tz), live: await kvGet(env.DB, "live"), whoop: await whoopData(env), body: (await kvGet(env.DB, "body")) ?? [], weighins: (await kvGet(env.DB, "weighins")) ?? [], trips: (await kvGet(env.DB, "trips")) ?? [] }) as Bootstrap;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
    await ensureSchema(env.DB);
    await ensureWhoopSchema(env.DB);
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
      ctx.waitUntil(settings(env).then((st) => syncWhoop(env, 3, st.tz)).catch((e) => console.error("whoop cron", e)));
    }
  },
} satisfies ExportedHandler<Env>;
