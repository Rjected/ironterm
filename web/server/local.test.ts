import { describe, expect, it } from "vitest";
import { hostName, isLocal } from "./local";

const req = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers });

describe("isLocal (no-login mode)", () => {
  it("accepts a loopback connection to a loopback host", () => {
    expect(isLocal(req("127.0.0.1", { host: "localhost:8787" }))).toBe(true);
    expect(isLocal(req("::1", { host: "[::1]:8787" }))).toBe(true);
    expect(isLocal(req("::ffff:127.0.0.1", { host: "127.0.0.1" }))).toBe(true);
  });

  it("rejects other machines", () => {
    expect(isLocal(req("192.168.1.20", { host: "localhost:8787" }))).toBe(false);
    expect(isLocal(req("10.0.0.5", { host: "127.0.0.1:8787" }))).toBe(false);
  });

  it("rejects DNS rebinding: loopback socket, attacker's Host", () => {
    expect(isLocal(req("127.0.0.1", { host: "evil.example:8787" }))).toBe(false);
    expect(isLocal(req("127.0.0.1", { host: "localhost.evil.example" }))).toBe(false);
    expect(isLocal(req("127.0.0.1", {}))).toBe(false);
  });

  it("rejects proxy headers, which a rebinding page can set itself", () => {
    for (const h of ["x-forwarded-host", "x-forwarded-for", "x-forwarded-proto", "x-real-ip", "forwarded"]) {
      expect(isLocal(req("127.0.0.1", { host: "localhost:8787", [h]: "localhost" }))).toBe(false);
    }
  });

  it("parses Host headers", () => {
    expect(hostName("LocalHost:80")).toBe("localhost");
    expect(hostName("[::1]:8787")).toBe("[::1]");
    expect(hostName("example.com")).toBe("example.com");
  });
});
