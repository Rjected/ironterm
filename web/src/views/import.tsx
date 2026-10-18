import { useRef, useState } from "preact/hooks";
import { api, type StrongImportResult } from "../api";
import { Panel } from "../ui";
import { Picker } from "../components/picker";
import type { Unit } from "../../shared/units";

// SETUP → IMPORT: a Strong CSV export (Strong › Settings › Export Strong Data). Choose the file,
// check the preview (count, dates, unit, exercises we can't place), then IMPORT. Re-importing
// the same or a newer export only adds what's new.

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function ImportPanel(props: { n: string; unit: Unit; onDone: (msg: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<StrongImportResult | null>(null);
  const [unit, setUnit] = useState<Unit>(props.unit);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const check = async (text: string, u: Unit) => {
    const p = await api.importStrong({ csv: text, unit: u, preview: true });
    setPreview(p);
    if (p.unitDetected) setUnit(p.unitDetected);
  };
  const choose = async (f: File | undefined) => {
    setErr(null); setResult(null); setPreview(null);
    if (!f) return;
    setBusy(true);
    try {
      const text = await f.text();
      setCsv({ name: f.name, text });
      await check(text, unit);
    } catch (e) { setErr(String((e as Error).message ?? e)); setCsv(null); }
    setBusy(false);
  };
  // counts depend on the unit (a re-import in another unit changes every set)
  const changeUnit = (u: Unit) => { setUnit(u); if (csv) check(csv.text, u).catch((e) => setErr(String(e.message ?? e))); };

  const run = async () => {
    if (!csv) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.importStrong({ csv: csv.text, unit: preview?.unitDetected ?? unit });
      const msg = `Imported ${r.workouts} workouts from ${csv.name}: ${r.added} new, ${r.updated} updated, ${r.skipped} unchanged · ${day(r.from)} → ${day(r.to)}`;
      setResult(msg); setPreview(null); setCsv(null);
      if (file.current) file.current.value = "";
      props.onDone(msg);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    setBusy(false);
  };

  return (
    <Panel n={props.n} title="IMPORT" span={12} sub="Strong CSV · Strong › Settings › Export Strong Data">
      <div style={{ display: "grid", gap: "10px" }}>
        <div class="row" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input ref={file} id="strong-file" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => choose((e.target as HTMLInputElement).files?.[0])} />
          <button class="btn" disabled={busy} onClick={() => file.current?.click()}><em>↑</em>{csv ? "CHOOSE ANOTHER FILE" : "CHOOSE FILE"}</button>
          {csv && <span class="dim">{csv.name} · {(csv.text.length / 1e6).toFixed(csv.text.length > 1e6 ? 1 : 2)} MB</span>}
          {busy && <span class="am">READING…</span>}
        </div>

        {preview && (
          <div class="tbl-wrap">
            <table class="t">
              <tbody>
                <tr><td class="l dim">WORKOUTS</td><td class="l hi wrap">{preview.workouts} <span class="dim">({preview.added} new · {preview.updated} changed · {preview.skipped} already here)</span></td></tr>
                <tr><td class="l dim">DATES</td><td class="l">{day(preview.from)} → {day(preview.to)}</td></tr>
                <tr><td class="l dim">SETS</td><td class="l">{preview.rows - preview.ignoredRows}{preview.ignoredRows ? <span class="faint"> · {preview.ignoredRows} rest-timer rows skipped</span> : null}</td></tr>
                <tr>
                  <td class="l dim">WEIGHTS IN</td>
                  <td class="l">
                    {preview.unitDetected
                      ? <span>{preview.unitDetected.toUpperCase()} <span class="faint">(from the file's Weight Unit column)</span></span>
                      : <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                          <Picker id="strong-unit" label="Unit the Strong weights are in" value={unit} width="90px" options={[{ value: "lb", label: "LB" }, { value: "kg", label: "KG" }]} onChange={changeUnit} />
                          <span class="faint">the unit you use in Strong</span>
                        </span>}
                  </td>
                </tr>
                <tr>
                  <td class="l dim">NOT A LIBRARY LIFT</td>
                  <td class="l wrap">{preview.unmatchedExercises.length
                    ? <span class="dim">{preview.unmatchedExercises.join(" · ")} <span class="faint">(imported; they count for volume and the body map, not lift charts)</span></span>
                    : <span class="up">every exercise matched</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {preview && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button class="btn pri" disabled={busy} onClick={run}><em>⏎</em>IMPORT {preview.workouts} WORKOUTS</button>
            <button class="btn" disabled={busy} onClick={() => { setPreview(null); setCsv(null); if (file.current) file.current.value = ""; }}>CANCEL</button>
          </div>
        )}
        {err && <div class="warnbox">{err}</div>}
        {result && <div class="up">✓ {result}</div>}
        {!preview && !result && <p class="note">Your whole Strong history comes in as workouts, so the dashboard, lifts, program and body map all work from it. Importing a newer export later adds the new sessions; nothing is duplicated.</p>}
      </div>
    </Panel>
  );
}
