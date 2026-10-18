import { useEffect, useState } from "preact/hooks";
import { api, type AppTokenInfo } from "../api";
import { Panel } from "../ui";
import { QrCode } from "../components/qr";

// SETUP → APPS & WIDGETS: app tokens for the Android / iOS apps and their widgets.
// A token is shown once; the server keeps only its hash.

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function AppsPanel(props: { n: string }) {
  const [tokens, setTokens] = useState<AppTokenInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () => api.tokens().then(setTokens).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { load(); }, []);

  const origin = location.origin;
  const link = fresh ? `ironterm://connect?server=${encodeURIComponent(origin)}&token=${encodeURIComponent(fresh.token)}` : "";
  const create = async () => {
    setErr(null);
    try {
      const t = await api.createToken(name.trim() || "Phone");
      setFresh({ name: t.name, token: t.token }); setName(""); setCopied(false); load();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };
  const revoke = async (id: string, n: string) => {
    if (!confirm(`Revoke "${n}"? That app and its widgets stop updating until reconnected.`)) return;
    await api.revokeToken(id).catch((e) => setErr(String(e.message ?? e)));
    load();
  };
  const copy = async () => { await navigator.clipboard?.writeText(fresh!.token).catch(() => {}); setCopied(true); };

  return (
    <Panel n={props.n} title="APPS & WIDGETS" span={12} sub="connect the Android / iOS app; each device gets its own token">
      <div class="form" style={{ maxWidth: "none", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}>
        <div class="field">
          <label for="tok-name">NEW APP TOKEN</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <input class="inp" id="tok-name" placeholder="device name, e.g. Pixel" value={name} maxLength={40}
              onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && create()} />
            <button class="btn" onClick={create}>CREATE</button>
          </div>
          <div class="dim" style={{ fontSize: "var(--fs-s)" }}>
            Create a token, then scan the QR with the app (SETUP → SCAN QR). On the phone itself: open this page there and tap <b>OPEN IN APP</b>. Or type the server URL and token into the app's SETUP.
          </div>
        </div>
        {fresh && (
          <div class="field">
            <label>TOKEN FOR {fresh.name.toUpperCase()}: SHOWN ONCE</label>
            <div class="qr-wrap">
              <QrCode text={link} label={`Ironterm connect code for ${fresh.name}`} />
              <div class="dim" style={{ fontSize: "var(--fs-s)" }}>
                Scan with <b>Ironterm → SETUP → SCAN QR</b>. Your phone's camera app also opens it.
                Anyone who scans this can see your data, so don't share a screenshot of it.
              </div>
            </div>
            <div class="code" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>Server  {origin}{"\n"}Token   {fresh.token}</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <a class="btn" href={link} style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>OPEN IN APP</a>
              <button class="btn" onClick={copy}>{copied ? "COPIED" : "COPY TOKEN"}</button>
              <button class="btn" onClick={() => setFresh(null)}>DONE</button>
            </div>
          </div>
        )}
        <div class="field">
          <label>CONNECTED APPS</label>
          {err && <div class="warnbox">{err}</div>}
          {!tokens ? <div class="dim">loading…</div> : !tokens.length ? <div class="dim">none yet</div> : (
            <table class="t">
              <thead><tr><th class="l">DEVICE</th><th>CREATED</th><th>LAST USED</th><th /></tr></thead>
              <tbody>
                {tokens.map((t) => (
                  <tr>
                    <td class="l">{t.name}</td><td>{t.created.slice(0, 10)}</td><td>{ago(t.lastUsed)}</td>
                    <td><button class="btn" style={{ padding: "0 6px" }} onClick={() => revoke(t.id, t.name)}>REVOKE</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Panel>
  );
}
