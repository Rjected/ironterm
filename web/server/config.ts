// Self-hosting configuration checks: a typo in an environment variable should stop the server
// with a sentence saying what to fix, not a stack trace (or worse, silently turn a feature off).

export interface ConfigReport { errors: string[]; warnings: string[] }
type Env = Record<string, string | undefined>;

const DOC = "see web/SELF_HOSTING.md";

function validZone(tz: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function checkPort(env: Env, out: ConfigReport) {
  const p = env.PORT;
  if (p != null && p !== "" && (!/^\d+$/.test(p) || Number(p) < 1 || Number(p) > 65535)) out.errors.push(`PORT must be a number from 1 to 65535 (got "${p}").`);
}

function checkOrigin(name: string, v: string | undefined, out: ConfigReport) {
  if (!v) return;
  let u: URL | null = null;
  try { u = new URL(v); } catch { /* reported below */ }
  if (!u || (u.protocol !== "https:" && u.protocol !== "http:")) out.errors.push(`${name} must be a URL like https://example.com (got "${v}").`);
}

/** The app server (server/main.ts). */
export function checkServerConfig(env: Env): ConfigReport {
  const out: ConfigReport = { errors: [], warnings: [] };
  checkPort(env, out);
  if (env.TIMEZONE && !validZone(env.TIMEZONE)) out.errors.push(`TIMEZONE "${env.TIMEZONE}" isn't a time zone this system knows. Use an IANA name like Europe/London or America/New_York.`);
  const sync = env.SYNC_MINUTES;
  if (sync != null && sync !== "" && (!/^\d+(\.\d+)?$/.test(sync))) out.errors.push(`SYNC_MINUTES must be a number of minutes, or 0 to turn background sync off (got "${sync}").`);
  else if (sync && Number(sync) > 0 && Number(sync) < 1) out.warnings.push(`SYNC_MINUTES=${sync} syncs more than once a minute; Hevy may rate-limit that.`);

  const google = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "ALLOWED_EMAILS"];
  // (SESSION_SECRET and ALLOWED_EMAILS also serve the password and Access logins)
  const set = google.filter((k) => env[k]);
  if ((env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET) && set.length < google.length) {
    out.warnings.push(`Google sign-in is off: it needs all of ${google.join(", ")} (missing ${google.filter((k) => !env[k]).join(", ")}).`);
  }
  if (env.ACCESS_AUD && !env.ACCESS_TEAM_DOMAIN) out.warnings.push("ACCESS_AUD is set without ACCESS_TEAM_DOMAIN, so Cloudflare Access tokens can't be checked.");
  if (env.WHOOP_CLIENT_ID && !env.WHOOP_CLIENT_SECRET) out.warnings.push("WHOOP is off: WHOOP_CLIENT_ID is set but WHOOP_CLIENT_SECRET isn't.");
  if (env.HEVY_API_KEY && /\s/.test(env.HEVY_API_KEY)) out.warnings.push("HEVY_API_KEY contains whitespace; check for a stray space or newline.");
  checkOrigin("SOCIAL_DIRECTORY", env.SOCIAL_DIRECTORY, out);
  checkOrigin("SOCIAL_ORIGIN", env.SOCIAL_ORIGIN, out);
  return finish(out);
}

/** The directory server (server/directory.ts). */
export function checkDirectoryConfig(env: Env): ConfigReport {
  const out: ConfigReport = { errors: [], warnings: [] };
  checkPort(env, out);
  checkOrigin("DIRECTORY_ORIGIN", env.DIRECTORY_ORIGIN, out);
  if (!env.DIRECTORY_ORIGIN) out.warnings.push("DIRECTORY_ORIGIN isn't set: signed requests are checked against whatever host each request names. Set it to the public URL servers use to reach this directory.");
  return finish(out);
}

function finish(out: ConfigReport) {
  if (out.errors.length) out.errors.push(`(${DOC})`);
  return out;
}

/** Errors for `listen` failures people actually hit. */
export function listenError(e: NodeJS.ErrnoException, port: number, host: string): string {
  if (e.code === "EADDRINUSE") return `Port ${port} is already in use on ${host}. Stop the other process or set PORT to a free port.`;
  if (e.code === "EACCES") return `Not allowed to listen on port ${port}${port < 1024 ? " (ports below 1024 need extra privileges; use e.g. 8787 behind a reverse proxy)" : ""}.`;
  if (e.code === "EADDRNOTAVAIL") return `HOST ${host} isn't an address of this machine. Use 0.0.0.0 (all) or 127.0.0.1 (this machine only).`;
  return `Couldn't listen on ${host}:${port}: ${e.message}`;
}

/** Errors for the data directory. */
export function dataDirError(e: NodeJS.ErrnoException, dir: string): string {
  if (e.code === "EACCES" || e.code === "EPERM" || e.code === "EROFS") return `Can't write to DATA_DIR ${dir} (${e.code}). Point DATA_DIR at a writable directory, or fix its owner (in Docker: the volume's).`;
  if (e.code === "ENOTDIR" || e.code === "EEXIST") return `DATA_DIR ${dir} exists but isn't a directory.`;
  return `Can't open the database in ${dir}: ${e.message}`;
}
