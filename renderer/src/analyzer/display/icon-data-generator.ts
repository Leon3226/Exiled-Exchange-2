import { getPriceInCurrency } from "./currency-prices";
import { IconModel } from "./icon-model";
import { getSubjectiveEvaluatorScore } from "./subjective-evaluator";



export function getIcon(exaltedPrice: number): IconModel {
    let currencyPrice = getPriceInCurrency(exaltedPrice);
    let subjectiveScore = getSubjectiveEvaluatorScore(currencyPrice);
    let currencyIcon = `/images/currencies/${currencyPrice.currency}.png`
    let generalIcon = `/images/instantCheck/${subjectiveScore}.png`
    return {
        price: currencyPrice,
        currencyIconUrl: currencyIcon,
        generalIconUrl: generalIcon,
        sound: "",
        subjectiveScore
    };
}