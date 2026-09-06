// The account snapshot the shell renders from (profile, plan, credits,
// counts). Kept out of app.js so views can refresh it without importing
// the bootstrap module back into themselves.

import { API } from "./api.js";
import * as store from "./store.js";
import { setLocale } from "./format.js";

export async function refreshAccount() {
  const me = await API.me();
  store.set({ profile: me.profile, plan: me.plan, counts: me.counts });
  setLocale(me.profile?.language === "de" ? "de-DE" : "en-GB");
  return me;
}
