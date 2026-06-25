import { getPriceInCurrency } from "./currency-prices";
import { IconModel } from "./icon-model";
import { getSubjectiveEvaluatorScore } from "./subjective-evaluator";



export function getIcon(exaltedPrice: number | null): IconModel {
    if (exaltedPrice === null) {
        return {
            price: null,
            currencyIconUrl: "",
            generalIconUrl: "",
            sound: "",
            subjectiveScore: -1,
            unknown: true,
        };
    }
    const currencyPrice = getPriceInCurrency(exaltedPrice);
    const subjectiveScore = getSubjectiveEvaluatorScore(currencyPrice);
    const currencyIcon = `/images/currencies/${currencyPrice.currency}.png`
    const generalIcon = `/images/instantCheck/${subjectiveScore}.png`
    return {
        price: currencyPrice,
        currencyIconUrl: currencyIcon,
        generalIconUrl: generalIcon,
        sound: "",
        subjectiveScore,
        unknown: false,
    };
}