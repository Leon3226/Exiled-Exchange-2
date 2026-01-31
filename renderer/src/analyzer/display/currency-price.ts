export interface CurrencyPrice {
  currency: "transmute" | "exalted" | "chaos" | "divine" | "mirror";
  amount: number;
  uncertainty: number;
  exaltedPrice: number;
}
