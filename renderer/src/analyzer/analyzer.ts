import { ParsedItem } from "@/parser";
import { transformItemIntoVector, getItemBaseType } from "@/analyzer/item-processor";
import { MainProcess } from "@/web/background/IPC";

export async function getPrice(item: ParsedItem): Promise<number | null> {
    const featureVectors = transformItemIntoVector(item);
    if (featureVectors == null) {
        return null;
    }

    const itemType = getItemBaseType(item);
    if (itemType == null) {
        return null;
    }

    const prediction = await MainProcess.predict(
        "generic",
        itemType,
        featureVectors.numericFeatures,
        featureVectors.categoricalFeatures
    );

    if (prediction === null) {
        return null;
    }

    return Math.expm1(prediction);
}