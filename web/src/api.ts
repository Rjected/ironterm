import type { HevyWorkout } from "../shared/hevy";
import type { ProgramConfig } from "../shared/program";
import type { Settings } from "../worker/index";
import type { SyncState } from "../worker/sync";
import type { LiveSession } from "../shared/live";
import type { WhoopData } from "../shared/whoop";
import type { Trip } from "../shared/travel";
import type { PlannedSession } from "../shared/program";
import type { AppProgram, AppProgramList, ProgramBody, ProgramDetail, StartBody } from "../shared/appapi";
import type { Compare, FeedItem, Friend, Notification, Share, SocialMe, SocialProfile, Author } from "../worker/social/types";

export type { Settings };

export interface Bootstrap {
  mode: "demo" | "live" | "local";
  auth: "google" | "access" | "password" | "none";
  settings: Settings;
  program: ProgramConfig | null;
  workouts: HevyWorkout[];
  sync: SyncState;
  today: string;
  live?: LiveSession | null;
  whoop?: WhoopData;
  body?: { date: string; weightKg: number }[];
  weighins?: { date: string; kg: number }[];
  trips?: Trip[];
}

export interface StrongImportResult {
  workouts: number;
  added: number;
  updated: number;
  skipped: number;
  from: string | null;
  to: string | null;
  unmatchedExercises: string[];
  unitDetected: "kg" | "lb" | null;
  rows: number;
  ignoredRows: number;
  preview?: boolean;
  mode?: Bootstrap["mode"];
}

export interface AppTokenInfo { id: string; name: string; created: string; lastUsed: string | null }

export class ApiError extends Error {
  constructor(public status: number, msg: string, public auth?: string) {
    super(msg);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as any).error ?? res.statusText, (body as any).auth);
  return body as T;
}

export const api = {
  bootstrap: () => call<Bootstrap>("/api/bootstrap"),
  login: (password: string) => call("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => call("/api/logout", { method: "POST" }),
  saveSettings: (s: Partial<Settings>) => call<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  saveProgram: (cfg: ProgramConfig | null) => call("/api/program", { method: "PUT", body: JSON.stringify(cfg) }),
  sync: () => call<SyncState>("/api/sync", { method: "POST" }),
  push: (dayIndex?: number) => call<{ pushed: { dayId: string; title: string }[] }>("/api/routines/push", { method: "POST", body: JSON.stringify({ dayIndex }) }),
  saveLive: (s: LiveSession) => call("/api/live", { method: "PUT", body: JSON.stringify(s) }),
  discardLive: () => call("/api/live", { method: "DELETE" }),
  finishLive: (s: LiveSession) => call<{ workout: { id: string }; demo?: boolean; local?: boolean; duplicate?: boolean }>("/api/live/finish", { method: "POST", body: JSON.stringify(s) }),
  whoopSync: () => call<{ workouts: number; recoveries: number }>("/api/whoop/sync", { method: "POST" }),
  whoopDisconnect: () => call("/api/whoop", { method: "DELETE" }),
  weighIn: (date: string, kg: number) => call("/api/weighin", { method: "POST", body: JSON.stringify({ date, kg }) }),
  saveTrips: (trips: Trip[]) => call("/api/trips", { method: "PUT", body: JSON.stringify(trips) }),
  pushTravel: (sessions: PlannedSession[], unit: "lb" | "kg") => call<{ pushed: { title: string }[] }>("/api/routines/travel", { method: "POST", body: JSON.stringify({ sessions, unit }) }),
  saveNotes: (id: string, edit: { description: string; exercises: (string | null)[] }) =>
    call<{ ok: true; demo?: boolean; local?: boolean }>(`/api/workouts/${encodeURIComponent(id)}/notes`, { method: "PUT", body: JSON.stringify(edit) }),
  tokens: () => call<AppTokenInfo[]>("/api/tokens"),
  createToken: (name: string) => call<{ id: string; name: string; token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => call("/api/tokens/" + encodeURIComponent(id), { method: "DELETE" }),
  setMode: (mode: "local" | "demo") => call<{ mode: Bootstrap["mode"] }>("/api/mode", { method: "PUT", body: JSON.stringify({ mode }) }),
  importStrong: (body: { csv: string; unit?: "kg" | "lb"; preview?: boolean }) => call<StrongImportResult>("/api/import/strong", { method: "POST", body: JSON.stringify(body) }),
  templates: () => call<{ id: string; title: string; equipment?: string }[]>("/api/templates"),
  programs: () => call<AppProgramList>("/api/app/programs"),
  programDetail: (id: string, opts: Record<string, string> = {}) =>
    call<ProgramDetail>(`/api/app/programs/${encodeURIComponent(id)}${Object.keys(opts).length ? "?" + Object.entries(opts).map(([k, v]) => `opt.${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : ""}`),
  /** the web draws the figure itself, so it skips the SVGs (svg=0) */
  programBody: (id: string, opts: Record<string, string> = {}, days: number[] | null = null) =>
    call<ProgramBody>(`/api/app/programs/${encodeURIComponent(id)}/body?svg=0${days?.length ? `&days=${days.join(",")}` : ""}${Object.entries(opts).map(([k, v]) => `&opt.${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("")}`),
  /** do `to` instead of `lift` everywhere the program has it (null undoes the swap) */
  /** skip the program's next session ({dayId}) or undo the last skip ({undo: true}) */
  skipWorkout: (body: { dayId: string } | { undo: true }) => call<{ ok: true; message: string }>("/api/app/program/skip", { method: "POST", body: JSON.stringify(body) }),
  swapLift: (lift: string, to: string | null) => call<{ ok: true; program: AppProgram }>("/api/app/program/swap", { method: "POST", body: JSON.stringify({ lift, to }) }),
  startProgram: (id: string, body: StartBody) => call<{ ok: true; program: AppProgram }>(`/api/app/programs/${encodeURIComponent(id)}/start`, { method: "POST", body: JSON.stringify(body) }),
};
export type { ProgramBody, ProgramDetail };

// ── social (docs/social/PROTOCOL.md §6) ──
export type { Compare, FeedItem, Friend, Notification, Share, SocialMe, SocialProfile, Author };
export type AuthoredItem = FeedItem & { author: Author & { unit: "kg" | "lb" | null }; unit: "kg" | "lb" | null };
export interface SocialFeed { items: AuthoredItem[]; next: string | null; stale: string[]; unreachable?: string[] }

const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v != null && v !== false && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v === true ? 1 : v))}`);
  return p.length ? `?${p.join("&")}` : "";
};
const J = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const social = {
  me: () => call<SocialMe>("/api/social/me"),
  setup: (b: { handle: string; name: string; listed: boolean }) => call<{ ok: true; handle: string }>("/api/social/setup", J("POST", b)),
  unregister: () => call("/api/social/setup", J("DELETE")),
  search: (q: string) => call<{ users: { handle: string; name: string | null; server: string }[] }>(`/api/social/search${qs({ q })}`),
  friends: () => call<{ friends: Friend[] }>("/api/social/friends"),
  add: (b: { handle?: string; server?: string; note?: string; share: Share }) => call<{ friend: Friend }>("/api/social/friends", J("POST", b)),
  accept: (id: string, share: Share) => call<{ friend: Friend }>(`/api/social/friends/${id}/accept`, J("POST", { share })),
  reject: (id: string) => call(`/api/social/friends/${id}/reject`, J("POST")),
  setShare: (id: string, share: Share) => call<{ friend: Friend }>(`/api/social/friends/${id}`, J("PUT", { share })),
  remove: (id: string) => call<{ ok: true; notified: boolean }>(`/api/social/friends/${id}`, J("DELETE")),
  feed: (o: { before?: string | null; fresh?: boolean } = {}) => call<SocialFeed>(`/api/social/feed${qs(o)}`),
  profile: (id: string, fresh?: boolean) => call<{ profile: SocialProfile; stale: boolean }>(`/api/social/friends/${id}/profile${qs({ fresh })}`),
  friendFeed: (id: string, o: { before?: string | null; fresh?: boolean } = {}) => call<SocialFeed>(`/api/social/friends/${id}/feed${qs(o)}`),
  compare: (id: string, fresh?: boolean) => call<Compare & { stale: boolean }>(`/api/social/compare/${id}${qs({ fresh })}`),
  mine: (before?: string | null) => call<{ items: FeedItem[]; next: string | null; unit: "kg" | "lb" | null }>(`/api/social/mine${qs({ before, limit: 50 })}`),
  react: (friend: string, item: string, emoji: string | null) => call("/api/social/react", J("POST", { friend, item, emoji })),
  comment: (friend: string, item: string, text: string) => call("/api/social/comment", J("POST", { friend, item, text })),
  notifications: () => call<{ items: Notification[]; unread: number }>("/api/social/notifications"),
  readAll: () => call("/api/social/notifications/read", J("POST")),
};
