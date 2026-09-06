// BookPilot AI Advisor (spec §21).
//
// The advisor recommends and explains; it never acts. Every button it
// offers takes the author to the place where they can decide, which is
// the difference between an assistant and something quietly spending
// their money.

import { html, raw, $, setBusy } from "../core/dom.js";
import { API } from "../core/api.js";
import { notify } from "../core/toast.js";
import { refreshAccount } from "../core/session.js";
import { pageHead, confidenceBadge, demoBadge, emptyState, fmt } from "./shared.js";

const SUGGESTED = [
  "What should I do today?",
  "Which creative is working best, and how sure are you?",
  "Should I increase my budget?",
  "Why isn't my campaign converting?",
  "What should I test next?",
];

const ACTION_TARGET = {
  create_variations: { label: "Create variations", href: "#/creatives/new" },
  optimize_campaign: { label: "Optimise campaign", href: "#/campaigns" },
  generate_creative: { label: "Generate creatives", href: "#/creatives/new" },
  review_budget: { label: "Review budget", href: "#/campaigns" },
};

let thread = [];

export async function render(container) {
  const [{ campaigns }, { recommendations }] = await Promise.all([
    API.campaigns(),
    API.recommendations().catch(() => ({ recommendations: [] })),
  ]);

  container.innerHTML = html`
    ${raw(pageHead({
      title: "BookPilot AI Advisor",
      description: "Ask about your campaigns. It answers from your data, says how confident it is, and leaves every decision to you.",
      actions: demoBadge(),
    }))}

    <div class="bp-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,300px);align-items:start;gap:var(--bp-6)">
      <div class="bp-card bp-advisor">
        <div class="bp-advisor__thread" id="thread"></div>
        <div class="bp-chips" id="suggestions">
          ${raw(SUGGESTED.map((q) => html`<button type="button" class="bp-chip" data-question="${q}">${q}</button>`).join(""))}
        </div>
        <form class="bp-advisor__composer" id="ask-form">
          <input class="bp-input" id="question" placeholder="Ask about your campaigns…" maxlength="1000" required>
          <button type="submit" class="bp-btn bp-btn--primary">Ask · 2 credits</button>
        </form>
        <p class="bp-tiny bp-subtle" style="margin:0">
          The advisor reads your campaign data only. If there isn't enough of it, it says so rather
          than guessing.
        </p>
      </div>

      <aside class="bp-stack">
        <section class="bp-card">
          <div class="bp-card__title" style="margin-bottom:var(--bp-3)">Open recommendations</div>
          ${raw(recommendations.length
            ? `<div class="bp-stack-sm">${recommendations.slice(0, 4).map((rec) => html`
                <div class="bp-panel">
                  <div class="bp-row bp-row--between">
                    <strong class="bp-small">${rec.title}</strong>
                    ${raw(confidenceBadge(rec.confidence))}
                  </div>
                  <p class="bp-tiny bp-muted" style="margin:6px 0 0">${rec.reason || ""}</p>
                  <div class="bp-row" style="margin-top:var(--bp-2)">
                    <button type="button" class="bp-btn bp-btn--ghost bp-btn--sm" data-dismiss="${rec.id}">Dismiss</button>
                  </div>
                </div>`).join("")}</div>`
            : `<p class="bp-small bp-muted">Nothing outstanding. New recommendations appear after a campaign analysis.</p>`)}
        </section>

        <section class="bp-card">
          <div class="bp-card__title" style="margin-bottom:var(--bp-3)">Your campaigns</div>
          ${raw(campaigns.length
            ? `<div class="bp-stack-sm">${campaigns.slice(0, 5).map((c) => html`
                <div class="bp-row bp-row--between">
                  <a class="bp-small bp-truncate" href="#/campaigns/${c.id}">${c.name}</a>
                  <span class="bp-tiny bp-subtle">${fmt.titleCase(c.status)}</span>
                </div>`).join("")}</div>`
            : `<p class="bp-small bp-muted">No campaigns yet.</p>`)}
        </section>

        <section class="bp-card">
          <div class="bp-card__title" style="margin-bottom:var(--bp-3)">Patterns across campaigns</div>
          <p class="bp-small bp-muted">
            Once you've run a few campaigns, BookPilot looks across them for what repeats.
          </p>
          <button type="button" class="bp-btn bp-btn--secondary bp-btn--sm bp-btn--block" id="patterns-btn">
            Look for patterns
          </button>
          <div id="patterns-out" style="margin-top:var(--bp-3)"></div>
        </section>
      </aside>
    </div>
  `;

  const threadNode = $("#thread");
  const paintThread = () => {
    threadNode.innerHTML = thread.length
      ? thread.map(bubble).join("")
      : emptyState({
          icon: "✧",
          title: "Ask your first question",
          text: "“What should I do today?” is a good place to start.",
        });
    threadNode.scrollTop = threadNode.scrollHeight;
  };
  paintThread();

  async function ask(question) {
    thread.push({ role: "user", text: question });
    paintThread();
    threadNode.insertAdjacentHTML(
      "beforeend",
      '<div class="bp-bubble bp-bubble--ai" id="thinking"><span class="bp-spinner"></span> Reading your campaign data…</div>'
    );
    try {
      const result = await API.askAdvisor(question);
      await refreshAccount();
      thread.push({ role: "ai", text: result.answer, actions: result.actions || [] });
    } catch (err) {
      thread.push({ role: "ai", text: err.message, error: true });
    }
    paintThread();
  }

  $("#ask-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#question");
    const question = input.value.trim();
    if (!question) return;
    const button = event.target.querySelector('button[type="submit"]');
    input.value = "";
    setBusy(button, true, "Thinking…");
    await ask(question);
    setBusy(button, false);
  });

  container.querySelectorAll("[data-question]").forEach((chip) => {
    chip.addEventListener("click", () => ask(chip.dataset.question));
  });

  container.querySelectorAll("[data-dismiss]").forEach((button) => {
    button.addEventListener("click", async () => {
      await API.resolveRecommendation(button.dataset.dismiss, "dismissed");
      notify.info("Dismissed.");
      render(container);
    });
  });

  $("#patterns-btn").addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Looking…");
    try {
      const result = await API.patterns();
      await refreshAccount();
      $("#patterns-out").innerHTML = result.patterns?.length
        ? result.patterns
            .map((p) => html`<div class="bp-panel" style="margin-bottom:var(--bp-2)">
              <div class="bp-row bp-row--between"><strong class="bp-small">${p.title}</strong>${raw(confidenceBadge(p.confidence))}</div>
              <p class="bp-tiny bp-muted" style="margin:6px 0 0">${p.detail}</p>
              <p class="bp-tiny bp-subtle" style="margin:4px 0 0">${p.evidence}</p>
            </div>`)
            .join("")
        : html`<p class="bp-small bp-muted">${result.note || "Not enough campaign history yet."}</p>`;
    } catch (err) {
      notify.error(err.message);
    }
    setBusy(event.currentTarget, false);
  });
}

function bubble(entry) {
  if (entry.role === "user") {
    return html`<div class="bp-bubble bp-bubble--user">${entry.text}</div>`;
  }
  const actions = (entry.actions || [])
    .filter((action) => action.kind && action.kind !== "none")
    .map((action) => {
      if (action.kind === "explain") {
        return html`<button type="button" class="bp-btn bp-btn--ghost bp-btn--sm" title="${action.detail || ""}">Explain</button>`;
      }
      const target = ACTION_TARGET[action.kind];
      if (!target) return "";
      return html`<a class="bp-btn bp-btn--secondary bp-btn--sm" href="${target.href}" title="${action.detail || ""}">${action.label || target.label}</a>`;
    })
    .join("");

  return html`
    <div class="bp-bubble bp-bubble--ai ${entry.error ? "bp-alert--danger" : ""}">
      <div class="bp-pre-wrap">${entry.text}</div>
      ${actions ? raw(`<div class="bp-row bp-row--wrap" style="margin-top:var(--bp-3)">${actions}</div>`) : ""}
    </div>
  `;
}
