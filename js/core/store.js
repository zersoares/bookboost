// A very small observable store.
//
// Views read from it and re-render on change; nothing here is clever,
// because a dashboard's state is mostly "the last thing the API said".

const state = {
  ready: false,
  demo: false,
  config: null,
  profile: null,
  plan: null,
  counts: {},
  books: [],
  campaigns: [],
  creatives: [],
  notifications: [],
  integrations: [],
};

const listeners = new Set();

export function get(key) {
  return key ? state[key] : state;
}

export function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bookById(id) {
  return state.books.find((b) => b.id === id) || null;
}

export function campaignById(id) {
  return state.campaigns.find((c) => c.id === id) || null;
}

/** Credits are shown in the header, so keep one place that adjusts them. */
export function spendCredits(amount) {
  if (!amount || !state.profile) return;
  set({ profile: { ...state.profile, ai_credits: Math.max(0, state.profile.ai_credits - amount) } });
}
