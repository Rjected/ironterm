import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { NodeD1 } from "./d1";
import { BodyTooLarge, bodyLimit, capStream, declaredTooLarge, DEFAULT_MAX, IMPORT_MAX } from "./bodylimit";

const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

/** A streamed body of `chunks` × `size` bytes with no Content-Length, like a chunked upload. */
const stream = (chunks: number, size: number) => new ReadableStream<Uint8Array>({
  pull(c) { if (chunks-- <= 0) c.close(); else c.enqueue(new Uint8Array(size).fill(0x20)); },
});

describe("request body caps (self-hosted)", () => {
  it("picks the import cap only for the Strong import", () => {
    expect(bodyLimit("/api/import/strong")).toBe(IMPORT_MAX);
    expect(bodyLimit("/api/whoop/webhook")).toBe(DEFAULT_MAX);
    expect(bodyLimit("/social/v1/inbox")).toBe(DEFAULT_MAX);
    expect(declaredTooLarge(String(DEFAULT_MAX + 1), DEFAULT_MAX)).toBe(true);
    expect(declaredTooLarge(undefined, DEFAULT_MAX)).toBe(false);
  });

  it("passes small bodies through untouched", async () => {
    expect(await new Response(capStream(stream(3, 10), 100)).text()).toBe(" ".repeat(30));
  });

  it("errors a stream that grows past the cap", async () => {
    await expect(new Response(capStream(stream(10, 1000), 5000)).text()).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("the worker answers 413 when a capped body overflows mid-read", async () => {
    const body = capStream(stream(30, 100_000), DEFAULT_MAX);
    const req = new Request("http://localhost/api/whoop/webhook", { method: "POST", body, duplex: "half" } as RequestInit);
    const r = await worker.fetch!(req as never, env, ctx);
    expect(r.status).toBe(413);
  });
});
