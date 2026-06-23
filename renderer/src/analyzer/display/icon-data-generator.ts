import { getPriceInCurrency } from "./currency-prices";
import { IconModel } from "./icon-model";
import { getSubjectiveEvaluatorScore } from "./subjective-evaluator";



export function getIcon(exaltedPrice: number): IconModel {
    const currencyPrice = getPriceInCurrency(exaltedPrice);
    const subjectiveScore = getSubjectiveEvaluatorScore(currencyPrice);
    const currencyIcon = `/images/currencies/${currencyPrice.currency}.png`
    const generalIcon = `/images/instantCheck/${subjectiveScore}.png`
    return {
        price: currencyPrice,
        currencyIconUrl: currencyIcon,
        generalIconUrl: generalIcon,
        sound: "",
        subjectiveScore
    };
}