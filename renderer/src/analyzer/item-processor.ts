import { ParsedItem, ItemRarity } from "@/parser";
import {
    ItemTypeVectorData,
  ITEM_VECTOR_DATA as itemVectorData,
} from "@/assets/data";
import { extractStatValues } from "./stat-value-extractor";

export interface FeatureVectors {
    category: "generic" | "unique";
    itemType: string;
    numericFeatures: number[];
    categoricalFeatures: string[];
}

// Must match the `skip_stats` flag the currently-loaded models were trained with
// (training/pipeline.py / bulkTrainer.py). Models trained with skip_stats=True
// (the default) never saw non-zero stat_*_value columns - flipping this on without
// retraining those models would feed them out-of-distribution inputs.
const STAT_VALUE_EXTRACTION_ENABLED = false;

export function transformItemIntoVector(item: ParsedItem): FeatureVectors | null {
    const routing = resolveItemRouting(item);
    if (routing == null) { return null; }

    const { category, itemType, vectorData } = routing;
    let vector = getEmptyVector(vectorData.modifiers, vectorData.properties, vectorData.stats);
    fillVectorWithItemData(vector, item, vectorData.properties);

    if (STAT_VALUE_EXTRACTION_ENABLED) {
        const statValues = extractStatValues(item.newMods, vectorData.stats);
        for (const [key, value] of Object.entries(statValues)) {
            if (key in vector) {
                vector[key] += value;
            }
        }
    }

    const { numericFeatures, categoricalFeatures } = transformDictionaryToDataVector(vector);
    return { category, itemType, numericFeatures, categoricalFeatures };
}

function resolveItemRouting(item: ParsedItem): { category: "generic" | "unique"; itemType: string; vectorData: ItemTypeVectorData } | null {
    if (item.rarity === ItemRarity.Unique && !item.isUnidentified) {
        const uniqueName = item.info.refName;
        if (uniqueName in itemVectorData.unique) {
            return { category: "unique", itemType: uniqueName, vectorData: itemVectorData.unique[uniqueName] };
        }
        return null;
    }

    const baseType = item.category?.toString();
    if (baseType == null) { return null; }
    if (!(baseType in itemVectorData.generic)) { return null; }
    return { category: "generic", itemType: baseType, vectorData: itemVectorData.generic[baseType] };
}

function generateCombinations(arrays: string[][]): string[][] {
    if (arrays.length === 0) return [[]];
    if (arrays.length === 1) return arrays[0].map(v => [v]);

    const result: string[][] = [];
    const [first, ...rest] = arrays;
    const restCombinations = generateCombinations(rest);

    for (const value of first) {
        for (const combination of restCombinations) {
            result.push([value, ...combination]);
        }
    }

    return result;
}

function transformDictionaryToDataVector(dict: {[key: string]: any}): { numericFeatures: number[]; categoricalFeatures: string[] } {
    const numericFeatures: number[] = [];
    const categoricalFeatures: string[] = [];

    for (const value of Object.values(dict)) {
        if (typeof value === 'string') {
            categoricalFeatures.push(value);
        } else if (typeof value === 'boolean') {
            numericFeatures.push(value ? 1 : 0);
        } else if (typeof value === 'number') {
            numericFeatures.push(value);
        } else {
            categoricalFeatures.push(String(value ?? ''));
        }
    }

    return { numericFeatures, categoricalFeatures };
}

function getEmptyVector(possibleModifiers: string[], possibleProperties: number[], possibleStats: string[]): {[key: string]: any} {
    let vector = [] as {[key: string]: any};
    vector['baseType'] = ''
    vector['rarity'] = ''
    vector['ilvl'] = 0

    vector['corrupted'] = false
    vector['desecrated'] = false
    vector['mirrored'] = false
    vector['sanctified'] = false

    vector['level_requirement'] = 0
    vector['dex_requirement'] = 0
    vector['str_requirement'] = 0
    vector['int_requirement'] = 0

    vector['prefixes'] = 0
    vector['suffixes'] = 0
    vector['sockets'] = 0

    vector['pdps'] = 0
    vector['edps'] = 0
    vector['dps'] = 0

    vector['ar'] = 0
    vector['es'] = 0
    vector['ev'] = 0

    possibleProperties.forEach(possibleProperty => {
        vector[`prop_${possibleProperty}`] = 0
    });

    possibleModifiers.forEach(possibleModifier => {
        vector[`mod_${possibleModifier}_present`] = 0
        vector[`mod_${possibleModifier}_fract`] = 0
        vector[`mod_${possibleModifier}_desecrated`] = 0
        vector[`mod_${possibleModifier}_tier`] = 0
        // TODO: python's get_empty_vector has no mod_{modifier}_value field (only present/fract/
        // desecrated/tier), so this extra always-zero column shifts every later column relative to
        // the trained model. Commented out until the model is retrained with a matching column, then
        // remove entirely.
        // vector[`mod_${possibleModifier}_value`] = 0
    });

    // TODO: matches python's get_empty_vector, which appends one `stat_{stat}_value` column per
    // entry in fields.stats. The training pipeline runs with skip_stats=True by default, so these
    // are always 0 there too - left at 0 here. If training is ever run with --include-stats, this
    // needs to compute real values the way vector_transformer.transform_item does (parsing mod
    // text via parseMod and summing matching stat values).
    possibleStats.forEach(possibleStat => {
        vector[`stat_${possibleStat}_value`] = 0
    });

    return vector
}

function fillVectorWithItemData(vector: {[key: string]: any}, item: ParsedItem, possibleProperties: number[]) {
    vector['baseType'] = item.info.refName;
    vector['rarity'] = item.rarity?.toString();
    vector['ilvl'] = item.itemLevel;

    vector['corrupted'] = item.isCorrupted === true;
    //Desecration calculated from mods
    vector['mirrored'] = item.isMirrored === true;
    vector['sanctified'] = item.isSanctified === true;

    vector['level_requirement'] = item.requires?.level ?? 0;
    vector['str_requirement'] = item.requires?.str ?? 0;
    vector['dex_requirement'] = item.requires?.dex ?? 0;
    vector['int_requirement'] = item.requires?.int ?? 0;

    const pdps = Math.round((item.weaponAS ?? 0) * (item.weaponPHYSICAL ?? 0));
    const edps = Math.round((item.weaponAS ?? 0) * (item.weaponELEMENTAL ?? 0));
    const dps = pdps + edps;
    vector['pdps'] = pdps;
    vector['edps'] = edps;
    vector['dps'] = dps;

    vector['ar'] = item.armourAR || 0;
    vector['es'] = item.armourES || 0;
    vector['ev'] = item.armourEV || 0;

    let prefixes = 0;
    let suffixes = 0;
    let itemDesecrated = false;
    let itemFractured = false;
    item.newMods.forEach(mod => {
        if(mod.info.type === "rune") { return; } //skip runes for now
        let tier = mod.info.tier ?? 0;
        let type = mod.info.type;
        let generation = mod.info.generation;
        let desecrated = false;
        let fractured = false;

        let stats = mod.stats.map(m => m.stat.trade.ids);
        let statsToMerge: string[] = [];
        stats.forEach(stat => {
            if(type === "fractured") {
                itemFractured = true;
                fractured = true;
                statsToMerge.push(stat.explicit.toString());
            }
            if(type === "desecrated") {
                itemDesecrated = true;
                desecrated = true;
                statsToMerge.push(stat.explicit.toString());
            }
            if(type === "explicit") {statsToMerge.push(stat.explicit.toString());}
            if(type === "implicit") {statsToMerge.push(stat.implicit.toString());}

        });

        if(generation === "prefix") {prefixes += 1;}
        if(generation === "suffix") {suffixes += 1;}

        // Skip if no stats to merge
        if (statsToMerge.length === 0 || statsToMerge.every(s => !s)) {
            return;
        }

        const statArrays = statsToMerge.map(stat => stat.split(',').filter(s => s));

        const combinations = generateCombinations(statArrays);
        let matchedStatString: string | null = null;

        for (const combination of combinations) {
            const statString = combination.sort().join(',');
            if (`mod_${statString}_present` in vector) {
                matchedStatString = statString;
                break;
            }
        }

        if (matchedStatString === null) {
            const triedCombinations = combinations.map(c => c.sort().join(',')).join(' | ');
            console.log(`Unknown modifier in vector data! Tried: ${triedCombinations}`);
            return;
        }

        vector[`mod_${matchedStatString}_present`] = 1;
        // TODO: python's transform_item never sets mod_*_fract/mod_*_desecrated to 1 - get_stat_strings
        // already rewrites fractured/desecrated hashes to "explicit" before the fract/desecrated checks
        // run, so those checks are dead code and the trained model only ever saw 0 here. Hardcoded to 0
        // to match; restore the lines below once the python bug is fixed and the model is retrained.
        // vector[`mod_${matchedStatString}_fract`] = fractured ? 1 : 0
        // vector[`mod_${matchedStatString}_desecrated`] = desecrated ? 1 : 0
        vector[`mod_${matchedStatString}_fract`] = 0
        vector[`mod_${matchedStatString}_desecrated`] = 0
        vector[`mod_${matchedStatString}_tier`] = tier
        // TODO: python's get_empty_vector has no mod_{modifier}_value field - commented out until the
        // model is retrained with a matching column, then remove entirely.
        // vector[`mod_${matchedStatString}_value`] = 0;
    });

    possibleProperties.forEach(possibleProperty => {
        let propString = `prop_${possibleProperty}`;
        if (!(propString in vector)){
            console.log(`Unknown property in vector data: ${possibleProperty}!`);
            return;
        }
        if(!(possibleProperty in propertyMapByType)){
            console.log(`Unimplemented property in vector data: ${possibleProperty}!`);
            return;
        }
        vector[propString] = propertyMapByType[possibleProperty](item);
    });

    vector['prefixes'] = prefixes;
    vector['suffixes'] = suffixes;
    vector['desecrated'] = itemDesecrated;
}

const propertyMapByType: {[type: number]: (item: ParsedItem) => any} = {
    1:   (item: ParsedItem) => 0, // Waystone Tier
    3:   (item: ParsedItem) => 0, // Item Rarity
    4:   (item: ParsedItem) => 0, // Pack Size

    6:   (item: ParsedItem) => item.quality ?? 0, // Quality
    9:   (item: ParsedItem) => item.weaponPHYSICAL ?? 0, // Physical Damage
    10:  (item: ParsedItem) => item.weaponELEMENTAL ?? 0, // Elemental Damage
    11:  (item: ParsedItem) => item.weaponCHAOS ?? 0, // Chaos Damage
    12:  (item: ParsedItem) => item.weaponCRIT ?? 0, // Critical Hit Chance
    13:  (item: ParsedItem) => item.weaponAS ?? 0, // Attacks per Second
    15:  (item: ParsedItem) => item.armourBLOCK ?? 0, // Block Chance
    16:  (item: ParsedItem) => item.armourAR || 0, // Armour
    17:  (item: ParsedItem) => item.armourEV || 0, // Evasion
    18:  (item: ParsedItem) => item.armourES || 0, // Energy Shield
    24:  (item: ParsedItem) => 0, // Jewel Radius
    25:  (item: ParsedItem) => 0, // Spirit
    34:  (item: ParsedItem) => 0, // Area Level
    66:  (item: ParsedItem) => 0, // Waystone Drop Chance

    97:  (item: ParsedItem) => item.weaponRELOAD ?? 0, // Reload Time
    98:  (item: ParsedItem) => 0, // Revives Available
    102: (item: ParsedItem) => 0, // Magic Monsters
    103: (item: ParsedItem) => 0, // Rare Monsters

};