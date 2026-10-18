import type { HevyWorkout } from "../shared/hevy";
import type { ProgramConfig } from "../shared/program";
import type { Settings } from "../worker/index";
import type { SyncState } from "../worker/sync";
import type { LiveSession } from "../shared/live";
import type { WhoopData } from "../shared/whoop";
import type { Trip } from "../shared/travel";
import type { PlannedSession } from "../shared/program";

export type { Settings };

export interface Bootstrap {
  mode: "demo" | "live";
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
  finishLive: (s: LiveSession) => call<{ workout: { id: string }; demo?: boolean }>("/api/live/finish", { method: "POST", body: JSON.stringify(s) }),
  whoopSync: () => call<{ workouts: number; recoveries: number }>("/api/whoop/sync", { method: "POST" }),
  whoopDisconnect: () => call("/api/whoop", { method: "DELETE" }),
  weighIn: (date: string, kg: number) => call("/api/weighin", { method: "POST", body: JSON.stringify({ date, kg }) }),
  saveTrips: (trips: Trip[]) => call("/api/trips", { method: "PUT", body: JSON.stringify(trips) }),
  pushTravel: (sessions: PlannedSession[], unit: "lb" | "kg") => call<{ pushed: { title: string }[] }>("/api/routines/travel", { method: "POST", body: JSON.stringify({ sessions, unit }) }),
  saveNotes: (id: string, edit: { description: string; exercises: (string | null)[] }) =>
    call<{ ok: true; demo?: boolean }>(`/api/workouts/${encodeURIComponent(id)}/notes`, { method: "PUT", body: JSON.stringify(edit) }),
  tokens: () => call<AppTokenInfo[]>("/api/tokens"),
  createToken: (name: string) => call<{ id: string; name: string; token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => call("/api/tokens/" + encodeURIComponent(id), { method: "DELETE" }),
  templates: () => call<{ id: string; title: string; equipment?: string }[]>("/api/templates"),
};
