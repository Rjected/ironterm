import type { ProgramConfig, ProgramDef, ProgramTemplate } from "../program";
import { calgary8, juggernaut, rtsGeneralized } from "./advanced";
import { candito6, clarence14, complete16 } from "./sheet-blocks";
import { gzclp } from "./gzclp";
import { LIFTVAULT_TEMPLATES } from "./liftvault";
import { gzclFamily } from "./gzcl-family";
import { HYPERTROPHY_TEMPLATES } from "./hypertrophy";
import { nsuns } from "./nsuns";
import { nsuns4, nsuns6Deadlift, nsuns6Squat } from "./nsuns-variants";
import { NOVICE_TEMPLATES } from "./novice";
import { sbsHypertrophy, sbsNoviceHypertrophy, sbsRir, sbsRtf } from "./sbs";
import { SHEIKO_TEMPLATES } from "./sheiko";
import { SPECIALIZATION_TEMPLATES } from "./specialization";
import { bbbChallenge, fivesPro, monolith, wendlerBeginners, wendlerShort } from "./wendler-variants";
import { wendler531 } from "./wendler531";
import { WENDLER_FOREVER_TEMPLATES } from "./wendler-forever";

export const TEMPLATES: ProgramTemplate[] = [gzclp, ...gzclFamily, wendler531, wendlerBeginners, wendlerShort, fivesPro, monolith, bbbChallenge, ...WENDLER_FOREVER_TEMPLATES, nsuns, nsuns4, nsuns6Squat, nsuns6Deadlift, ...HYPERTROPHY_TEMPLATES, ...NOVICE_TEMPLATES, candito6, clarence14, complete16, calgary8, juggernaut, rtsGeneralized, sbsRtf, sbsRir, sbsHypertrophy, sbsNoviceHypertrophy, ...SHEIKO_TEMPLATES, ...SPECIALIZATION_TEMPLATES, ...LIFTVAULT_TEMPLATES];

export function getTemplate(id: string): ProgramTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function buildProgram(cfg: ProgramConfig): ProgramDef | null {
  return getTemplate(cfg.templateId)?.build(cfg.options) ?? null;
}

/** A fresh config for a template, prefilled with its defaults. */
export function defaultConfig(templateId: string, unit: "lb" | "kg", startDate: string): ProgramConfig {
  const t = getTemplate(templateId)!;
  const options = Object.fromEntries(t.options.map((o) => [o.key, o.default]));
  const d = t.defaults?.(unit) ?? {};
  return {
    templateId,
    options,
    unit,
    startDate,
    startWeights: d.startWeights ?? {},
    trainingMaxes: d.trainingMaxes ?? {},
    increments: d.increments ?? {},
  };
}
