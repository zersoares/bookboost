// Shared <option> lists. Kept in one place so the genre list in
// onboarding, the book form and the creative filters cannot drift apart
// — and so it stays in step with the server-side allow-list in
// netlify/functions/bookpilot-lib/validate.js.

import { html } from "../core/dom.js";

export const GENRES = [
  "Romance", "Thriller", "Mystery", "Fantasy", "Science Fiction",
  "Historical Fiction", "Literary Fiction", "Self-Help",
  "Personal Development", "Business", "Leadership", "Psychology",
  "Health & Wellness", "AI & Technology", "Cybersecurity", "Memoir",
  "Biography", "Children's Books", "Young Adult", "Other",
];

export const GENRE_OPTIONS =
  '<option value="">Choose a genre…</option>' +
  GENRES.map((genre) => html`<option value="${genre}">${genre}</option>`).join("");

export const CURRENCIES = ["EUR", "GBP", "USD", "CHF", "SEK", "PLN", "CZK"]
  .map((code) => html`<option value="${code}">${code}</option>`)
  .join("");

export const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "meta", label: "Meta (both placements)" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
];

export const FORMATS = [
  { value: "static", label: "Static image", hint: "A single frame for the feed." },
  { value: "carousel", label: "Carousel", hint: "Several slides people swipe through." },
  { value: "story", label: "Story", hint: "Full-screen vertical, gone in 24 hours." },
  { value: "reel", label: "Reel concept", hint: "Short vertical video, shot list included." },
  { value: "video_script", label: "Video script", hint: "Beats, voiceover and on-screen text." },
  { value: "mockup", label: "Book mockup", hint: "The physical object, styled." },
  { value: "quote", label: "Quote graphic", hint: "One line from the book, set well." },
  { value: "promo", label: "Promotional graphic", hint: "Price, offer or launch announcement." },
];

export const OBJECTIVES = [
  { value: "conversions", label: "Sales", hint: "Optimise for purchases. Needs tracking on your site." },
  { value: "traffic", label: "Traffic", hint: "Optimise for clicks to your sales page." },
  { value: "awareness", label: "Awareness", hint: "Reach as many likely readers as possible." },
  { value: "engagement", label: "Engagement", hint: "Comments, saves and shares." },
];

export const DESTINATIONS = [
  { value: "website", label: "My website", hint: "Full sales tracking with the BookPilot script." },
  { value: "landing_page", label: "A book landing page", hint: "Same tracking, one page." },
  { value: "amazon", label: "Amazon", hint: "Clicks only, unless you connect Amazon Attribution." },
  { value: "kobo", label: "Kobo", hint: "Clicks only." },
  { value: "other", label: "Somewhere else", hint: "Clicks only." },
];
