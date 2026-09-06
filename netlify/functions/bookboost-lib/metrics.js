// The advertising maths is shared with the browser rather than
// reimplemented here — see js/core/metrics.js for the rules
// (notably: a rate with a zero denominator is null, not zero).
export * from "../../../js/core/metrics.js";
