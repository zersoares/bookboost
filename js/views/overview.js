// Dashboard home (spec §42).
//
// Answers three questions in the first screenful, in this order:
// what is happening, what is working, and what to do next. Anything
// that doesn't serve one of those three belongs on another page.

import { html, raw } from "../core/dom.js";
import { API, isDemo } from "../core/api.js";
import * as store from "../core/store.js";
import { notify } from "../core/toast.js";
import { pageHead, statGrid, emptyState, fmt, cover, statusBadge, confidenceBadge, demoBadge } from "./shared.js";

export async function render(container) {
  const [{ books }, { campaigns }, analytics, { recommendations }] = await Promise.all([
    API.books(),
    API.campaigns(),
    API.analytics(30).catch(() => ({ totals: null, creatives: [] })),
    API.recommendations().catch(() => ({ recommendations: [] })),
  ]);
  store.set({ books, campaigns });

  const profile = store.get("profile");
  const firstName = (profile?.full_name || "").split(" ")[0];

  if (!books.length) return renderFirstRun(container, firstName);

  const currency = profile?.currency || "EUR";
  const active = campaigns.filter((c) => c.status === "active");
  const bestCreative = [...(analytics.creatives || [])]
    .filter((row) => row.metrics?.hasData && row.metrics.roas !== null)
    .sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
  const topRecommendation = recommendations[0];

  container.innerHTML = html`
    ${raw(pageHead({
      title: firstName ? `Good to see you, ${firstName}` : "Overview",
      description: "What's happening, what's working, and what to do next.",
      actions: '<a class="bb-btn bb-btn--primary" href="#/campaigns/new">Create new campaign</a>',
    }))}

    <div class="bb-stack-lg">
      <section>
        <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-3)">
          <h2 style="font-size:1.05rem">Last 30 days</h2>
          <div class="bb-row">${raw(demoBadge())}<a class="bb-small" href="#/analytics">Full analytics →</a></div>
        </div>
        ${raw(statGrid(analytics.totals, currency))}
      </section>

      <div class="bb-grid bb-grid--2">
        <section class="bb-card">
          <div class="bb-card__header">
            <div class="bb-card__title">What's working</div>
            ${raw(bestCreative ? confidenceBadge(bestCreative.confidence) : "")}
          </div>
          ${raw(bestCreative
            ? html`
              <div class="bb-stack-sm">
                <div class="bb-display" style="font-size:1.1rem">“${bestCreative.creative?.headline || "Untitled creative"}”</div>
                <div class="bb-row bb-row--wrap bb-small bb-muted">
                  <span><strong>${fmt.multiple(bestCreative.metrics.roas)}</strong> ROAS</span>
                  <span>${fmt.number(bestCreative.metrics.conversions)} sales</span>
                  <span>${fmt.money(Math.round(bestCreative.metrics.cpa), currency)} per sale</span>
                </div>
                <p class="bb-tiny bb-subtle" style="margin:0">
                  Best performer of the last 30 days, by return on ad spend.
                </p>
                <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/creatives">See all creatives</a>
              </div>`
            : `<p class="bb-small bb-muted">No creative has enough delivery yet to call a winner. Give a campaign a few days and this fills in.</p>`)}
        </section>

        <section class="bb-card">
          <div class="bb-card__header">
            <div class="bb-card__title">What to do next</div>
            ${raw(topRecommendation ? confidenceBadge(topRecommendation.confidence) : "")}
          </div>
          ${raw(topRecommendation
            ? html`
              <div class="bb-stack-sm">
                <strong>${topRecommendation.title}</strong>
                <p class="bb-small bb-muted" style="margin:0">${topRecommendation.reason || ""}</p>
                ${topRecommendation.metrics?.supporting
                  ? raw(html`<p class="bb-tiny bb-subtle" style="margin:0">${topRecommendation.metrics.supporting}</p>`)
                  : ""}
                <div class="bb-row">
                  <a class="bb-btn bb-btn--primary bb-btn--sm" href="#/advisor">Ask the advisor</a>
                  <button type="button" class="bb-btn bb-btn--ghost bb-btn--sm" data-dismiss="${topRecommendation.id}">Dismiss</button>
                </div>
              </div>`
            : `<div class="bb-stack-sm">
                 <p class="bb-small bb-muted" style="margin:0">
                   Nothing needs your attention right now. When a creative pulls ahead — or stops
                   working — the advisor will say so here.
                 </p>
                 <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/advisor">Open the AI Advisor</a>
               </div>`)}
        </section>
      </div>

      <section>
        <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-3)">
          <h2 style="font-size:1.05rem">Your books</h2>
          <a class="bb-small" href="#/books">All books →</a>
        </div>
        <div class="bb-grid bb-grid--cards">
          ${raw(books.slice(0, 3).map((book) => bookTile(book, campaigns, currency)).join(""))}
        </div>
      </section>

      <section>
        <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-3)">
          <h2 style="font-size:1.05rem">Campaigns</h2>
          <a class="bb-small" href="#/campaigns">All campaigns →</a>
        </div>
        ${raw(campaigns.length
          ? `<div class="bb-card bb-card--flush"><div class="bb-table-wrap"><table class="bb-table">
               <thead><tr><th>Campaign</th><th>Status</th><th>Budget</th><th class="bb-num">Spend</th><th class="bb-num">Sales</th><th class="bb-num">ROAS</th></tr></thead>
               <tbody>${campaigns.slice(0, 5).map((campaign) => {
                 const row = (analytics.campaigns || []).find((c) => c.campaign.id === campaign.id);
                 const m = row?.metrics;
                 return html`<tr>
                   <td><a href="#/campaigns/${campaign.id}">${campaign.name}</a></td>
                   <td>${raw(statusBadge(campaign.status))}</td>
                   <td>${fmt.money(campaign.daily_budget_cents, campaign.currency)}/day</td>
                   <td class="bb-num">${m ? fmt.money(m.spendCents, campaign.currency) : "—"}</td>
                   <td class="bb-num">${m ? fmt.number(m.conversions) : "—"}</td>
                   <td class="bb-num">${m ? fmt.multiple(m.roas) : "—"}</td>
                 </tr>`;
               }).join("")}</tbody>
             </table></div></div>`
          : emptyState({
              icon: "▶",
              title: "No campaigns yet",
              text: "Your book is ready. Let's find your readers.",
              action: '<a class="bb-btn bb-btn--primary" href="#/campaigns/new">Create campaign</a>',
            }))}
      </section>
    </div>
  `;

  container.querySelectorAll("[data-dismiss]").forEach((button) => {
    button.addEventListener("click", async () => {
      await API.resolveRecommendation(button.dataset.dismiss, "dismissed");
      notify.info("Dismissed.");
      render(container);
    });
  });
}

function bookTile(book, campaigns, currency) {
  const bookCampaigns = campaigns.filter((c) => c.book_id === book.id);
  const activeCount = bookCampaigns.filter((c) => c.status === "active").length;
  return html`
    <a class="bb-card bb-card--interactive bb-book-card" href="#/books/${book.id}" style="color:inherit">
      <div class="bb-book-card__cover">${raw(cover(book))}</div>
      <div class="bb-book-card__body">
        <strong class="bb-clamp-2">${book.title}</strong>
        <div class="bb-small bb-muted" style="margin-top:4px">${book.genre || "Genre not set"}</div>
        <div class="bb-row bb-row--wrap" style="margin-top:var(--bb-3);gap:6px">
          ${raw(statusBadge(book.status))}
          ${activeCount ? raw(html`<span class="bb-badge bb-badge--success">${activeCount} active</span>`) : ""}
        </div>
        <div class="bb-tiny bb-subtle" style="margin-top:var(--bb-2)">
          ${book.price_cents !== null && book.price_cents !== undefined
            ? fmt.money(book.price_cents, book.currency || currency)
            : "No price set"}
        </div>
      </div>
    </a>
  `;
}

function renderFirstRun(container, firstName) {
  container.innerHTML = html`
    ${raw(pageHead({
      title: firstName ? `Welcome, ${firstName}` : "Welcome to BookBoost AI",
      description: "One book is all it takes to get started.",
    }))}
    ${raw(emptyState({
      icon: "▤",
      title: "No books yet",
      text: "Your next bestseller starts here. Add your book and we'll work out who buys it.",
      action: '<a class="bb-btn bb-btn--primary bb-btn--lg" href="#/books/new">Add your first book</a>',
    }))}
    ${isDemo() ? "" : raw(`
      <p class="bb-small bb-center bb-muted" style="margin-top:var(--bb-5)">
        Want to look around first? <a href="/app.html?demo=1#/overview">Open the demo workspace</a>.
      </p>`)}
  `;
}
