#!/usr/bin/env python3
"""Local stand-in for an Ironterm server, for testing the iOS app without real credentials.

  python3 ios/Tools/mock_server.py [port]          (default 8787, binds 127.0.0.1)

  GET  /api/snapshot  Bearer ht_test_good -> docs/api/snapshot.sample.json, anything else -> 401
  POST /api/sync      Bearer ht_test_good -> {"ok":true}
  POST /auth/app      form token=ht_test_good&next=/ -> 302 next + session cookie, else 401
  GET  /              a tiny "web app" page (shows whether the session cookie is set)
Every request is logged to stdout with the Authorization header's token prefix.
"""
import json, os, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GOOD = "ht_test_good"
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "..", "Shared", "Resources", "snapshot.sample.json")
APP_DIR = os.environ.get("MOCK_APP_DIR") or os.path.join(HERE, "..", "..", "docs", "api", "app")


def app_doc(path):
    """/api/app/programs/gzclp -> <APP_DIR>/programs-gzclp.json, or None."""
    name = path[len("/api/app/"):].strip("/").replace("/", "-")
    f = os.path.join(APP_DIR, name + ".json")
    if not name or ".." in name or not os.path.isfile(f):
        return None
    with open(f, "rb") as fh:
        return fh.read()


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        auth = self.headers.get("Authorization", "")
        sys.stdout.write("%s %s auth=%s\n" % (self.command, self.path, auth[:14]))
        sys.stdout.flush()

    def send(self, code, body, ctype="application/json", headers=()):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def bearer_ok(self):
        return self.headers.get("Authorization") == "Bearer " + GOOD

    def unauthorized(self):
        self.send(401, json.dumps({"error": "login required", "auth": "google"}))

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/snapshot":
            if not self.bearer_ok():
                return self.unauthorized()
            with open(SAMPLE, "rb") as f:
                return self.send(200, f.read())
        if path.startswith("/api/app/"):
            if not self.bearer_ok():
                return self.unauthorized()
            # ?mode=gaps → <name>-gaps.json first (programs/gzclp/body?mode=gaps → programs-gzclp-body-gaps.json)
            mode = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("mode", [""])[0]
            doc = (app_doc(path + "-" + mode) if mode.isalpha() else None) or app_doc(path)
            return self.send(200, doc) if doc is not None else self.send(404, json.dumps({"error": "not found"}))
        if path in ("/", "/lifts"):
            signed = "ht_session=ok" in (self.headers.get("Cookie") or "")
            html = f"""<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{{background:#000;color:#dcdcdc;font:14px ui-monospace,Menlo,monospace;margin:16px}}h1{{color:#ffb000;font-size:16px}}
a{{color:#8cb4ff}}.ok{{color:#8cb4ff}}.no{{color:#ff6b5e}}</style></head><body>
<h1>IRONTERM · MOCK WEB APP</h1><p>path: {path}</p>
<p class="{'ok' if signed else 'no'}">session: {'SIGNED IN via POST /auth/app' if signed else 'NOT SIGNED IN'}</p>
<p><a href="/lifts">same-origin link (stays in app)</a></p>
<p><a href="https://example.com/">external link (opens Safari)</a></p></body></html>"""
            return self.send(200, html, "text/html; charset=utf-8")
        self.send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode() if n else ""
        if path == "/api/sync":
            return self.send(200, '{"ok":true}') if self.bearer_ok() else self.unauthorized()
        if path.startswith("/api/app/programs/") and path.endswith("/start"):
            if not self.bearer_ok():
                return self.unauthorized()
            sys.stdout.write("  start body=%s\n" % body)
            prog = app_doc("/api/app/program") or b'{"program":null}'
            return self.send(200, b'{"ok":true,"program":' + prog + b"}")
        if path == "/auth/app":
            form = urllib.parse.parse_qs(body)
            sys.stdout.write("  /auth/app form keys=%s token_ok=%s\n" % (sorted(form), form.get("token") == [GOOD]))
            if form.get("token") != [GOOD]:
                return self.unauthorized()
            nxt = form.get("next", ["/"])[0]
            if not nxt.startswith("/"):
                nxt = "/"
            return self.send(302, "", "text/plain", [("Location", nxt), ("Set-Cookie", "ht_session=ok; Path=/; HttpOnly")])
        self.send(404, json.dumps({"error": "not found"}))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"mock server on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
