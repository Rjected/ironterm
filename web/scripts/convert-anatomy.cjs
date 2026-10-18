// Regenerates src/anatomy/male.ts from muscle_mapper's advanced SVGs (Ryan Graves, CC BY 4.0).
// Usage: curl -sL https://pub.dev/api/archives/muscle_mapper-1.2.2.tar.gz | tar xz -C /tmp/mm
//        node scripts/convert-anatomy.cjs /tmp/mm/lib/src/assets/advanced src/anatomy/male.ts
const fs = require("fs");
const [dir, outFile] = process.argv.slice(2);
const r1 = (s) => s.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => { const v = Math.round(parseFloat(n) * 10) / 10; return (Object.is(v, -0) ? 0 : v).toString(); }).replace(/\s+/g, " ").replace(/ ?([MLCHVZ]) ?/g, "$1").trim();

function muscleFor(id, group, view, firstX, cx) {
  if (!id) return null;
  const b = id.replace(/_[lr]$/, "");
  const T = {
    anterior_deltoid: "frontDelt", lateral_deltoid: "sideDelt", posterior_deltoid: "rearDelt",
    biceps_brachii_caput_longum: "biceps", biceps_brachii_caput_breve: "biceps",
    triceps_brachii_caput_longum: "tricepsLong", triceps_brachii_caput_laterale: "tricepsLateral", triceps_brachii_caput_mediale: "tricepsLateral",
    brachioradialis: "brachioradialis",
    flexor_digitorum_superficialis: "forearmFlexors", flexor_carpi_radialis: "forearmFlexors", flexor_carpi_ulnaris: "forearmFlexors", palmaris_longus: "forearmFlexors", pronator_teres: "forearmFlexors",
    extensor_carpi_radialis_longus: "forearmExtensors", extensor_carpi_ulnaris: "forearmExtensors", anconeus: "forearmExtensors",
    trapezius_upper: "trapsUpper", trapezius_middle: "trapsMid", trapezius_lower: "trapsLower",
    latissimus_dorsi: "lats", infraspinatus: "infraspinatus",
    sternocleidomastoid: "neck", platysma: "neck", sternohyoid: "neck",
    gluteus_maximus: "gluteMax", gluteus_medius_1: "gluteMed", gluteus_medius_2: "gluteMed",
    adductor_longus: "adductors", adductor_magnus: "adductors", pectineus: "adductors", gracilis: "adductors",
    sartoris: "hipFlexors", rectus_femoris: "rectusFemoris", vastus_lateralis: "vastusLateralis", vastus_medialis: "vastusMedialis",
    biceps_femoris: "hamsLateral", semitendinosus: "hamsMedial", semimembranosus_1: "hamsMedial", semimembranosus_2: "hamsMedial",
    gastrocnemius: "gastrocnemius", tibialis_anterior: "tibialis", extensor_hallucis_longus: "tibialis", extensor_digitorum_longus: "tibialis", fibularis_longus: "tibialis",
  };
  if (b === "extensor_digitorum") return group === "arms" ? "forearmExtensors" : "tibialis";
  if (/^rectus_abdominis/.test(b)) return "abs";
  const eo = /^external_oblique_(\d)$/.exec(b);
  if (eo) return view === "front" && +eo[1] >= 6 ? "serratus" : "obliques";
  if (b === "pectoralis_major") return "PEC";
  return T[b] ?? null;
}

function convert(file, view) {
  const s = fs.readFileSync(dir + "/" + file, "utf8");
  const vb = /viewBox="([^"]+)"/.exec(s)[1];
  const w = +vb.split(" ")[2];
  const cx = w / 2;
  const shapes = [];
  let base = "";
  const re = /<g id="([^"]+)"|<\/g>|<path([\s\S]*?)\/>/g;
  let m, group = null, unmapped = [];
  while ((m = re.exec(s))) {
    if (m[1]) { group = m[1]; continue; }
    if (m[0] === "</g>") { group = null; continue; }
    const a = m[2];
    const at = (k) => { const x = new RegExp("\\s" + k + '="([^"]*)"').exec(a); return x && x[1]; };
    const d = r1(at("d"));
    const id = at("id"), fill = at("fill"), stroke = at("stroke");
    const firstX = parseFloat(/M(-?[\d.]+)/.exec(d)[1]);
    const side = id && /_l$/.test(id) ? "l" : id && /_r$/.test(id) ? "r" : null;
    if (id === "underlayer") { base = d; continue; }
    if (!fill || fill === "none") { shapes.push({ k: "line", d }); continue; }
    let mus = muscleFor(id, group, view, firstX, cx);
    // unlabelled muscle slips in the source art
    if (!id && fill === "#BDBDBD") {
      if (view === "front" && group === "legs") mus = "gastrocnemius";
      else if (view === "front" && group === "arms") mus = "brachialis";
      else if (view === "back" && group === "legs") { const y = parseFloat(/M-?[\d.]+ (-?[\d.]+)/.exec(d)[1]); if (y > 900 && y < 1080) mus = "soleus"; }
      else if (view === "back" && group === "shoulders") mus = "infraspinatus"; // supraspinatus slip
    }
    // the art's "right" is the subject's right (viewer's left on the front, viewer's right on the back)
    const sd = side ?? (Math.abs(firstX - cx) < 4 ? "c" : (view === "front") === (firstX < cx) ? "r" : "l");
    if (mus === "PEC") {
      shapes.push({ k: "m", m: "pecUpper", s: sd, d, clip: "pecUpper" });
      shapes.push({ k: "m", m: "pecLower", s: sd, d, clip: "pecLower" });
    } else if (mus === "infraspinatus" && id) {
      shapes.push({ k: "m", m: "infraspinatus", s: sd, d, clip: "infraUpper" });
      shapes.push({ k: "m", m: "teres", s: sd, d, clip: "teres" });
    } else if (mus) shapes.push({ k: "m", m: mus, s: sd, d });
    else {
      if (fill === "#BDBDBD" && id && !/hand|foot|palm/.test(id)) unmapped.push(id);
      shapes.push({ k: fill === "#E0E0E0" ? "fascia" : "decor", d, ...(stroke ? { stroke: 1 } : {}) });
    }
  }
  if (unmapped.length) console.error(view, "unmapped:", unmapped.join(" "));
  return { viewBox: vb, cx, base, shapes };
}

const front = convert("male_front_muscle_anatomy.svg", "front");
const back = convert("male_back_muscle_anatomy.svg", "back");
const counts = {};
for (const v of [front, back]) for (const x of v.shapes) if (x.m) counts[x.m] = (counts[x.m] ?? 0) + 1;
console.error(JSON.stringify(counts));
const header = `// GENERATED by a one-off script from the "advanced" anatomy SVGs shipped in muscle_mapper 1.2.2
// (pub.dev/packages/muscle_mapper, MIT). The artwork itself is by Ryan Graves, Figma Community
// file 1320468164820924031 (figma.com/community/file/1320468164820924031), licensed CC BY 4.0
// (creativecommons.org/licenses/by/4.0/). Changes: coordinates rounded to 0.1, each source
// path mapped to a muscle id from shared/muscles.ts, the pectoralis split into clavicular and
// sternal heads and teres major separated from infraspinatus (via clip regions, see figure.ts).
// Attribution is shown in the UI under the figure.
//
// Shapes are in source paint order. k: "m" muscle region, "fascia" tendon/aponeurosis,
// "decor" non-trained muscle (face, hands), "line" hairline detail strokes.

import type { MuscleId } from "../../shared/muscles";

export interface Shape { k: "m" | "fascia" | "decor" | "line"; d: string; m?: MuscleId; s?: "l" | "r" | "c"; clip?: string; stroke?: 1 }
export interface View { viewBox: string; cx: number; base: string; shapes: Shape[] }

`;
fs.writeFileSync(outFile, header + `export const MALE_FRONT: View = ${JSON.stringify(front)};\n\nexport const MALE_BACK: View = ${JSON.stringify(back)};\n`);
console.error("bytes", fs.statSync(outFile).size);
