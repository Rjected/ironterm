// Request body caps for the self-hosted server. Workers caps bodies at the platform level; plain
// Node doesn't, and several endpoints read a body before (or without) a login: the webhooks, the
// password and app-token sign-ins, the social inbox. So every body is capped while it streams.

/** The Strong CSV import is the one big upload (the worker allows 50 MB of CSV inside JSON). */
export const IMPORT_MAX = 60_000_000;
/** Everything else is a small JSON document or form. */
export const DEFAULT_MAX = 2_000_000;

export const bodyLimit = (path: string) => (path === "/api/import/strong" ? IMPORT_MAX : DEFAULT_MAX);

export class BodyTooLarge extends Error {
  override name = "BodyTooLarge";
  constructor(public max: number) { super(`Request body too large (max ${max} bytes).`); }
}

/** Passes bytes through until `max`, then errors the stream (the reader sees BodyTooLarge). */
export function capStream(body: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> {
  let n = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      n += chunk.byteLength;
      if (n > max) ctl.error(new BodyTooLarge(max));
      else ctl.enqueue(chunk);
    },
  }));
}

/** A declared Content-Length over the cap: refuse before reading anything. */
export const declaredTooLarge = (contentLength: string | undefined, max: number) => Number(contentLength ?? 0) > max;
