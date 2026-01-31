import { currencyRates, validCurrencies } from "./currency-data";
import { CurrencyPrice } from "./currency-price";

const leniency = 0.15;

export function getPriceInCurrency(exaltedPrice:number): CurrencyPrice {
    if (exaltedPrice < 1) {
        return {currency: "transmute", amount: 1, uncertainty: 0, exaltedPrice}; // Basically mark as trash.
    }
    const lenientPrice = exaltedPrice * (1 + leniency);
    // It's possible to optimize this but I'm lazy.
    for (let currencyName in currencyRates) {
        let rate = currencyRates[currencyName];
        if (!validCurrencies.includes(currencyName) || lenientPrice < rate ) { continue; }
        const rawAmount = exaltedPrice / rate;
        const amount = Math.round(rawAmount);
        const uncertaintyRate = Math.abs(amount * rate - exaltedPrice) / rate;
        let uncertainty = 0;
        if (uncertaintyRate > 0.3) uncertainty = 2;
        if (uncertaintyRate > 0.15) uncertainty = 1;
        return {currency: currencyName as CurrencyPrice["currency"], amount, uncertainty, exaltedPrice};
    }
    return {currency: "exalted", amount: exaltedPrice, uncertainty: 1, exaltedPrice}; // Uncertainty 1 because low exalted prices are often unreliable.
}