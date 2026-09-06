// Settings, privacy controls and account deletion (spec §7, §34).
//
// The GDPR controls are here rather than buried in a legal page,
// because a right you can't find isn't a right: export, delete, and
// switch off analytics and marketing in two clicks.

import { html, raw, $, formData, setBusy } from "../core/dom.js";
import { API, isDemo } from "../core/api.js";
import * as store from "../core/store.js";
import { notify, openModal } from "../core/toast.js";
import { refreshAccount } from "../core/session.js";
import { GENRES, CURRENCIES } from "./options.js";
import { pageHead, demoBadge } from "./shared.js";
import { currentTheme, toggleTheme } from "../core/theme.js";

const LANGUAGES = [["en", "English"], ["de", "Deutsch"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"]];

export async function render(container) {
  const profile = store.get("profile") || {};
  const plan = store.get("plan");

  container.innerHTML = html`
    ${raw(pageHead({
      title: "Settings",
      description: "Your profile, your preferences and your data.",
      actions: demoBadge(),
    }))}

    <div class="bb-stack-lg" style="max-width:760px">
      <section class="bb-card">
        <div class="bb-card__title" style="margin-bottom:var(--bb-4)">Profile</div>
        <form id="profile-form">
          <div class="bb-field">
            <label class="bb-label" for="full_name">Name</label>
            <input class="bb-input" id="full_name" name="full_name" value="${profile.full_name || ""}" maxlength="120">
          </div>
          <div class="bb-field">
            <label class="bb-label" for="email">Email</label>
            <input class="bb-input" id="email" value="${profile.email || ""}" disabled>
            <div class="bb-hint">Changing your sign-in email isn't available yet — contact support if you need it moved.</div>
          </div>
          <div class="bb-field-row">
            <div class="bb-field">
              <label class="bb-label" for="country">Country</label>
              <input class="bb-input" id="country" name="country" value="${profile.country || ""}" maxlength="60">
            </div>
            <div class="bb-field">
              <label class="bb-label" for="currency">Currency</label>
              <select class="bb-select" id="currency" name="currency">${raw(CURRENCIES)}</select>
            </div>
            <div class="bb-field">
              <label class="bb-label" for="language">Language</label>
              <select class="bb-select" id="language" name="language">
                ${raw(LANGUAGES.map(([code, label]) => html`<option value="${code}">${label}</option>`).join(""))}
              </select>
            </div>
          </div>
          <div class="bb-field">
            <label class="bb-label" for="author_type">What best describes you?</label>
            <select class="bb-select" id="author_type" name="author_type">
              ${raw([
                ["author", "Independent author"],
                ["publisher", "Small publisher"],
                ["coach", "Coach"],
                ["creator", "Course or digital-product creator"],
              ].map(([value, label]) => html`<option value="${value}">${label}</option>`).join(""))}
            </select>
          </div>
          <div class="bb-field">
            <label class="bb-label">Genres you write in</label>
            <div class="bb-chips" id="genre-chips">
              ${raw(GENRES.map((genre) => html`
                <button type="button" class="bb-chip ${(profile.genres || []).includes(genre) ? "bb-chip--active" : ""}" data-genre="${genre}">${genre}</button>`).join(""))}
            </div>
          </div>
          <button type="submit" class="bb-btn bb-btn--primary">Save profile</button>
        </form>
      </section>

      <section class="bb-card">
        <div class="bb-card__title" style="margin-bottom:var(--bb-4)">Appearance</div>
        <div class="bb-row bb-row--between">
          <div>
            <strong class="bb-small">Theme</strong>
            <p class="bb-small bb-muted" style="margin:2px 0 0">Currently ${currentTheme()}. Without a choice here, your device's setting decides.</p>
          </div>
          <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="theme-toggle">Switch theme</button>
        </div>
      </section>

      <section class="bb-card">
        <div class="bb-card__title" style="margin-bottom:var(--bb-2)">Privacy settings</div>
        <p class="bb-small bb-muted" style="margin-bottom:var(--bb-4)">
          Both are off unless you switch them on, and switching one off takes effect immediately.
          Neither is needed to use BookBoost.
        </p>
        <div class="bb-stack-sm">
          <label class="bb-checkbox ${profile.analytics_consent ? "bb-checkbox--selected" : ""}">
            <input type="checkbox" id="analytics_consent" ${profile.analytics_consent ? "checked" : ""}>
            <span><strong class="bb-small">Product analytics</strong><br>
            <span class="bb-small bb-muted">Let us see which features get used so we know what to improve.</span></span>
          </label>
          <label class="bb-checkbox ${profile.marketing_consent ? "bb-checkbox--selected" : ""}">
            <input type="checkbox" id="marketing_consent" ${profile.marketing_consent ? "checked" : ""}>
            <span><strong class="bb-small">Product emails</strong><br>
            <span class="bb-small bb-muted">Occasional updates about new features. Never your book data, never sold on.</span></span>
          </label>
        </div>
        <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
          Each change is recorded with a timestamp so there's a record of what you agreed to and when.
          See the <a href="/privacy.html">privacy policy</a> for what's collected.
        </p>
      </section>

      <section class="bb-card">
        <div class="bb-card__title" style="margin-bottom:var(--bb-2)">Your data</div>
        <p class="bb-small bb-muted" style="margin-bottom:var(--bb-4)">
          Everything BookBoost holds about you, in one file — books, analysis, personas, angles,
          creatives, campaigns, tracking events, usage and consent history.
        </p>
        <div class="bb-row bb-row--wrap">
          <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="export-btn">Export my data</button>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="/privacy.html">Privacy policy</a>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="/cookies.html">Cookie policy</a>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="/terms.html">Terms</a>
        </div>
      </section>

      <section class="bb-card" style="border-color:var(--bb-danger-border)">
        <div class="bb-card__title" style="margin-bottom:var(--bb-2)">Delete your account</div>
        <p class="bb-small bb-muted" style="margin-bottom:var(--bb-4)">
          Permanently erases your profile, books, creatives, campaigns and tracking data. Campaigns
          already running on Meta are not stopped by this — pause those in Ads Manager first.
          This cannot be undone.
        </p>
        <button type="button" class="bb-btn bb-btn--danger bb-btn--sm" id="delete-btn">Delete my account</button>
      </section>

      ${raw(plan ? html`
        <p class="bb-tiny bb-subtle">
          You're on the ${plan.name} plan. Change it in <a href="#/billing">Billing</a>.
        </p>` : "")}
    </div>
  `;

  $("#currency").value = profile.currency || "EUR";
  $("#language").value = profile.language || "en";
  $("#author_type").value = profile.author_type || "author";

  let genres = [...(profile.genres || [])];
  container.querySelectorAll("[data-genre]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const genre = chip.dataset.genre;
      if (genres.includes(genre)) genres = genres.filter((g) => g !== genre);
      else genres.push(genre);
      chip.classList.toggle("bb-chip--active");
    });
  });

  $("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(event.target);
    const button = event.target.querySelector('button[type="submit"]');
    setBusy(button, true, "Saving…");
    try {
      await API.updateMe({ ...values, genres });
      await refreshAccount();
      notify.success("Profile saved.");
    } catch (err) {
      notify.error(err.message);
    }
    setBusy(button, false);
  });

  $("#theme-toggle").addEventListener("click", () => {
    toggleTheme();
    render(container);
  });

  const consentHandler = (id, field) => {
    $(id).addEventListener("change", async (event) => {
      try {
        await API.updateMe({ [field]: event.target.checked });
        await refreshAccount();
        event.target.closest("label").classList.toggle("bb-checkbox--selected", event.target.checked);
        notify.success("Preference saved.");
      } catch (err) {
        event.target.checked = !event.target.checked;
        notify.error(err.message);
      }
    });
  };
  consentHandler("#analytics_consent", "analytics_consent");
  consentHandler("#marketing_consent", "marketing_consent");

  $("#export-btn").addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Preparing…");
    try {
      const data = await API.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bookboost-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify.success("Your data has been downloaded.");
    } catch (err) {
      notify.error(err.message);
    }
    setBusy(event.currentTarget, false);
  });

  $("#delete-btn").addEventListener("click", () => {
    if (isDemo()) {
      notify.info("There's no account to delete in the demo workspace.");
      return;
    }
    const { root, close } = openModal(html`
      <div class="bb-modal__header"><h3>Delete your account</h3></div>
      <p class="bb-muted">
        This erases your profile, books, analyses, personas, angles, creatives, campaigns, tracking
        events and usage history. It cannot be undone, and we cannot recover it for you afterwards.
      </p>
      <p class="bb-small bb-muted">
        If you have live campaigns on Meta, pause them in Ads Manager first — deleting your BookBoost
        account does not stop them.
      </p>
      <div class="bb-field" style="margin-top:var(--bb-5)">
        <label class="bb-label" for="confirm-input">Type DELETE to confirm</label>
        <input class="bb-input" id="confirm-input" autocomplete="off">
      </div>
      <div class="bb-modal__footer">
        <button type="button" class="bb-btn bb-btn--ghost" data-close>Cancel</button>
        <button type="button" class="bb-btn bb-btn--danger" id="confirm-delete">Delete permanently</button>
      </div>
    `);

    root.querySelector("#confirm-delete").addEventListener("click", async (event) => {
      const value = root.querySelector("#confirm-input").value.trim();
      if (value !== "DELETE") {
        notify.error("Type DELETE exactly to confirm.");
        return;
      }
      setBusy(event.currentTarget, true, "Deleting…");
      try {
        await API.deleteAccount("DELETE");
        close();
        notify.success("Your account has been deleted.");
        setTimeout(() => { location.href = "/"; }, 1200);
      } catch (err) {
        notify.error(err.message);
        setBusy(event.currentTarget, false);
      }
    });
  });
}
