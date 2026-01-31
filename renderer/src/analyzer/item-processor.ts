import { ParsedItem } from "@/parser";
import {
    ItemTypeVectorData,
  ITEM_VECTOR_DATA as itemVectorData,
} from "@/assets/data";

export function transformItemIntoVector(item: ParsedItem) : any[] | null {
    let baseType = getItemBaseType(item);
    if (baseType == null){ return null; }
    
    let vectorData = getVectorData(baseType);
    if (vectorData == null){ return null; }

    let vector = getEmptyVector(vectorData.modifiers, vectorData.properties);
    fillVectorWithItemData(vector, item, vectorData.properties);
    
    return transformDictionaryToDataVector(vector);
}

function getItemBaseType(item: ParsedItem): string | null {
    let itemBase = item.category;
    if (itemBase == null){
        return null;
    }
    return itemBase.toString();
}

function getVectorData(baseType: string): ItemTypeVectorData | null {
    if (!(baseType in itemVectorData.generic)){
        return null;
    }
    let data = itemVectorData.generic[baseType]; 
    return data;
}

function transformDictionaryToDataVector(dict: {[key: string]: number}): any[] {
    const map = new Map(Object.entries(dict));
    return [...map.values()];
}

function getEmptyVector(possibleModifiers: string[], possibleProperties: number[]): {[key: string]: any} {
    let vector = [] as {[key: string]: any};
    vector['baseType'] = ''
    vector['rarity'] = ''
    vector['ilvi'] = ''

    vector['corrupted'] = false
    vector['desecrated'] = false
    vector['mirrored'] = false

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
        vector[`mod_${possibleModifier}_value`] = 0
    });

    return vector
}

function fillVectorWithItemData(vector: {[key: string]: any}, item: ParsedItem, possibleProperties: number[]) {
    vector['baseType'] = item.category?.toString();
    vector['rarity'] = item.rarity?.toString();
    vector['ilvi'] = item.itemLevel;

    vector['corrupted'] = item.isCorrupted === true;
    vector['mirrored'] = item.isMirrored === true;

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

            if(generation === "prefix") {prefixes += 1;}
            if(generation === "suffix") {suffixes += 1;}
        });
        // Skipping pseudo mods for now
        let statString = statsToMerge.map(stat => stat.split(',')[0]).join(',')
        if(!(`mod_${statString}_present` in vector)){
            console.log(`Unknown modifier in vector data: ${statString}!`);
            return;
        }
        vector[`mod_${statString}_present`] = 1;
        vector[`mod_${statString}_fract`] = fractured ? 1 : 0
        vector[`mod_${statString}_desecrated`] = desecrated ? 1 : 0
        vector[`mod_${statString}_tier`] = tier
        vector[`mod_${statString}_value`] = 0;

        console.log("");
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
    11:  (item: ParsedItem) => item.weaponChaos ?? 0, // Chaos Damage
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

    97:  (item: ParsedItem) => item.weaponReload ?? 0, // Reload Time
    98:  (item: ParsedItem) => 0, // Revives Available
    102: (item: ParsedItem) => 0, // Magic Monsters
    103: (item: ParsedItem) => 0, // Rare Monsters

};