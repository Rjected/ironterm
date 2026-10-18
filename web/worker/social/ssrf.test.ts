import { describe, expect, it } from "vitest";
import { isPrivateAddress, literalHostPrivate } from "./ssrf";
import { MAX_SMALL, PeerError, peerJson, readLimited } from "./net";

describe("isPrivateAddress", () => {
  it("blocks private, loopback, link-local and other non-public IPv4", () => {
    for (const ip of ["127.0.0.1", "127.255.0.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.1.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "100.128.0.1", "93.184.216.34", "172.15.255.255"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("blocks private IPv6 and IPv4 hidden in IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1%eth0", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:10.0.0.1]", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "::127.0.0.1", "2001:db8::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public IPv6", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "[2a00:1450::1]"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("fails closed on garbage", () => {
    for (const ip of ["", "nope", "1.2.3", "1.2.3.256", "1:2:3:4:5:6:7:8:9", "::g", "1::2::3"]) expect(isPrivateAddress(ip), ip).toBe(true);
  });
});

describe("literalHostPrivate", () => {
  it("judges literal IPs as URL parsing leaves them", () => {
    expect(literalHostPrivate(new URL("https://127.1/").hostname)).toBe(true); // → 127.0.0.1
    expect(literalHostPrivate(new URL("https://0x7f000001/").hostname)).toBe(true);
    expect(literalHostPrivate(new URL("https://2130706433/").hostname)).toBe(true);
    expect(literalHostPrivate(new URL("https://[::ffff:127.0.0.1]/").hostname)).toBe(true);
    expect(literalHostPrivate(new URL("https://[::1]:8443/").hostname)).toBe(true);
    expect(literalHostPrivate("localhost")).toBe(true);
    expect(literalHostPrivate("app.localhost.")).toBe(true);
    expect(literalHostPrivate("8.8.8.8")).toBe(false);
  });
  it("leaves names to DNS resolution", () => {
    expect(literalHostPrivate("gym.example.com")).toBeNull();
  });
});

describe("response limits", () => {
  const stream = (chunks: number, size: number) => new ReadableStream<Uint8Array>({
    pull(c) { if (chunks-- <= 0) c.close(); else c.enqueue(new Uint8Array(size).fill(32)); },
  });

  it("reads small bodies", async () => {
    expect(await peerJson(new Response('{"a":1}'))).toEqual({ a: 1 });
    expect(await peerJson(new Response("not json"))).toBeNull();
  });
  it("refuses a body over the limit even without Content-Length", async () => {
    await expect(readLimited(new Response(stream(100, 1024)), MAX_SMALL)).rejects.toBeInstanceOf(PeerError);
    expect(await peerJson(new Response(stream(100, 1024)), MAX_SMALL)).toBeNull();
  });
  it("refuses a declared oversize body without reading it", async () => {
    const r = new Response("{}", { headers: { "content-length": "99999999" } });
    await expect(readLimited(r, MAX_SMALL)).rejects.toThrow(/too large/);
  });
});
