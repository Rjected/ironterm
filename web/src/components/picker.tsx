import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { TEMPLATES } from "../../shared/programs";
import "../picker.css";

// Terminal-styled replacement for <select>: grouped options, type-to-filter on long lists,
// keyboard (↑ ↓ ⏎ esc), and a bottom sheet on phones. The native select's OS menu looked out of
// place (a white 60-row list) and couldn't be searched.

export interface PickOption<T extends string> {
  value: T;
  label: string;
  /** section header the option is listed under */
  group?: string;
  /** dim text on the right */
  hint?: string;
}

export function Picker<T extends string>(props: {
  value: T;
  options: PickOption<T>[];
  onChange: (v: T) => void;
  id?: string;
  label?: string; // aria-label
  /** show the search box (default: more than 10 options) */
  search?: boolean;
  width?: string;
  /** shown on the button instead of the option's label */
  display?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const current = props.options.find((o) => o.value === props.value);
  const searchable = props.search ?? props.options.length > 10;

  const shown = useMemo(() => {
    // "531" finds "5/3/1", "jt" doesn't need the ampersand: compare letters and digits only
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const words = q.trim().split(/\s+/).map(norm).filter(Boolean);
    if (!words.length) return props.options;
    return props.options.filter((o) => { const h = norm(`${o.label} ${o.group ?? ""} ${o.hint ?? ""}`); return words.every((w) => h.includes(w)); });
  }, [q, props.options]);

  const close = () => { setOpen(false); setQ(""); };
  const pick = (o: PickOption<T>) => { close(); if (o.value !== props.value) props.onChange(o.value); };

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, shown.findIndex((o) => o.value === props.value)));
    const away = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    // phones: the list is a sheet; desktop: focus the search box right away
    if (searchable && matchMedia("(min-width: 700px)").matches) setTimeout(() => searchBox.current?.focus(), 0);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[hi]) pick(shown[hi]); }
    // F-keys and "/" stay with the app's own shortcuts
    e.stopPropagation();
  };

  let lastGroup: string | undefined;
  return (
    <div class={`pick${open ? " open" : ""}`} ref={root} style={props.width ? { width: props.width } : undefined} onKeyDown={onKey}>
      <button type="button" class="inp pick-btn" id={props.id} aria-label={props.label} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span class="pick-val">{props.display ?? current?.label ?? "—"}</span>
        <span class="pick-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div class="pick-scrim" onClick={close} />
          <div class="pick-pop" role="listbox" aria-label={props.label}>
            <div class="pick-sheet-head"><span>{props.label ?? "SELECT"}</span><button type="button" class="pick-x" onClick={close} aria-label="Close">ESC</button></div>
            {searchable && (
              <input ref={searchBox} class="inp pick-q" placeholder={`filter ${props.options.length}…`} value={q}
                onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Filter" />
            )}
            <div class="pick-list" ref={list}>
              {shown.length === 0 && <div class="pick-empty">no match</div>}
              {shown.map((o, i) => {
                const head = o.group && o.group !== lastGroup && !q ? o.group : null;
                lastGroup = o.group;
                return (
                  <>
                    {head && <div class="pick-group">{head}</div>}
                    <div
                      role="option" aria-selected={o.value === props.value} data-i={i}
                      class={`pick-opt${i === hi ? " hi" : ""}${o.value === props.value ? " on" : ""}`}
                      onPointerMove={() => setHi(i)} onClick={() => pick(o)}
                    >
                      <span class="pick-mark">{o.value === props.value ? "●" : ""}</span>
                      <span class="pick-label">{o.label}</span>
                      {o.hint && <span class="pick-hint">{o.hint}</span>}
                    </div>
                  </>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CAT_ORDER = ["gzcl", "novice", "strength", "powerlifting", "hypertrophy", "peaking", "comeback"];
const CAT_NAME: Record<string, string> = { gzcl: "GZCL", novice: "Novice", strength: "Strength", powerlifting: "Powerlifting", hypertrophy: "Hypertrophy", peaking: "Peaking", comeback: "Comeback" };

/** Every program template, grouped by category, for a Picker. */
export function programOptions(exclude: string[] = []): PickOption<string>[] {
  return TEMPLATES.filter((t) => !exclude.includes(t.id))
    .map((t, i) => ({ t, i, c: CAT_ORDER.indexOf(t.category) }))
    .sort((a, b) => (a.c < 0 ? 99 : a.c) - (b.c < 0 ? 99 : b.c) || a.i - b.i)
    .map(({ t }) => ({ value: t.id, label: t.name, group: CAT_NAME[t.category] ?? t.category }));
}
