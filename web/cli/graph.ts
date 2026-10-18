// Terminal contribution graph: the same daily cells and levels as the web app's graph
// (shared/stats.ts dailyCells), drawn with ANSI 256-colour backgrounds or ASCII shades.
import { addDays, type DayCell } from "../shared/stats";

// 0 = no workout, 1–4 = quartiles of training days (dark → bright green)
const COLORS = [236, 22, 28, 34, 46];
const SHADES = [".", "░", "▒", "▓", "█"];
const DAY_LABELS = ["   ", "Mon", "   ", "Wed", "   ", "Fri", "   "];

const cell = (level: number, ascii: boolean) => (ascii ? SHADES[level] : `\x1b[48;5;${COLORS[level]}m  \x1b[0m`);
const blank = (ascii: boolean) => (ascii ? " " : "  ");

/** Day of week of a YYYY-MM-DD date, 0 = Sunday. */
const dow = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();

/**
 * `weeks` columns of Sunday–Saturday; the rightmost column is the current week and ends on
 * `today`, so days after today are left blank.
 */
export function renderGraph(cells: Map<string, DayCell>, today: string, weeks: number, ascii: boolean): string {
  const start = addDays(today, -((weeks - 1) * 7 + dow(today)));
  const lines: string[] = [""];
  let shown = 0;
  for (let row = 0; row < 7; row++) {
    let line = DAY_LABELS[row] + " ";
    for (let col = 0; col < weeks; col++) {
      const date = addDays(start, col * 7 + row);
      if (date > today) { line += blank(ascii); continue; }
      const level = cells.get(date)?.level ?? 0;
      if (level > 0) shown++;
      line += cell(level, ascii);
    }
    lines.push(line.trimEnd());
  }
  lines.push("", `    Less ${[0, 1, 2, 3, 4].map((l) => cell(l, ascii)).join("")} More`);
  lines.push(`    ${shown} days with workouts shown`, "");
  return lines.join("\n");
}
