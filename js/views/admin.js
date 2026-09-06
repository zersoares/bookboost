// Admin dashboard (spec §31).
//
// Reachable only when the caller's own profile row says role = 'admin'.
// The server re-checks that on every request with the caller's own JWT —
// hiding the nav link is a convenience, not the control.

import { html, raw, $, setBusy } from "../core/dom.js";
import { API } from "../core/api.js";
import { notify, confirmDialog, openModal } from "../core/toast.js";
import { pageHead, fmt, loading, errorBox } from "./shared.js";

let tab = "overview";

export async function render(container) {
  container.innerHTML = html`
    ${raw(pageHead({
      title: "Admin",
      description: "Usage, plans, credit costs, prompts and feature flags.",
    }))}
    <div class="bb-tabs" style="margin-bottom:var(--bb-6)">
      <button type="button" class="bb-tab" data-tab="overview">Overview</button>
      <button type="button" class="bb-tab" data-tab="users">Users</button>
      <button type="button" class="bb-tab" data-tab="plans">Plans &amp; credits</button>
      <button type="button" class="bb-tab" data-tab="prompts">AI prompts</button>
      <button type="button" class="bb-tab" data-tab="flags">Flags &amp; settings</button>
    </div>
    <div id="admin-body">${raw(loading(3))}</div>
  `;

  const paint = async () => {
    container.querySelectorAll(".bb-tab").forEach((button) => {
      button.classList.toggle("bb-tab--active", button.dataset.tab === tab);
    });
    const body = $("#admin-body");
    body.innerHTML = loading(3);
    try {
      if (tab === "overview") await renderOverview(body);
      else if (tab === "users") await renderUsers(body);
      else if (tab === "plans") await renderPlans(body);
      else if (tab === "prompts") await renderPrompts(body, paint);
      else await renderFlags(body);
    } catch (err) {
      body.innerHTML = errorBox(err.message);
    }
  };

  container.querySelectorAll(".bb-tab").forEach((button) => {
    button.addEventListener("click", () => {
      tab = button.dataset.tab;
      paint();
    });
  });

  await paint();
}

async function renderOverview(body) {
  const { stats } = await API.adminOverview();
  const stat = (label, value, meta = "") => html`
    <div class="bb-stat">
      <div class="bb-stat__label">${label}</div>
      <div class="bb-stat__value">${value}</div>
      ${meta ? raw(html`<div class="bb-stat__meta">${meta}</div>`) : ""}
    </div>`;

  body.innerHTML = html`
    <div class="bb-stack-lg">
      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Accounts</h2>
        <div class="bb-stat-grid">
          ${raw(stat("Total users", fmt.number(stats.total_users)))}
          ${raw(stat("New (30 days)", fmt.number(stats.new_users_30d)))}
          ${raw(stat("Active (30 days)", fmt.number(stats.active_users_30d), "used AI at least once"))}
          ${raw(stat("Paying", fmt.number(stats.paying_users)))}
          ${raw(stat("MRR", fmt.money(stats.mrr_cents)))}
        </div>
      </section>

      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">AI usage</h2>
        <div class="bb-stat-grid">
          ${raw(stat("Credits (30 days)", fmt.number(stats.credits_30d)))}
          ${raw(stat("Generations (30 days)", fmt.number(stats.ai_calls_30d)))}
          ${raw(stat("Failures (30 days)", fmt.number(stats.ai_failures_30d), "refunded automatically"))}
        </div>
      </section>

      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Product</h2>
        <div class="bb-stat-grid">
          ${raw(stat("Books", fmt.number(stats.books)))}
          ${raw(stat("Campaigns", fmt.number(stats.campaigns)))}
          ${raw(stat("Live campaigns", fmt.number(stats.live_campaigns)))}
          ${raw(stat("Ad spend tracked", fmt.money(stats.ad_spend_cents), "excludes demo data"))}
          ${raw(stat("Conversion events", fmt.number(stats.conversion_events)))}
        </div>
      </section>
    </div>
  `;
}

async function renderUsers(body) {
  const { users } = await API.adminUsers();
  body.innerHTML = html`
    <div class="bb-card bb-card--flush">
      <div class="bb-table-wrap">
        <table class="bb-table">
          <thead><tr><th>Name</th><th>Email</th><th>Country</th><th>Plan</th>
          <th class="bb-num">Credits</th><th>Role</th><th>Joined</th><th>Onboarded</th></tr></thead>
          <tbody>
            ${raw(users.map((user) => html`<tr>
              <td>${user.full_name || "—"}</td>
              <td class="bb-small bb-muted">${user.email || "—"}</td>
              <td class="bb-small">${user.country || "—"}</td>
              <td>${fmt.titleCase(user.plan_id)}</td>
              <td class="bb-num">${fmt.number(user.ai_credits)}</td>
              <td>${user.role === "admin" ? raw('<span class="bb-badge bb-badge--primary">Admin</span>') : "User"}</td>
              <td class="bb-small bb-muted bb-nowrap">${fmt.date(user.created_at)}</td>
              <td class="bb-small">${user.onboarding_step >= 6 ? "Yes" : `Step ${user.onboarding_step}`}</td>
            </tr>`).join(""))}
          </tbody>
        </table>
      </div>
    </div>
    <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
      Newest 50 accounts. This list intentionally shows no book content — support does not need to
      read someone's manuscript to help them.
    </p>
  `;
}

async function renderPlans(body) {
  const { plans, creditCosts } = await API.adminSettings();

  body.innerHTML = html`
    <div class="bb-stack-lg">
      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Plans</h2>
        <div class="bb-card bb-card--flush">
          <div class="bb-table-wrap">
            <table class="bb-table">
              <thead><tr><th>Plan</th><th class="bb-num">Price</th><th class="bb-num">Books</th>
              <th class="bb-num">Creatives/mo</th><th class="bb-num">Credits/mo</th><th>Stripe price</th><th></th></tr></thead>
              <tbody>
                ${raw(plans.map((plan) => html`<tr data-plan-row="${plan.id}">
                  <td><strong>${plan.name}</strong></td>
                  <td class="bb-num"><input class="bb-input bb-num" style="width:96px" type="number" min="0" step="1" data-field="price_cents" value="${plan.price_cents}"></td>
                  <td class="bb-num"><input class="bb-input bb-num" style="width:76px" type="number" min="0" data-field="book_limit" value="${plan.book_limit ?? ""}" placeholder="∞"></td>
                  <td class="bb-num"><input class="bb-input bb-num" style="width:76px" type="number" min="0" data-field="creative_limit" value="${plan.creative_limit ?? ""}" placeholder="∞"></td>
                  <td class="bb-num"><input class="bb-input bb-num" style="width:86px" type="number" min="0" data-field="monthly_credits" value="${plan.monthly_credits}"></td>
                  <td><input class="bb-input" style="width:170px" data-field="stripe_price_id" value="${plan.stripe_price_id || ""}" placeholder="price_…"></td>
                  <td><button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" data-save-plan="${plan.id}">Save</button></td>
                </tr>`).join(""))}
              </tbody>
            </table>
          </div>
        </div>
        <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
          Price is in cents. Leave a limit blank for unlimited. A plan can't be bought until its
          Stripe price id is set.
        </p>
      </section>

      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Credit costs</h2>
        <div class="bb-card bb-card--flush">
          <div class="bb-table-wrap">
            <table class="bb-table">
              <thead><tr><th>Operation</th><th class="bb-num">Credits</th><th></th></tr></thead>
              <tbody>
                ${raw(creditCosts.map((cost) => html`<tr data-cost-row="${cost.operation}">
                  <td>${cost.label}<div class="bb-tiny bb-subtle">${cost.operation}</div></td>
                  <td class="bb-num"><input class="bb-input bb-num" style="width:76px" type="number" min="0" max="1000" data-field="credits" value="${cost.credits}"></td>
                  <td><button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" data-save-cost="${cost.operation}">Save</button></td>
                </tr>`).join(""))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;

  body.querySelectorAll("[data-save-plan]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-plan-row]");
      const read = (field) => row.querySelector(`[data-field="${field}"]`).value;
      const patch = {
        price_cents: Number(read("price_cents")),
        monthly_credits: Number(read("monthly_credits")),
        book_limit: read("book_limit") === "" ? null : Number(read("book_limit")),
        creative_limit: read("creative_limit") === "" ? null : Number(read("creative_limit")),
        stripe_price_id: read("stripe_price_id") || null,
      };
      setBusy(button, true, "Saving");
      try {
        await API.adminUpdatePlan(button.dataset.savePlan, patch);
        notify.success("Plan updated.");
      } catch (err) {
        notify.error(err.message);
      }
      setBusy(button, false);
    });
  });

  body.querySelectorAll("[data-save-cost]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-cost-row]");
      setBusy(button, true, "Saving");
      try {
        await API.adminUpdateCost(button.dataset.saveCost, Number(row.querySelector('[data-field="credits"]').value));
        notify.success("Credit cost updated.");
      } catch (err) {
        notify.error(err.message);
      }
      setBusy(button, false);
    });
  });
}

async function renderPrompts(body, repaint) {
  const { prompts } = await API.adminPrompts();
  const anyOverridden = prompts.some((p) => p.overridden);

  body.innerHTML = html`
    <div class="bb-stack">
      <div class="bb-alert bb-alert--info">
        <span class="bb-alert__icon">◆</span>
        <div class="bb-small">
          Prompts ship with the code so a change to what the AI is told shows up in a code review.
          Publishing the defaults copies them into the database, after which edits here take effect
          without a deploy. Every prompt inherits the same advertising-content rules — no invented
          reviews, awards or sales figures, no guaranteed outcomes, no targeting on protected
          characteristics — and those rules are not editable from this screen.
        </div>
      </div>

      ${raw(anyOverridden ? "" : `
        <button type="button" class="bb-btn bb-btn--primary bb-btn--sm" id="publish-defaults" style="align-self:flex-start">
          Publish defaults to the editable registry
        </button>`)}

      <div class="bb-card bb-card--flush">
        <div class="bb-table-wrap">
          <table class="bb-table">
            <thead><tr><th>Prompt</th><th>Model</th><th>Effort</th><th class="bb-num">Max tokens</th><th>Source</th><th></th></tr></thead>
            <tbody>
              ${raw(prompts.map((prompt) => html`<tr>
                <td><strong>${prompt.label}</strong><div class="bb-tiny bb-subtle">${prompt.key}</div></td>
                <td class="bb-small">${prompt.stored?.model || prompt.model}</td>
                <td class="bb-small">${prompt.stored?.effort || prompt.effort}</td>
                <td class="bb-num">${prompt.stored?.max_tokens || prompt.max_tokens}</td>
                <td>${prompt.overridden
                  ? raw('<span class="bb-badge bb-badge--warning">Database override</span>')
                  : raw('<span class="bb-badge">Bundled default</span>')}</td>
                <td><button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" data-view="${prompt.key}">View</button></td>
              </tr>`).join(""))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $("#publish-defaults")?.addEventListener("click", async (event) => {
    const confirmed = await confirmDialog({
      title: "Publish default prompts?",
      message:
        "This copies every bundled prompt into the database so they can be edited here. Afterwards, the database version is what runs.",
      confirmLabel: "Publish",
    });
    if (!confirmed) return;
    setBusy(event.currentTarget, true, "Publishing…");
    try {
      await API.adminPublishPrompts();
      notify.success("Defaults published.");
      repaint();
    } catch (err) {
      notify.error(err.message);
      setBusy(event.currentTarget, false);
    }
  });

  body.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = prompts.find((p) => p.key === button.dataset.view);
      const stored = prompt.stored || prompt;
      const { root, close } = openModal(html`
        <div class="bb-modal__header"><h3>${prompt.label}</h3></div>
        <div class="bb-field">
          <label class="bb-label" for="p-system">System prompt</label>
          <textarea class="bb-textarea" id="p-system" rows="12" ${prompt.overridden ? "" : "readonly"}>${stored.system_prompt}</textarea>
        </div>
        <div class="bb-field">
          <label class="bb-label" for="p-user">User template</label>
          <textarea class="bb-textarea" id="p-user" rows="8" ${prompt.overridden ? "" : "readonly"}>${stored.user_template}</textarea>
        </div>
        <div class="bb-field-row">
          <div class="bb-field">
            <label class="bb-label" for="p-model">Model</label>
            <select class="bb-select" id="p-model" ${prompt.overridden ? "" : "disabled"}>
              ${raw(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"].map((m) => html`<option value="${m}">${m}</option>`).join(""))}
            </select>
          </div>
          <div class="bb-field">
            <label class="bb-label" for="p-effort">Effort</label>
            <select class="bb-select" id="p-effort" ${prompt.overridden ? "" : "disabled"}>
              ${raw(["low", "medium", "high", "xhigh", "max"].map((e) => html`<option value="${e}">${e}</option>`).join(""))}
            </select>
          </div>
          <div class="bb-field">
            <label class="bb-label" for="p-tokens">Max tokens</label>
            <input class="bb-input" id="p-tokens" type="number" min="512" max="16000" value="${stored.max_tokens}" ${prompt.overridden ? "" : "disabled"}>
          </div>
        </div>
        ${prompt.overridden ? "" : `
          <p class="bb-small bb-muted">
            Read-only: this prompt is running from the bundled default. Publish the defaults first to
            make it editable.
          </p>`}
        <div class="bb-modal__footer">
          <button type="button" class="bb-btn bb-btn--ghost" data-close>Close</button>
          ${prompt.overridden ? '<button type="button" class="bb-btn bb-btn--primary" id="save-prompt">Save</button>' : ""}
        </div>
      `, { wide: true });

      root.querySelector("#p-model").value = stored.model;
      root.querySelector("#p-effort").value = stored.effort;

      root.querySelector("#save-prompt")?.addEventListener("click", async (event) => {
        setBusy(event.currentTarget, true, "Saving…");
        try {
          await API.adminUpdatePrompt(prompt.key, {
            system_prompt: root.querySelector("#p-system").value,
            user_template: root.querySelector("#p-user").value,
            model: root.querySelector("#p-model").value,
            effort: root.querySelector("#p-effort").value,
            max_tokens: Number(root.querySelector("#p-tokens").value),
          });
          notify.success("Prompt saved.");
          close();
          repaint();
        } catch (err) {
          notify.error(err.message);
          setBusy(event.currentTarget, false);
        }
      });
    });
  });
}

async function renderFlags(body) {
  const { flags, settings } = await API.adminSettings();

  body.innerHTML = html`
    <div class="bb-stack-lg">
      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Feature flags</h2>
        <div class="bb-stack-sm">
          ${raw(flags.map((flag) => html`
            <label class="bb-checkbox ${flag.enabled ? "bb-checkbox--selected" : ""}">
              <input type="checkbox" data-flag="${flag.key}" ${flag.enabled ? "checked" : ""}>
              <span><strong class="bb-small">${fmt.titleCase(flag.key)}</strong><br>
              <span class="bb-small bb-muted">${flag.description || ""}</span></span>
            </label>`).join(""))}
        </div>
        <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
          A flag only enables a feature whose credentials are configured on the server. Turning one on
          without them leaves the UI showing "Connect integration" rather than a control that fails.
        </p>
      </section>

      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">System settings</h2>
        <div class="bb-card bb-card--flush">
          <div class="bb-table-wrap">
            <table class="bb-table">
              <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
              <tbody>
                ${raw(settings.map((setting) => html`<tr data-setting-row="${setting.key}">
                  <td><code class="bb-mono">${setting.key}</code></td>
                  <td><input class="bb-input" data-field="value" value="${JSON.stringify(setting.value)}"></td>
                  <td><button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" data-save-setting="${setting.key}">Save</button></td>
                </tr>`).join(""))}
              </tbody>
            </table>
          </div>
        </div>
        <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
          Values are JSON. <code class="bb-mono">ai_model</code> only accepts a model the server
          allows; anything else falls back to the default rather than failing every generation.
        </p>
      </section>
    </div>
  `;

  body.querySelectorAll("[data-flag]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await API.adminUpdateFlag(input.dataset.flag, input.checked);
        input.closest("label").classList.toggle("bb-checkbox--selected", input.checked);
        notify.success("Flag updated.");
      } catch (err) {
        input.checked = !input.checked;
        notify.error(err.message);
      }
    });
  });

  body.querySelectorAll("[data-save-setting]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-setting-row]");
      const text = row.querySelector('[data-field="value"]').value;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        notify.error("That isn't valid JSON. Strings need quotes around them.");
        return;
      }
      setBusy(button, true, "Saving");
      try {
        await API.adminUpdateSetting(button.dataset.saveSetting, value);
        notify.success("Setting saved.");
      } catch (err) {
        notify.error(err.message);
      }
      setBusy(button, false);
    });
  });
}
