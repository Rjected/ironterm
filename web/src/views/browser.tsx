// Program browser: filter and pick from every template, with a week-1 preview.

import { useMemo, useState } from "preact/hooks";
import { initialState, isScheduled, planDay, type ProgramCategory, type ProgramTemplate } from "../../shared/program";
import { defaultConfig, TEMPLATES } from "../../shared/programs";
import type { Unit } from "../../shared/units";
import { Seg, SessionTicket } from "../ui";

const CATS: [ProgramCategory | "all", string][] = [
  ["all", "ALL"], ["gzcl", "GZCL"], ["novice", "NOVICE"], ["strength", "STRENGTH"], ["powerlifting", "PL"], ["hypertrophy", "HYPERTROPHY"], ["peaking", "PEAKING"],
];

const meta = (t: ProgramTemplate) =>
  [`${t.daysPerWeek.join("/")}D/WK`, t.weeks ? `${t.weeks} WK` : "ONGOING", t.level.toUpperCase()].join(" · ");

export function ProgramBrowser(props: { selected: string; unit: Unit; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<ProgramCategory | "all">("all");
  const [days, setDays] = useState<number | 0>(0);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return TEMPLATES.filter((p) =>
      (cat === "all" || p.category === cat) &&
      (!days || p.daysPerWeek.includes(days)) &&
      (!t || `${p.name} ${p.author} ${p.summary}`.toLowerCase().includes(t)),
    );
  }, [cat, days, q]);
  const counts = useMemo(() => Object.fromEntries(CATS.map(([c]) => [c, c === "all" ? TEMPLATES.length : TEMPLATES.filter((p) => p.category === c).length])), []);

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <div class="seg" role="group">
          {CATS.filter(([c]) => counts[c]).map(([c, l]) => (
            <button class={c === cat ? "on" : ""} onClick={() => setCat(c)}>{l} <span class="faint">{counts[c]}</span></button>
          ))}
        </div>
        <Seg value={String(days)} onChange={(v) => setDays(Number(v))} options={[["0", "ANY"], ["2", "2D"], ["3", "3D"], ["4", "4D"], ["5", "5D"], ["6", "6D"]]} />
        <input class="inp" id="prog-q" style={{ width: "200px" }} placeholder="search: smolov, sheiko, ppl…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <span class="faint" style={{ fontSize: "var(--fs-s)" }}>{list.length} programs</span>
      </div>
      <div class="cards">
        {list.map((t) => (
          <button class={`card ${t.id === props.selected ? "on" : ""}`} onClick={() => props.onPick(t.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
              <h4>{t.name}</h4>
              <span class="faint" style={{ fontSize: "10px", letterSpacing: ".06em" }}>{t.category.toUpperCase()}</span>
            </div>
            <p class="am" style={{ fontSize: "10px", letterSpacing: ".06em" }}>{meta(t)}</p>
            <p>{t.summary}</p>
            <p class="faint">{t.author}</p>
          </button>
        ))}
        {!list.length && <div class="empty" style={{ padding: "16px" }}>No programs match.</div>}
      </div>
    </div>
  );
}

/** First week of a template with its default values, so you can see what you're signing up for. */
export function ProgramPreview(props: { template: ProgramTemplate; options: Record<string, string>; unit: Unit }) {
  const cfg = { ...defaultConfig(props.template.id, props.unit, "2000-01-01"), options: props.options };
  const def = props.template.build(props.options);
  const state = initialState(def, cfg);
  const days = def.days.map((d, i) => ({ d, i })).filter(({ d }) => isScheduled(d, 0));
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div class="note">
        {def.name} · week 1 of {def.cycle?.finite ? def.cycle.weeks : "an ongoing"}{def.cycle?.finite ? "" : " program"} · {days.length} sessions · loads use example {def.maxLabel ?? "maxes"}
      </div>
      {def.notes?.length ? <ul class="note" style={{ margin: 0, paddingLeft: "18px" }}>{def.notes.map((n) => <li>{n}</li>)}</ul> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0", borderTop: "1px solid var(--line)", borderLeft: "1px solid var(--line)" }}>
        {days.map(({ d, i }) => (
          <div style={{ borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "10px", minWidth: 0 }}>
            <div class="am" style={{ fontSize: "var(--fs-s)", marginBottom: "6px" }}>{d.id} <span class="faint">{d.name}</span></div>
            <SessionTicket s={planDay(def, cfg, state, i)} unit={props.unit} />
          </div>
        ))}
      </div>
    </div>
  );
}
