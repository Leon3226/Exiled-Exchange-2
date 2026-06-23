import type { ParsedModifier } from "@/parser/advanced-mod-desc";
import { ModifierType } from "@/parser/modifiers";

const MOD_TYPE_TO_STAT_TYPE: Partial<Record<ModifierType, string>> = {
  [ModifierType.Explicit]: "explicit",
  [ModifierType.Implicit]: "implicit",
  [ModifierType.Fractured]: "explicit",
  [ModifierType.Desecrated]: "explicit",
};

export function extractStatValues(
  mods: readonly ParsedModifier[],
  possibleStats: readonly string[],
): Record<string, number> {
  const possibleStatsSet = new Set(possibleStats);
  const result: Record<string, number> = {};

  for (const mod of mods) {
    const statType = MOD_TYPE_TO_STAT_TYPE[mod.info.type];
    if (!statType) continue;

    for (const parsedStat of mod.stats) {
      const candidates = parsedStat.stat.trade.ids?.[statType];
      if (!candidates) continue;

      const matchedHash = candidates.find((hash) => possibleStatsSet.has(hash));
      if (!matchedHash) continue;

      const value = parsedStat.roll?.value ?? parsedStat.stat.better;
      const key = `stat_${matchedHash}_value`;
      result[key] = (result[key] ?? 0) + value;
    }
  }

  return result;
}
