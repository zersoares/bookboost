// Partials shared by the views.

import { html, raw, safeUrl } from "../core/dom.js";
import * as fmt from "../core/format.js";
import { isDemo } from "../core/api.js";

export function pageHead({ title, description, actions = "" }) {
  return html`
    <div class="bb-page-head">
      <div>
        <h1>${title}</h1>
        ${description ? raw(html`<p>${description}</p>`) : ""}
      </div>
      <div class="bb-row">${raw(actions)}</div>
    </div>
  `;
}

export function demoBadge() {
  return isDemo() ? '<span class="bb-demo-badge">Demo data</span>' : "";
}

export function emptyState({ icon = "◇", title, text, action = "" }) {
  return html`
    <div class="bb-empty">
      <div class="bb-empty__icon">${icon}</div>
      <div class="bb-empty__title">${title}</div>
      <p class="bb-empty__text">${text}</p>
      ${raw(action)}
    </div>
  `;
}

export function loading(rows = 3) {
  return `<div class="bb-loading">${
    Array.from({ length: rows }, () => '<div class="bb-skeleton bb-loading__row"></div>').join("")
  }</div>`;
}

export function errorBox(message, retryAction = "") {
  return html`
    <div class="bb-alert bb-alert--danger">
      <span class="bb-alert__icon">!</span>
      <div>
        <div class="bb-alert__title">That didn't work</div>
        <div>${message}</div>
        ${retryAction ? raw(`<div style="margin-top:var(--bb-3)">${retryAction}</div>`) : ""}
      </div>
    </div>
  `;
}

export function cover(book, { className = "" } = {}) {
  const url = safeUrl(book?.cover_url);
  if (url) {
    return html`<img class="bb-cover ${className}" src="${url}" alt="Cover of ${book.title}" loading="lazy">`;
  }
  return html`<div class="bb-cover bb-cover--placeholder ${className}" aria-hidden="true">${book?.title || "No cover"}</div>`;
}

export function statusBadge(status) {
  const tone = fmt.statusTone(status);
  return html`<span class="bb-badge ${tone ? `bb-badge--${tone}` : ""}">${fmt.titleCase(status)}</span>`;
}

/**
 * The predicted-quality score. The label matters: it is a judgement
 * about the creative before it runs, not a forecast of sales (spec §46).
 */
export function scoreBadge(score) {
  if (score === null || score === undefined) {
    return '<span class="bb-badge">Not scored</span>';
  }
  return html`<span class="bb-badge bb-badge--${fmt.scoreTone(score)}" title="Predicted creative quality, not a prediction of sales">
    <span class="bb-score"><b>${score}</b>/100</span>
  </span>`;
}

const CONFIDENCE_LABEL = {
  insufficient: ["Not enough data", ""],
  low: ["Low confidence", "warning"],
  medium: ["Medium confidence", "primary"],
  high: ["High confidence", "success"],
};

export function confidenceBadge(level) {
  const [label, tone] = CONFIDENCE_LABEL[level] || CONFIDENCE_LABEL.insufficient;
  return html`<span class="bb-badge ${tone ? `bb-badge--${tone}` : ""}">${label}</span>`;
}

/**
 * The eight headline metrics (spec §19).
 *
 * `hasData: false` renders the "not enough data" state rather than a
 * wall of zeroes, and any individual rate that came back null renders
 * as N/A.
 */
export function statGrid(metrics, currency = "EUR") {
  if (!metrics || !metrics.hasData) {
    return html`
      <div class="bb-panel bb-center">
        <strong>Not enough data yet</strong>
        <p class="bb-small bb-muted" style="margin:6px 0 0">
          Numbers appear here once a campaign has been delivering for a day or two.
        </p>
      </div>
    `;
  }

  const stat = (label, value, meta = "") => html`
    <div class="bb-stat">
      <div class="bb-stat__label">${label}</div>
      <div class="bb-stat__value ${value === "N/A" ? "bb-stat__value--na" : ""}">${value}</div>
      ${meta ? raw(html`<div class="bb-stat__meta">${meta}</div>`) : ""}
    </div>
  `;

  return html`
    <div class="bb-stat-grid bb-stat-grid--quad">
      ${raw(stat("Sales", fmt.number(metrics.conversions)))}
      ${raw(stat("Revenue", fmt.money(metrics.revenueCents, currency)))}
      ${raw(stat("Ad spend", fmt.money(metrics.spendCents, currency)))}
      ${raw(stat("ROAS", fmt.multiple(metrics.roas)))}
      ${raw(stat("CPA", fmt.money(metrics.cpa === null ? null : Math.round(metrics.cpa), currency)))}
      ${raw(stat("CTR", fmt.percent(metrics.ctr)))}
      ${raw(stat("CPC", fmt.money(metrics.cpc === null ? null : Math.round(metrics.cpc), currency)))}
      ${raw(stat("Conversion rate", fmt.percent(metrics.conversionRate)))}
    </div>
  `;
}

/** Bullet list that degrades to nothing rather than an empty <ul>. */
export function bullets(items, { limit = 8 } = {}) {
  const list = (items || []).filter(Boolean).slice(0, limit);
  if (!list.length) return "";
  return `<ul class="bb-small bb-muted" style="padding-left:1.05rem;margin:0">${
    list.map((item) => html`<li>${item}</li>`).join("")
  }</ul>`;
}

export function chips(items, { limit = 8 } = {}) {
  const list = (items || []).filter(Boolean).slice(0, limit);
  if (!list.length) return "";
  return `<div class="bb-chips">${list.map((item) => html`<span class="bb-chip">${item}</span>`).join("")}</div>`;
}

/** Turns a plain-text paragraph block into safe HTML paragraphs. */
export function paragraphs(text) {
  if (!text) return "";
  return String(text)
    .split(/\n{2,}/)
    .map((block) => html`<p>${block}</p>`)
    .join("");
}

export { fmt };
