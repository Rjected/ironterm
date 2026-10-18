// Failed-password throttling for /api/login. Per client address, plus a global ceiling so an
// attacker spreading guesses over many addresses still gets few of them. Only failures count, so
// the owner typing the right password is never slowed down by their own earlier success.

import { kvGet, kvPut } from "./store";

interface Window { n: number; reset: number }

/** [max failures, window seconds] */
export const LOGIN_LIMITS = { ip: [10, 15 * 60], all: [200, 60 * 60] } as const;

const key = (scope: string) => `ratelimit:login:${scope}`;

async function read(db: D1Database, scope: string): Promise<Window | null> {
  const w = await kvGet<Window>(db, key(scope));
  return w && w.reset > Date.now() ? w : null;
}

/** Seconds until another try is allowed, or 0 when the client may try now. */
export async function loginBlocked(db: D1Database, ip: string): Promise<number> {
  const now = Date.now();
  for (const [scope, max] of [[`ip:${ip}`, LOGIN_LIMITS.ip[0]], ["all", LOGIN_LIMITS.all[0]]] as const) {
    const w = await read(db, scope);
    if (w && w.n >= max) return Math.ceil((w.reset - now) / 1000);
  }
  return 0;
}

export async function loginFailed(db: D1Database, ip: string): Promise<void> {
  for (const [scope, win] of [[`ip:${ip}`, LOGIN_LIMITS.ip[1]], ["all", LOGIN_LIMITS.all[1]]] as const) {
    const w = (await read(db, scope)) ?? { n: 0, reset: Date.now() + win * 1000 };
    await kvPut(db, key(scope), { n: w.n + 1, reset: w.reset });
  }
}

/** A correct password clears that address's count (not the global one). */
export const loginSucceeded = (db: D1Database, ip: string) => kvPut(db, key(`ip:${ip}`), null);

/** The client address: Cloudflare sets cf-connecting-ip; the Node server sets it from the socket. */
export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? "unknown";
