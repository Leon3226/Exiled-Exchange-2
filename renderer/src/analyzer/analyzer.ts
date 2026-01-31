import { ParsedItem } from "@/parser";
import { transformItemIntoVector } from "@/analyzer/item-processor";

export function getPrice(item: ParsedItem): number | null {
    let itemVector = transformItemIntoVector(item);
    return null;
}