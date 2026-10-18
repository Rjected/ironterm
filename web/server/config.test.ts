import { describe, expect, it } from "vitest";
import { checkDirectoryConfig, checkServerConfig, dataDirError, listenError } from "./config";

describe("self-hosting config", () => {
  it("accepts the documented setups quietly", () => {
    expect(checkServerConfig({})).toEqual({ errors: [], warnings: [] });
    expect(checkServerConfig({ PORT: "8787", TIMEZONE: "Europe/London", SYNC_MINUTES: "0", APP_PASSWORD: "x", SESSION_SECRET: "y" })).toEqual({ errors: [], warnings: [] });
    expect(checkServerConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", SESSION_SECRET: "c", ALLOWED_EMAILS: "me@example.com" }).warnings).toEqual([]);
    expect(checkDirectoryConfig({ DIRECTORY_ORIGIN: "https://directory.example.com" })).toEqual({ errors: [], warnings: [] });
  });

  it("stops on values that would break things, saying what to fix", () => {
    const r = checkServerConfig({ PORT: "eighty", TIMEZONE: "America/New Yrok", SYNC_MINUTES: "15m", SOCIAL_DIRECTORY: "directory.example.com" });
    expect(r.errors.join("\n")).toMatch(/PORT must be a number/);
    expect(r.errors.join("\n")).toMatch(/TIMEZONE "America\/New Yrok"/);
    expect(r.errors.join("\n")).toMatch(/SYNC_MINUTES must be a number/);
    expect(r.errors.join("\n")).toMatch(/SOCIAL_DIRECTORY must be a URL/);
    expect(r.errors.at(-1)).toMatch(/SELF_HOSTING/);
    expect(checkDirectoryConfig({ PORT: "70000" }).errors[0]).toMatch(/PORT/);
  });

  it("warns when a half-configured feature is silently off", () => {
    expect(checkServerConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }).warnings[0]).toMatch(/missing SESSION_SECRET, ALLOWED_EMAILS/);
    expect(checkServerConfig({ WHOOP_CLIENT_ID: "a" }).warnings[0]).toMatch(/WHOOP/);
    expect(checkServerConfig({ HEVY_API_KEY: "abc\n" }).warnings[0]).toMatch(/whitespace/);
    expect(checkDirectoryConfig({}).warnings[0]).toMatch(/DIRECTORY_ORIGIN/);
  });

  it("explains listen and data-dir failures", () => {
    const err = (code: string) => Object.assign(new Error(code), { code });
    expect(listenError(err("EADDRINUSE"), 8787, "0.0.0.0")).toMatch(/already in use.*set PORT/);
    expect(listenError(err("EACCES"), 80, "0.0.0.0")).toMatch(/below 1024/);
    expect(dataDirError(err("EACCES"), "/data")).toMatch(/writable/);
  });
});
