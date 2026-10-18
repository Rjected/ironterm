// ironterm-graph: print a GitHub-style contribution graph of your Hevy workouts.
//
//   HEVY_API_KEY=… pnpm cli                    # last 52 weeks
//   pnpm cli --weeks 26 --ascii
//
// No dependencies: Node's fetch, Intl time zones and util.parseArgs, plus the web app's own
// Hevy client and graph code.
import { parseArgs } from "node:util";
import type { HevyWorkout } from "../shared/hevy";
import { dailyCells, localDate } from "../shared/stats";
import { Hevy } from "../worker/hevy";
import { renderGraph } from "./graph";

const HELP = `Display a GitHub-style contribution graph of your Hevy workouts

Usage: pnpm cli [options]

Options:
  -a, --api-key <key>  Hevy API key (default: $HEVY_API_KEY)
  -w, --weeks <n>      Number of weeks to display (default: 52)
      --ascii          Use ASCII shades instead of colours
      --tz <zone>      IANA time zone for days (default: this machine's)
  -h, --help           Show this help`;

async function main() {
  const { values } = parseArgs({
    options: {
      "api-key": { type: "string", short: "a" },
      weeks: { type: "string", short: "w", default: "52" },
      ascii: { type: "boolean", default: false },
      tz: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) return console.log(HELP);
  const key = values["api-key"] ?? process.env.HEVY_API_KEY;
  if (!key) throw new Error("No API key: pass --api-key or set HEVY_API_KEY (Hevy → Settings → Developer).");
  const weeks = Number(values.weeks);
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error(`--weeks must be a positive whole number, not "${values.weeks}"`);
  const tz = values.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const hevy = new Hevy(key);
  console.log("Fetching workouts...");
  const workouts: HevyWorkout[] = [];
  for (let page = 1; ; page++) {
    const r = await hevy.workouts(page);
    workouts.push(...r.workouts);
    if (page >= r.page_count) break;
  }
  console.log(`Found ${workouts.length} workouts`);

  const today = localDate(new Date().toISOString(), tz);
  console.log(renderGraph(dailyCells(workouts, tz), today, weeks, values.ascii));
}

main().catch((e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
