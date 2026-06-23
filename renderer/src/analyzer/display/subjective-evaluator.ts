import { currencyRates } from "./currency-data";
import { CurrencyPrice } from "./currency-price";

// TODO: Probably details should be controlled by the config as well. Not a priority right now.
export function getSubjectiveEvaluatorScore(price: CurrencyPrice): number {
    if  (price.exaltedPrice < 7) { return 0; }
    if  (price.exaltedPrice < 15) { return 1; }
    if  (price.exaltedPrice < 30) { return 2; }
    if  (price.exaltedPrice < 60) { return 3; }
    if  (price.exaltedPrice < 120) { return 4; }
    if  (price.currency === "mirror" || (price.currency === "divine" && price.amount >= 10) || (price.exaltedPrice >= currencyRates["divine"]*10)) { return 6; }
    
    return 5;
}