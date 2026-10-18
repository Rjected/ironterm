import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedAddressError, guardedLookup, peerFetch } from "./peerfetch";

let srv: Server;
const PORT = 8651;

beforeAll(async () => {
  srv = createServer((_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"secret":"internal"}'); });
  await new Promise<void>((r) => srv.listen(PORT, "127.0.0.1", r));
});
afterAll(() => new Promise<void>((r) => srv.close(() => r())));

describe("peerFetch (self-hosted social fetch)", () => {
  it("refuses literal private addresses", async () => {
    for (const u of [`http://127.0.0.1:${PORT}/`, `http://[::1]:${PORT}/`, "http://169.254.169.254/latest/meta-data", "https://10.0.0.1/", "http://[::ffff:127.0.0.1]:8651/", "http://2130706433:8651/"]) {
      await expect(peerFetch(u), u).rejects.toBeInstanceOf(BlockedAddressError);
    }
  });

  it("refuses names that resolve to private addresses (checked at connect time)", async () => {
    await expect(peerFetch(`http://localhost:${PORT}/`)).rejects.toThrow(/private or local/);
    const err = await new Promise<Error | null>((r) => guardedLookup("localhost", {}, (e) => r(e)));
    expect(err).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses other protocols", async () => {
    await expect(peerFetch("file:///etc/passwd")).rejects.toThrow(/protocol/);
  });
});
