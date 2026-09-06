// Sign in, sign up, password reset.
//
// These screens replace the shell entirely — there is no navigation to
// show until there's an account.

import { html, raw, $, formData, setBusy } from "../core/dom.js";
import * as auth from "../core/auth.js";
import { notify } from "../core/toast.js";
import * as store from "../core/store.js";
import { isDemo } from "../core/api.js";

function shell(title, body, footer) {
  return html`
    <div class="bb-auth">
      <div class="bb-auth__card">
        <a class="bb-auth__brand" href="/">
          <span class="bb-sidebar__mark">B</span> BookBoost <span class="bb-logo__ai">AI</span>
        </a>
        <h1 style="font-size:1.35rem;text-align:center;margin-bottom:var(--bb-2)">${title}</h1>
        ${raw(body)}
        ${raw(footer || "")}
      </div>
    </div>
  `;
}

function googleButton(enabled) {
  if (!enabled) return "";
  return `
    <button type="button" class="bb-btn bb-btn--secondary bb-btn--block" id="google-btn">
      Continue with Google
    </button>
    <div class="bb-row" style="margin:var(--bb-4) 0">
      <div class="bb-divider bb-flex-1" style="margin:0"></div>
      <span class="bb-tiny bb-subtle">or</span>
      <div class="bb-divider bb-flex-1" style="margin:0"></div>
    </div>`;
}

function unavailableNotice() {
  return `
    <div class="bb-alert bb-alert--info" style="margin-bottom:var(--bb-5)">
      <span class="bb-alert__icon">◆</span>
      <div>
        <div class="bb-alert__title">Accounts aren't switched on here yet</div>
        <div class="bb-small">
          This deployment has no database connected, so sign-up is unavailable. You can still
          explore the whole product in the demo workspace.
        </div>
        <a class="bb-btn bb-btn--primary bb-btn--sm" style="margin-top:var(--bb-3)" href="/app.html?demo=1#/overview">
          Open the demo
        </a>
      </div>
    </div>`;
}

export function render(root, mode) {
  const configured = auth.isConfigured();
  const googleEnabled = configured && store.get("config")?.flags?.google_oauth;
  const target = root.id === "app-root" ? root : document.body;

  if (mode === "signup") {
    target.innerHTML = shell(
      "Create your account",
      `${configured ? "" : unavailableNotice()}
       ${googleButton(googleEnabled)}
       <form id="auth-form" novalidate>
         <div class="bb-field">
           <label class="bb-label" for="name">Your name</label>
           <input class="bb-input" id="name" name="fullName" autocomplete="name" required>
         </div>
         <div class="bb-field">
           <label class="bb-label" for="email">Email</label>
           <input class="bb-input" id="email" name="email" type="email" autocomplete="email" required>
         </div>
         <div class="bb-field">
           <label class="bb-label" for="password">Password</label>
           <input class="bb-input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
           <div class="bb-hint">At least 8 characters.</div>
         </div>
         <label class="bb-checkbox" style="margin-bottom:var(--bb-5)">
           <input type="checkbox" name="terms" required>
           <span class="bb-small">
             I agree to the <a href="/terms.html">terms of service</a> and the
             <a href="/privacy.html">privacy policy</a>.
           </span>
         </label>
         <button type="submit" class="bb-btn bb-btn--primary bb-btn--block" ${configured ? "" : "disabled"}>
           Create account
         </button>
       </form>`,
      `<p class="bb-small bb-center bb-muted" style="margin-top:var(--bb-5)">
         Already have an account? <a href="#/signin">Sign in</a>
       </p>`
    );
  } else if (mode === "reset") {
    target.innerHTML = shell(
      "Reset your password",
      `<p class="bb-small bb-muted bb-center" style="margin-bottom:var(--bb-5)">
         We'll email you a link to choose a new one.
       </p>
       <form id="auth-form">
         <div class="bb-field">
           <label class="bb-label" for="email">Email</label>
           <input class="bb-input" id="email" name="email" type="email" autocomplete="email" required>
         </div>
         <button type="submit" class="bb-btn bb-btn--primary bb-btn--block" ${configured ? "" : "disabled"}>
           Send reset link
         </button>
       </form>`,
      `<p class="bb-small bb-center bb-muted" style="margin-top:var(--bb-5)"><a href="#/signin">Back to sign in</a></p>`
    );
  } else {
    target.innerHTML = shell(
      "Welcome back",
      `${configured ? "" : unavailableNotice()}
       ${googleButton(googleEnabled)}
       <form id="auth-form">
         <div class="bb-field">
           <label class="bb-label" for="email">Email</label>
           <input class="bb-input" id="email" name="email" type="email" autocomplete="email" required>
         </div>
         <div class="bb-field">
           <label class="bb-label" for="password">Password</label>
           <input class="bb-input" id="password" name="password" type="password" autocomplete="current-password" required>
         </div>
         <button type="submit" class="bb-btn bb-btn--primary bb-btn--block" ${configured ? "" : "disabled"}>
           Sign in
         </button>
       </form>`,
      `<p class="bb-small bb-center bb-muted" style="margin-top:var(--bb-5)">
         <a href="#/reset">Forgot your password?</a>
       </p>
       <p class="bb-small bb-center bb-muted">
         New here? <a href="#/signup">Create an account</a> ·
         <a href="/app.html?demo=1#/overview">Try the demo</a>
       </p>`
    );
  }

  $("#google-btn")?.addEventListener("click", () => {
    try {
      auth.signInWithGoogle();
    } catch (err) {
      notify.error(err.message);
    }
  });

  const form = $("#auth-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(form);
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, "Just a moment…");
    try {
      if (mode === "signup") {
        if (!form.querySelector('[name="terms"]').checked) {
          throw new Error("Please accept the terms to continue.");
        }
        const { needsConfirmation } = await auth.signUp(values);
        if (needsConfirmation) {
          form.innerHTML = `
            <div class="bb-alert bb-alert--success">
              <span class="bb-alert__icon">✓</span>
              <div>
                <div class="bb-alert__title">Check your inbox</div>
                <div class="bb-small">We've sent a confirmation link. Open it and you'll land straight in your workspace.</div>
              </div>
            </div>`;
          return;
        }
        location.hash = "#/onboarding";
        location.reload();
      } else if (mode === "reset") {
        await auth.requestPasswordReset(values.email);
        notify.success("If that email has an account, a reset link is on its way.");
      } else {
        await auth.signIn(values);
        location.hash = "#/overview";
        location.reload();
      }
    } catch (err) {
      notify.error(err.message);
      setBusy(button, false);
    }
  });

  // Demo visitors reach these screens from the "create an account"
  // prompt; make the way back obvious.
  if (isDemo()) {
    const card = target.querySelector(".bb-auth__card");
    card?.insertAdjacentHTML(
      "beforeend",
      `<p class="bb-tiny bb-center bb-subtle" style="margin-top:var(--bb-4)">
         <a href="/app.html?demo=1#/overview">Back to the demo workspace</a>
       </p>`
    );
  }
}
