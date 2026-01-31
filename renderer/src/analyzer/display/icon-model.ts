import { CurrencyPrice } from "./currency-price";

export interface IconModel {
    price: CurrencyPrice;
    currencyIconUrl: string;
    generalIconUrl: string;
    sound: string;
    subjectiveScore: number;
}