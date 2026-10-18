// Self-hosted Ironterm social directory on Node + SQLite (the same code as directory/worker.ts).
//
//   pnpm build:directory && pnpm start:directory
//   PORT=8790 DATA_DIR=./data DIRECTORY_ORIGIN=https://directory.example.com
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import directory from "../directory/worker";
import { NodeD1 } from "./d1";
import { checkDirectoryConfig, dataDirError, listenError } from "./config";

const report = checkDirectoryConfig(process.env);
for (const w of report.warnings) console.warn(`config: ${w}`);
if (report.errors.length) {
  for (const e of report.errors) console.error(`config: ${e}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA = resolve(process.env.DATA_DIR ?? "./data");
let DB!: NodeD1;
try {
  mkdirSync(DATA, { recursive: true });
  DB = new NodeD1(join(DATA, "directory.sqlite"));
} catch (e) {
  console.error(`config: ${dataDirError(e as NodeJS.ErrnoException, DATA)}`);
  process.exit(1);
}

const env: Record<string, unknown> = { DB };
for (const k of ["DIRECTORY_ORIGIN", "SOCIAL_ALLOW_HTTP"]) if (process.env[k]) env[k] = process.env[k];
// Behind a proxy, rate limits key on its forwarded client address; set TRUST_PROXY=1 only then.
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

function toRequest(req: IncomingMessage): Request {
  const proto = TRUST_PROXY ? ((req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? "http") : "http";
  const host = (TRUST_PROXY ? (req.headers["x-forwarded-host"] as string) : null) ?? req.headers.host ?? `localhost:${PORT}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null && k !== "cf-connecting-ip") for (const x of Array.isArray(v) ? v : [v]) headers.append(k, x);
  const fwd = TRUST_PROXY ? (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() : null;
  headers.set("cf-connecting-ip", fwd || req.socket.remoteAddress || "unknown");
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream);
  return new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, body, duplex: "half" } as RequestInit);
}

async function send(res: ServerResponse, r: Response) {
  const h: Record<string, string> = {};
  r.headers.forEach((v, k) => { h[k] = v; });
  res.writeHead(r.status, h);
  res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
}

createServer(async (req, res) => {
  try { await send(res, await directory.fetch(toRequest(req) as never, env as never)); }
  catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
}).on("error", (e: NodeJS.ErrnoException) => {
  console.error(listenError(e, PORT, HOST));
  process.exit(1);
}).listen(PORT, HOST, () =>
 console.log(`ironterm directory on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT} · data ${DATA}`));

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
