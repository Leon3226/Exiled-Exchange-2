// Definitely should make this dynamic in the future. IMPORTANT: should be synced with data from the analyzer server on the date the trade data was fetched, NOT poe ninja at the moment.
// Also make sure this is always sorted from highest to lowest.
export const currencyRates: { [currency: string]: number } = {
  mirror: 548000,
  divine: 388,
  chaos: 19,
};

// Probably should make a config for a user to enable/disable currencies
export const validCurrencies = [
  "exalted",
  "chaos",
  "divine",
  "mirror",
];