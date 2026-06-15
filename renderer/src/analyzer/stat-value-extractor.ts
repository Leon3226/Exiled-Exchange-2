import type { ParsedModifier } from "@/parser/advanced-mod-desc";
import { ModifierType } from "@/parser/modifiers";

/**
 * TS counterpart of training/stat_value_extractor.py.
 *
 * Maps each mod's parsed stat(s) to `stat_{hash}_value` vector entries, using the
 * roll value the parser already computed (mod.stats[i].roll.value) - no text
 * re-parsing needed here, unlike the python side which has to regex-parse mod text
 * via parser.py/Data/stats.ndjson. For non-numeric (presence-only) mods, falls back
 * to stat.better, mirroring python's `matching_data[1]` ("better") fallback.
 *
 * fractured/desecrated mods are normalized to the 'explicit' stat type, matching
 * field_calculator.get_stat_strings()'s hash rewriting - so the same trade.ids
 * hashes (and therefore the same `fields.stats` / `possibleStats` keys) are used
 * on both sides.
 */
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
