// Integrations and attribution (spec §16, §17, §18).
//
// Three things live here: the Meta connection, the website tracking
// script, and Amazon Attribution. The honesty rules for this page:
//
//   - A capability the deployment doesn't have says so, and offers
//     "Connect integration" rather than a button that fails.
//   - Amazon is not presented as something BookBoost can read sales
//     from. It can import Amazon Attribution data if the author has an
//     eligible account, and that is a different, smaller claim.
//   - Website-attributed and Amazon-attributed numbers are labelled
//     everywhere they appear and never summed together.

import { html, raw, $, formData, setBusy } from "../core/dom.js";
import { API, isDemo } from "../core/api.js";
import { notify, confirmDialog } from "../core/toast.js";
import { pageHead, fmt, demoBadge } from "./shared.js";

export async function render(container, params, query) {
  const [{ integrations, capabilities }, { sites }] = await Promise.all([
    API.integrations(),
    API.trackingSites().catch(() => ({ sites: [] })),
  ]);

  const meta = integrations.find((i) => i.provider === "meta");
  const amazon = integrations.find((i) => i.provider === "amazon_attribution");

  // The Meta OAuth callback comes back with a status in the query string.
  const metaResult = query?.get("meta") || new URLSearchParams(location.search).get("meta");
  if (metaResult === "connected") notify.success("Meta account connected.");
  if (metaResult === "failed") notify.error("We couldn't connect your Meta account. Please try again.");
  if (metaResult === "declined") notify.info("Meta connection cancelled.");

  container.innerHTML = html`
    ${raw(pageHead({
      title: "Attribution & integrations",
      description: "Where your ads run, and how sales find their way back to the ad that caused them.",
      actions: demoBadge(),
    }))}

    <div class="bb-stack-lg">
      ${raw(metaCard(meta, capabilities))}
      ${raw(trackingCard(sites))}
      ${raw(amazonCard(amazon, capabilities))}
      ${raw(comingSoonCard())}
    </div>
  `;

  $("#connect-meta")?.addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Opening Meta…");
    try {
      const { url } = await API.metaAuthorizeUrl();
      location.href = url;
    } catch (err) {
      notify.error(err.message);
      setBusy(event.currentTarget, false);
    }
  });

  $("#disconnect-meta")?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Disconnect Meta?",
      message:
        "BookBoost will stop syncing performance data. Campaigns already running on Meta keep running — you'd pause those in Ads Manager.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!confirmed) return;
    await API.disconnect("meta");
    notify.success("Meta disconnected.");
    render(container, params, query);
  });

  $("#meta-accounts")?.addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Loading…");
    try {
      const { accounts, selected } = await API.metaAccounts();
      const target = $("#account-list");
      target.innerHTML = accounts.length
        ? accounts
            .map((account) => html`
              <label class="bb-radio ${account.id === selected ? "bb-radio--selected" : ""}">
                <input type="radio" name="ad-account" value="${account.id}" data-name="${account.name}" ${account.id === selected ? "checked" : ""}>
                <span><strong>${account.name}</strong>
                  <span class="bb-small bb-subtle"> · ${account.currency} · ${account.active ? "active" : "inactive"}</span></span>
              </label>`)
            .join("") +
          '<button type="button" class="bb-btn bb-btn--primary bb-btn--sm" id="save-account" style="margin-top:var(--bb-3)">Use this account</button>'
        : '<p class="bb-small bb-muted">No ad accounts found on that Meta profile.</p>';

      target.querySelector("#save-account")?.addEventListener("click", async () => {
        const chosen = target.querySelector('input[name="ad-account"]:checked');
        if (!chosen) return;
        await API.metaSelectAccount({ account_id: chosen.value, account_name: chosen.dataset.name });
        notify.success("Ad account saved.");
        render(container, params, query);
      });
    } catch (err) {
      notify.error(err.message);
    }
    setBusy(event.currentTarget, false);
  });

  $("#site-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(event.target);
    const button = event.target.querySelector('button[type="submit"]');
    setBusy(button, true, "Creating…");
    try {
      await API.createTrackingSite(values);
      notify.success("Tracking key created.");
      render(container, params, query);
    } catch (err) {
      notify.error(err.message);
      setBusy(button, false);
    }
  });

  container.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        notify.success("Copied to your clipboard.");
      } catch {
        notify.info("Select the snippet and copy it manually.");
      }
    });
  });

  container.querySelectorAll("[data-remove-site]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmDialog({
        title: "Remove this tracking key?",
        message: "Any site still using it will stop reporting sales. Events already recorded are kept.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!confirmed) return;
      await API.deleteTrackingSite(button.dataset.removeSite);
      render(container, params, query);
    });
  });
}

function metaCard(meta, capabilities) {
  const connected = meta?.status === "connected";

  if (!capabilities?.meta) {
    return html`
      <section class="bb-card">
        <div class="bb-card__header">
          <div class="bb-card__title">Meta — Facebook &amp; Instagram</div>
          <span class="bb-badge">${isDemo() ? "Not in the demo" : "Not configured"}</span>
        </div>
        <p class="bb-small bb-muted">
          ${isDemo()
            ? "The demo workspace isn't connected to any ad account — that's the point of it. Create a free account to connect yours."
            : "This deployment doesn't have Meta app credentials configured yet, so the connection can't be offered. The integration is built and waiting on them."}
        </p>
        ${raw(isDemo() ? '<a class="bb-btn bb-btn--primary bb-btn--sm" href="#/signup">Create a free account</a>' : "")}
      </section>`;
  }

  return html`
    <section class="bb-card">
      <div class="bb-card__header">
        <div class="bb-card__title">Meta — Facebook &amp; Instagram</div>
        <span class="bb-badge ${connected ? "bb-badge--success" : ""}">${connected ? "Connected" : "Not connected"}</span>
      </div>
      ${raw(connected
        ? html`
          <dl class="bb-kv">
            <dt>Ad account</dt><dd>${meta.account_name || meta.account_id || "Not chosen yet"}</dd>
            <dt>Last synced</dt><dd>${meta.last_synced_at ? fmt.relativeTime(meta.last_synced_at) : "Never"}</dd>
            <dt>Access expires</dt><dd>${meta.expires_at ? fmt.date(meta.expires_at) : "—"}</dd>
          </dl>
          ${meta.last_error ? raw(html`<div class="bb-alert bb-alert--warning" style="margin-top:var(--bb-4)">
            <span class="bb-alert__icon">!</span><div class="bb-small">${meta.last_error}</div></div>`) : ""}
          <div class="bb-row bb-row--wrap" style="margin-top:var(--bb-4)">
            <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="meta-accounts">Choose ad account</button>
            <button type="button" class="bb-btn bb-btn--danger bb-btn--sm" id="disconnect-meta">Disconnect</button>
          </div>
          <div id="account-list" class="bb-stack-sm" style="margin-top:var(--bb-4)"></div>`
        : html`
          <p class="bb-small bb-muted">
            Connect the ad account you already use. Meta bills you directly, BookBoost never sees or
            stores your password, and campaigns are always created paused.
          </p>
          <button type="button" class="bb-btn bb-btn--primary bb-btn--sm" id="connect-meta">Connect Meta account</button>`)}
    </section>
  `;
}

function trackingCard(sites) {
  const origin = location.origin;
  return html`
    <section class="bb-card">
      <div class="bb-card__header">
        <div class="bb-card__title">Website tracking</div>
        <span class="bb-badge ${sites.length ? "bb-badge--success" : ""}">${sites.length ? `${sites.length} site${sites.length === 1 ? "" : "s"}` : "Not set up"}</span>
      </div>
      <p class="bb-small bb-muted">
        If you sell from your own site, this is what closes the loop: a small script that reports
        page views, checkouts and purchases back against the ad that produced them. It stores no IP
        address, no user agent and no cookie — only which campaign and creative a purchase came from.
      </p>

      ${raw(sites.length
        ? `<div class="bb-stack-sm" style="margin:var(--bb-4) 0">${sites.map((site) => html`
            <div class="bb-panel">
              <div class="bb-row bb-row--between">
                <div>
                  <strong class="bb-small">${site.name}</strong>
                  <div class="bb-tiny bb-subtle">${site.domain}</div>
                </div>
                <button type="button" class="bb-btn bb-btn--ghost bb-btn--sm" data-remove-site="${site.id}">Remove</button>
              </div>
              <code class="bb-code" style="margin-top:var(--bb-3)">&lt;script async src="${origin}/track/bb.js" data-key="${site.public_key}"&gt;&lt;/script&gt;</code>
              <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" style="margin-top:var(--bb-2)"
                data-copy='<script async src="${origin}/track/bb.js" data-key="${site.public_key}"></script>'>Copy snippet</button>
            </div>`).join("")}</div>`
        : "")}

      <form id="site-form" class="bb-field-row" style="margin-top:var(--bb-4);align-items:end">
        <div class="bb-field" style="margin:0">
          <label class="bb-label" for="site-name">Site name</label>
          <input class="bb-input" id="site-name" name="name" placeholder="My author website" required>
        </div>
        <div class="bb-field" style="margin:0">
          <label class="bb-label" for="site-domain">Domain</label>
          <input class="bb-input" id="site-domain" name="domain" placeholder="example.com" required>
        </div>
        <button type="submit" class="bb-btn bb-btn--primary">Create tracking key</button>
      </form>

      <details style="margin-top:var(--bb-5)">
        <summary class="bb-small" style="cursor:pointer">How to record a purchase</summary>
        <p class="bb-small bb-muted" style="margin-top:var(--bb-3)">
          Page views are tracked automatically. Call this on your thank-you page, with the order
          total:
        </p>
        <code class="bb-code">bookboost('purchase', { value: 8.99, currency: 'EUR' });</code>
        <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
          You are the controller of your visitors' data on your own site. Where your cookie or
          consent policy requires it, gate the script behind consent — it reads a
          <code>window.bookboostConsent</code> flag for exactly that. This is not legal advice.
        </p>
      </details>
    </section>
  `;
}

function amazonCard(amazon, capabilities) {
  const connected = amazon?.status === "connected";
  return html`
    <section class="bb-card">
      <div class="bb-card__header">
        <div class="bb-card__title">Amazon Attribution</div>
        <span class="bb-badge ${connected ? "bb-badge--success" : ""}">${connected ? "Connected" : "Not connected"}</span>
      </div>
      <div class="bb-alert bb-alert--info" style="margin-bottom:var(--bb-4)">
        <span class="bb-alert__icon">◆</span>
        <div class="bb-small">
          <strong>What this can and can't do.</strong> Amazon does not report your KDP sales to
          third-party tools, and no advertising platform can change that. What it does offer is
          Amazon Attribution: if you have an eligible account, its click, detail-page-view,
          add-to-cart and purchase data can be connected here and reported alongside your ad spend.
          Those figures stay labelled as Amazon-attributed and are never merged with sales tracked on
          your own website.
        </div>
      </div>
      <p class="bb-small bb-muted">
        Connect eligible Amazon Attribution campaigns to measure traffic and conversion performance
        for books you sell on Amazon.
      </p>
      <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" disabled>
        ${capabilities?.amazon ? "Connect Amazon Attribution" : "Connect integration — coming soon"}
      </button>
      <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-2)">
        The import is built into the data model and the analytics already separate the two sources.
        The connection itself isn't available on this deployment yet, and the button says so rather
        than failing when you press it.
      </p>
    </section>
  `;
}

function comingSoonCard() {
  const platforms = [
    ["TikTok Ads", "Short-form video campaigns for the same angles."],
    ["Google Ads", "Search demand for readers already looking."],
    ["Pinterest Ads", "Strong for several non-fiction categories."],
  ];
  return html`
    <section class="bb-card">
      <div class="bb-card__title" style="margin-bottom:var(--bb-3)">On the roadmap</div>
      <div class="bb-grid bb-grid--3">
        ${raw(platforms.map(([name, note]) => html`
          <div class="bb-panel">
            <div class="bb-row bb-row--between"><strong class="bb-small">${name}</strong><span class="bb-badge">Planned</span></div>
            <p class="bb-tiny bb-muted" style="margin:6px 0 0">${note}</p>
          </div>`).join(""))}
      </div>
      <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
        Listed so you know what's coming — not shown as switches that do nothing.
      </p>
    </section>
  `;
}
