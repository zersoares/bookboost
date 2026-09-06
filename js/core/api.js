// The API client.
//
// One place that knows how to attach the bearer token, how to turn a
// non-2xx response into a readable message, and how to route a call to
// the demo workspace instead of the network when demo mode is on.

import { accessToken, signOut } from "./auth.js";

export class ApiError extends Error {
  constructor(code, message, status, detail) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

let demoAdapter = null;

/** Demo mode swaps the whole client for an in-memory implementation. */
export function useDemoAdapter(adapter) {
  demoAdapter = adapter;
}

export function isDemo() {
  return Boolean(demoAdapter);
}

async function request(method, path, body) {
  if (demoAdapter) return demoAdapter.request(method, path, body);

  const token = await accessToken();
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "offline",
      "We couldn't reach BookBoost. Check your connection and try again.",
      0
    );
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error || {};
    if (res.status === 401) {
      // The session is gone or invalid; drop it so the app returns to
      // the sign-in screen rather than looping on failed calls.
      await signOut();
    }
    throw new ApiError(
      error.code || "error",
      error.message || "Something went wrong. Please try again.",
      res.status,
      error.detail
    );
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body || {}),
  patch: (path, body) => request("PATCH", path, body || {}),
  delete: (path) => request("DELETE", path),
};

// --- Endpoints --------------------------------------------------------
// Named wrappers so a route change touches one line, and so the demo
// adapter has a single vocabulary to implement.

export const API = {
  config: () => api.get("/api/bb/config"),

  me: () => api.get("/api/bb/me"),
  updateMe: (patch) => api.patch("/api/bb/me", patch),
  exportData: () => api.get("/api/bb/me/export"),
  deleteAccount: (confirm) => api.post("/api/bb/me/delete", { confirm }),

  books: () => api.get("/api/bb/books"),
  book: (id) => api.get(`/api/bb/books/${id}`),
  createBook: (book) => api.post("/api/bb/books", book),
  updateBook: (id, patch) => api.patch(`/api/bb/books/${id}`, patch),
  deleteBook: (id) => api.delete(`/api/bb/books/${id}`),
  strategy: (id) => api.get(`/api/bb/books/${id}/strategy`),

  creatives: (query = "") => api.get(`/api/bb/creatives${query}`),
  creative: (id) => api.get(`/api/bb/creatives/${id}`),
  createCreative: (creative) => api.post("/api/bb/creatives", creative),
  updateCreative: (id, patch) => api.patch(`/api/bb/creatives/${id}`, patch),
  deleteCreative: (id) => api.delete(`/api/bb/creatives/${id}`),

  campaigns: () => api.get("/api/bb/campaigns"),
  campaign: (id) => api.get(`/api/bb/campaigns/${id}`),
  createCampaign: (campaign) => api.post("/api/bb/campaigns", campaign),
  updateCampaign: (id, patch) => api.patch(`/api/bb/campaigns/${id}`, patch),
  deleteCampaign: (id) => api.delete(`/api/bb/campaigns/${id}`),
  campaignPerformance: (id) => api.get(`/api/bb/campaigns/${id}/performance`),

  analytics: (days = 30) => api.get(`/api/bb/analytics?days=${days}`),

  notifications: () => api.get("/api/bb/notifications"),
  markAllRead: () => api.post("/api/bb/notifications/read-all"),
  markRead: (id) => api.patch(`/api/bb/notifications/${id}`, {}),

  recommendations: () => api.get("/api/bb/recommendations"),
  resolveRecommendation: (id, status) => api.patch(`/api/bb/recommendations/${id}`, { status }),

  integrations: () => api.get("/api/bb/integrations"),
  disconnect: (provider) => api.delete(`/api/bb/integrations/${provider}`),

  trackingSites: () => api.get("/api/bb/tracking-sites"),
  createTrackingSite: (site) => api.post("/api/bb/tracking-sites", site),
  deleteTrackingSite: (id) => api.delete(`/api/bb/tracking-sites/${id}`),

  // AI
  analyzeBook: (bookId) => api.post("/api/bb-ai/analyze", { book_id: bookId }),
  generatePersonas: (bookId, count) => api.post("/api/bb-ai/personas", { book_id: bookId, count }),
  generateAngles: (bookId, count) => api.post("/api/bb-ai/angles", { book_id: bookId, count }),
  generateCopy: (payload) => api.post("/api/bb-ai/copy", payload),
  generateCreatives: (payload) => api.post("/api/bb-ai/creatives", payload),
  generateVideoScript: (payload) => api.post("/api/bb-ai/video-script", payload),
  scoreCreative: (creativeId) => api.post("/api/bb-ai/score", { creative_id: creativeId }),
  analyzeCampaign: (campaignId) => api.post("/api/bb-ai/analyze-campaign", { campaign_id: campaignId }),
  budgetAdvice: (campaignId) => api.post("/api/bb-ai/budget", { campaign_id: campaignId }),
  askAdvisor: (question) => api.post("/api/bb-ai/advisor", { question }),
  patterns: () => api.post("/api/bb-ai/patterns", {}),

  // Billing
  billing: () => api.get("/api/bb-billing/summary"),
  checkout: (planId) => api.post("/api/bb-billing/checkout", { plan_id: planId }),
  portal: () => api.post("/api/bb-billing/portal"),

  // Meta
  metaAuthorizeUrl: () => api.get("/api/bb-meta/authorize-url"),
  metaAccounts: () => api.get("/api/bb-meta/accounts"),
  metaSelectAccount: (payload) => api.post("/api/bb-meta/select-account", payload),
  metaPush: (payload) => api.post("/api/bb-meta/push", payload),
  metaStatus: (payload) => api.post("/api/bb-meta/status", payload),
  metaSync: (campaignId) => api.post("/api/bb-meta/sync", { campaign_id: campaignId }),

  // Admin
  adminOverview: () => api.get("/api/bb-admin/overview"),
  adminUsers: () => api.get("/api/bb-admin/users"),
  adminSettings: () => api.get("/api/bb-admin/settings"),
  adminPrompts: () => api.get("/api/bb-admin/prompts"),
  adminPublishPrompts: () => api.post("/api/bb-admin/prompts/publish-defaults"),
  adminUpdatePlan: (id, patch) => api.patch(`/api/bb-admin/plans/${id}`, patch),
  adminUpdateCost: (operation, credits) => api.patch(`/api/bb-admin/credit-costs/${operation}`, { credits }),
  adminUpdateFlag: (key, enabled) => api.patch(`/api/bb-admin/flags/${key}`, { enabled }),
  adminUpdatePrompt: (key, patch) => api.patch(`/api/bb-admin/prompts/${key}`, patch),
  adminUpdateSetting: (key, value) => api.patch(`/api/bb-admin/settings/${key}`, { value }),
};
