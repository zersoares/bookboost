// Creative Factory, library and detail (spec §13, §14, §27).

import { html, raw, $, setBusy } from "../core/dom.js";
import { API, isDemo } from "../core/api.js";
import * as store from "../core/store.js";
import { notify, confirmDialog, openModal } from "../core/toast.js";
import { navigate } from "../core/router.js";
import { refreshAccount } from "../core/session.js";
import { FORMATS, PLATFORMS } from "./options.js";
import { pageHead, emptyState, scoreBadge, fmt, demoBadge, loading, bullets } from "./shared.js";

const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.value, f.label]));

// ---------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------

export async function renderLibrary(container, params, query) {
  const [{ creatives }, { books }] = await Promise.all([API.creatives(), API.books()]);
  store.set({ creatives, books });

  if (!creatives.length) {
    container.innerHTML =
      pageHead({
        title: "Creative library",
        description: "Every creative stays linked to the book, reader and angle it was written for.",
      }) +
      emptyState({
        icon: "◐",
        title: "No creatives yet",
        text: "Pick an angle and BookBoost will write the copy and art-direct the visual.",
        action: books.length
          ? '<a class="bb-btn bb-btn--primary" href="#/creatives/new">Create ads</a>'
          : '<a class="bb-btn bb-btn--primary" href="#/books/new">Add a book first</a>',
      });
    return;
  }

  const bookFilter = query?.get("book") || "";
  container.innerHTML = html`
    ${raw(pageHead({
      title: "Creative library",
      description: "Filter, preview, score, duplicate — then put the good ones in a campaign.",
      actions: `${demoBadge()}<a class="bb-btn bb-btn--primary" href="#/creatives/new">Create ads</a>`,
    }))}

    <div class="bb-row bb-row--wrap" style="margin-bottom:var(--bb-5);gap:var(--bb-2)">
      <select class="bb-select" id="filter-book" style="width:auto">
        <option value="">All books</option>
        ${raw(books.map((b) => html`<option value="${b.id}" ${b.id === bookFilter ? "selected" : ""}>${b.title}</option>`).join(""))}
      </select>
      <select class="bb-select" id="filter-format" style="width:auto">
        <option value="">All formats</option>
        ${raw(FORMATS.map((f) => html`<option value="${f.value}">${f.label}</option>`).join(""))}
      </select>
      <select class="bb-select" id="filter-platform" style="width:auto">
        <option value="">All platforms</option>
        ${raw(PLATFORMS.map((p) => html`<option value="${p.value}">${p.label}</option>`).join(""))}
      </select>
      <select class="bb-select" id="filter-sort" style="width:auto">
        <option value="recent">Newest first</option>
        <option value="score">Highest score first</option>
      </select>
    </div>

    <div class="bb-grid bb-grid--cards" id="creative-grid"></div>
  `;

  const paint = () => {
    const book = $("#filter-book").value;
    const format = $("#filter-format").value;
    const platform = $("#filter-platform").value;
    const sort = $("#filter-sort").value;

    let list = creatives.filter(
      (c) =>
        (!book || c.book_id === book) &&
        (!format || c.format === format) &&
        (!platform || c.platform === platform)
    );
    list = sort === "score"
      ? [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      : [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    $("#creative-grid").innerHTML = list.length
      ? list.map(creativeCard).join("")
      : `<div style="grid-column:1/-1">${emptyState({
          icon: "◇",
          title: "Nothing matches those filters",
          text: "Try widening them, or create a new set of ads.",
          action: '<a class="bb-btn bb-btn--secondary" href="#/creatives/new">Create ads</a>',
        })}</div>`;
  };

  ["#filter-book", "#filter-format", "#filter-platform", "#filter-sort"].forEach((selector) =>
    $(selector).addEventListener("change", paint)
  );
  paint();
}

function creativeCard(creative) {
  return html`
    <article class="bb-card bb-card--flush bb-card--interactive bb-creative">
      <div class="bb-creative__preview">
        <span class="bb-badge bb-badge--accent" style="align-self:flex-start">${FORMAT_LABEL[creative.format] || creative.format}</span>
        <div class="bb-creative__headline">${creative.headline || "Untitled creative"}</div>
      </div>
      <div class="bb-creative__body">
        <p class="bb-small bb-muted bb-clamp-3" style="margin:0">${creative.primary_text || ""}</p>
        <div class="bb-row bb-row--between">
          ${raw(scoreBadge(creative.score))}
          <span class="bb-tiny bb-subtle">${fmt.titleCase(creative.platform)}</span>
        </div>
        <div class="bb-creative__footer">
          <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/creatives/${creative.id}">Open</a>
        </div>
      </div>
    </article>
  `;
}

// ---------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------

export async function renderFactory(container, params, query) {
  const { books } = await API.books();
  if (!books.length) {
    container.innerHTML =
      pageHead({ title: "Create ads" }) +
      emptyState({
        icon: "▤",
        title: "Add a book first",
        text: "Creatives are written from a book's angles, so there has to be a book.",
        action: '<a class="bb-btn bb-btn--primary" href="#/books/new">Add a book</a>',
      });
    return;
  }

  const bookId = query?.get("book") || books[0].id;
  const preselectedAngle = query?.get("angle") || "";
  const strategy = await API.strategy(bookId);

  container.innerHTML = html`
    ${raw(pageHead({
      title: "Create ads",
      description: "Pick the angle, the platform and the format. BookBoost writes the copy and art-directs the visual.",
      actions: demoBadge(),
    }))}

    ${raw(!strategy.angles.length
      ? emptyState({
          icon: "◑",
          title: "This book has no angles yet",
          text: "Creatives are built from a marketing angle so you always know what each one was testing.",
          action: `<a class="bb-btn bb-btn--primary" href="#/strategy/${bookId}">Generate angles</a>`,
        })
      : html`
      <form class="bb-card" id="factory-form" style="max-width:720px">
        <div class="bb-field">
          <label class="bb-label" for="book">Book</label>
          <select class="bb-select" id="book" name="book">
            ${raw(books.map((b) => html`<option value="${b.id}" ${b.id === bookId ? "selected" : ""}>${b.title}</option>`).join(""))}
          </select>
        </div>

        <div class="bb-field">
          <label class="bb-label" for="angle">Marketing angle</label>
          <select class="bb-select" id="angle" name="angle">
            ${raw(strategy.angles.map((a) => html`<option value="${a.id}" ${a.id === preselectedAngle ? "selected" : ""}>${a.name}</option>`).join(""))}
          </select>
          <div class="bb-hint" id="angle-hook"></div>
        </div>

        <div class="bb-field">
          <label class="bb-label" for="platform">Platform</label>
          <select class="bb-select" id="platform" name="platform">
            ${raw(PLATFORMS.map((p) => html`<option value="${p.value}">${p.label}</option>`).join(""))}
          </select>
        </div>

        <div class="bb-field">
          <label class="bb-label">Format</label>
          <div class="bb-grid bb-grid--3">
            ${raw(FORMATS.map((f, index) => html`
              <label class="bb-radio">
                <input type="radio" name="format" value="${f.value}" ${index === 0 ? "checked" : ""}>
                <span><strong class="bb-small">${f.label}</strong><br><span class="bb-tiny bb-subtle">${f.hint}</span></span>
              </label>`).join(""))}
          </div>
        </div>

        <div class="bb-field">
          <label class="bb-label" for="count">How many variations?</label>
          <select class="bb-select" id="count" name="count" style="width:auto">
            <option value="1">1</option>
            <option value="2" selected>2</option>
            <option value="3">3</option>
          </select>
          <div class="bb-hint">Different approaches, not reworded versions of the same one.</div>
        </div>

        <div class="bb-alert bb-alert--info">
          <span class="bb-alert__icon">◆</span>
          <div class="bb-small">
            BookBoost writes the copy and the art direction for each creative. Rendering the image or
            video is not available on this deployment yet, so you'll get a brief you can hand to a
            designer or an image tool — clearly marked, rather than a placeholder pretending to be
            finished artwork.
          </div>
        </div>

        <div class="bb-wizard__footer">
          <a class="bb-btn bb-btn--ghost" href="#/creatives">Cancel</a>
          <button type="submit" class="bb-btn bb-btn--primary">Generate creatives</button>
        </div>
      </form>
      <div id="factory-results" style="margin-top:var(--bb-8)"></div>`)}
  `;

  if (!strategy.angles.length) return;

  const showHook = () => {
    const angle = strategy.angles.find((a) => a.id === $("#angle").value);
    $("#angle-hook").textContent = angle?.hook ? `“${angle.hook}”` : "";
  };
  $("#angle").addEventListener("change", showHook);
  showHook();

  $("#book").addEventListener("change", (event) => {
    navigate(`/creatives/new?book=${event.target.value}`);
  });

  $("#factory-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    const format = event.target.querySelector('input[name="format"]:checked').value;
    const payload = {
      book_id: $("#book").value,
      angle_id: $("#angle").value,
      platform: $("#platform").value,
      format,
      count: Number($("#count").value),
    };
    setBusy(button, true, "Writing…");
    $("#factory-results").innerHTML = loading(2);
    try {
      const result = format === "video_script"
        ? await API.generateVideoScript({ ...payload, duration: 30 })
        : await API.generateCreatives(payload);
      const created = result.creatives || [result.creative];
      await refreshAccount();
      $("#factory-results").innerHTML = html`
        <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-4)">
          <h2 style="font-size:1.05rem">${created.length} new ${created.length === 1 ? "creative" : "creatives"}</h2>
          <a class="bb-small" href="#/creatives">Creative library →</a>
        </div>
        <div class="bb-grid bb-grid--cards">${raw(created.map(creativeCard).join(""))}</div>
      `;
      notify.success("Creatives ready.");
    } catch (err) {
      $("#factory-results").innerHTML = "";
      notify.error(err.message);
    }
    setBusy(button, false);
  });
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

export async function renderDetail(container, params) {
  const { creative } = await API.creative(params.id);
  const [{ book }, strategy] = await Promise.all([
    API.book(creative.book_id),
    API.strategy(creative.book_id).catch(() => ({ angles: [], personas: [] })),
  ]);
  const angle = strategy.angles.find((a) => a.id === creative.angle_id);
  const persona = strategy.personas.find((p) => p.id === creative.persona_id);
  const slides = creative.body?.slides || [];
  const beats = creative.body?.beats || [];

  container.innerHTML = html`
    <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-5)">
      <a class="bb-small bb-muted" href="#/creatives">← Creative library</a>
      ${raw(demoBadge())}
    </div>

    <div class="bb-grid" style="grid-template-columns:minmax(0,320px) minmax(0,1fr);align-items:start;gap:var(--bb-8)">
      <div class="bb-stack">
        <div class="bb-card bb-card--flush bb-creative">
          <div class="bb-creative__preview ${creative.format === "reel" || creative.format === "story" ? "bb-creative__preview--reel" : ""}">
            <span class="bb-badge bb-badge--accent" style="align-self:flex-start">${FORMAT_LABEL[creative.format] || creative.format}</span>
            <div class="bb-creative__headline">${creative.headline || ""}</div>
          </div>
        </div>
        <div class="bb-card">
          <div class="bb-card__header">
            <div class="bb-card__title">Predicted quality</div>
            ${raw(scoreBadge(creative.score))}
          </div>
          ${raw(creative.score === null || creative.score === undefined
            ? `<p class="bb-small bb-muted">Not scored yet.</p>
               <button type="button" class="bb-btn bb-btn--primary bb-btn--sm bb-btn--block" id="score-btn">Score this creative · 1 credit</button>`
            : scorePanel(creative))}
          <p class="bb-tiny bb-subtle" style="margin-top:var(--bb-3)">
            A judgement about the creative before it runs — hook, clarity, audience fit. It is not a
            prediction of sales. Only campaign data can tell you that.
          </p>
        </div>
      </div>

      <div class="bb-stack-lg">
        <section class="bb-card">
          <div class="bb-card__header">
            <div class="bb-card__title">Copy</div>
            <span class="bb-badge">${fmt.titleCase(creative.platform)}</span>
          </div>
          <dl class="bb-kv">
            <dt>Headline</dt><dd>${creative.headline || "—"}</dd>
            <dt>Primary text</dt><dd class="bb-pre-wrap">${creative.primary_text || "—"}</dd>
            <dt>Description</dt><dd>${creative.description || "—"}</dd>
            <dt>Call to action</dt><dd>${creative.cta || "—"}</dd>
          </dl>
        </section>

        ${creative.visual_prompt ? raw(html`
          <section class="bb-card">
            <div class="bb-card__title" style="margin-bottom:var(--bb-3)">Art direction</div>
            <p class="bb-small bb-muted bb-pre-wrap">${creative.visual_prompt}</p>
          </section>`) : ""}

        ${slides.length ? raw(html`
          <section class="bb-card">
            <div class="bb-card__title" style="margin-bottom:var(--bb-3)">Slides</div>
            <div class="bb-stack-sm">
              ${raw(slides.map((slide) => html`
                <div class="bb-panel">
                  <div class="bb-eyebrow">${slide.label || ""}</div>
                  <div class="bb-small" style="margin-top:4px"><strong>${slide.text || ""}</strong></div>
                  <div class="bb-tiny bb-subtle" style="margin-top:4px">${slide.visual || ""}</div>
                </div>`).join(""))}
            </div>
          </section>`) : ""}

        ${beats.length ? raw(html`
          <section class="bb-card">
            <div class="bb-card__title" style="margin-bottom:var(--bb-3)">Script</div>
            <div class="bb-table-wrap">
              <table class="bb-table">
                <thead><tr><th>Timing</th><th>Voiceover</th><th>On screen</th><th>Visual</th></tr></thead>
                <tbody>${raw(beats.map((beat) => html`<tr>
                  <td class="bb-nowrap">${beat.timing || ""}</td>
                  <td>${beat.voiceover || ""}</td>
                  <td>${beat.on_screen || ""}</td>
                  <td class="bb-small bb-muted">${beat.visual || ""}</td>
                </tr>`).join(""))}</tbody>
              </table>
            </div>
          </section>`) : ""}

        <section class="bb-card">
          <div class="bb-card__title" style="margin-bottom:var(--bb-3)">Context</div>
          <dl class="bb-kv">
            <dt>Book</dt><dd><a href="#/books/${book.id}">${book.title}</a></dd>
            <dt>Angle</dt><dd>${angle?.name || "—"}</dd>
            <dt>Reader</dt><dd>${persona?.name || "—"}</dd>
            <dt>Status</dt><dd>${fmt.titleCase(creative.status)}</dd>
            <dt>Created</dt><dd>${fmt.date(creative.created_at, { withTime: true })}</dd>
          </dl>
        </section>

        <div class="bb-row bb-row--wrap">
          <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="edit-btn">Edit copy</button>
          <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="duplicate-btn">Duplicate</button>
          <button type="button" class="bb-btn bb-btn--secondary bb-btn--sm" id="variation-btn">Create variation</button>
          <button type="button" class="bb-btn bb-btn--ghost bb-btn--sm" id="download-btn">Download</button>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="#/campaigns/new?book=${book.id}&creative=${creative.id}">Add to campaign</a>
          <button type="button" class="bb-btn bb-btn--danger bb-btn--sm" id="delete-btn">Delete</button>
        </div>
      </div>
    </div>
  `;

  $("#score-btn")?.addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Reviewing…");
    try {
      await API.scoreCreative(creative.id);
      await refreshAccount();
      renderDetail(container, params);
    } catch (err) {
      notify.error(err.message);
      setBusy(event.currentTarget, false);
    }
  });

  $("#edit-btn").addEventListener("click", () => openEditor(creative, () => renderDetail(container, params)));

  $("#duplicate-btn").addEventListener("click", async () => {
    const { creative: copy } = await API.createCreative({
      book_id: creative.book_id,
      angle_id: creative.angle_id,
      persona_id: creative.persona_id,
      platform: creative.platform,
      format: creative.format,
      headline: creative.headline,
      primary_text: creative.primary_text,
      description: creative.description,
      cta: creative.cta,
      visual_prompt: creative.visual_prompt,
      body: creative.body,
    });
    notify.success("Duplicated.");
    navigate(`/creatives/${copy.id}`);
  });

  $("#variation-btn").addEventListener("click", async (event) => {
    setBusy(event.currentTarget, true, "Writing…");
    try {
      const { creatives } = await API.generateCreatives({
        book_id: creative.book_id,
        angle_id: creative.angle_id,
        platform: creative.platform,
        format: creative.format,
        count: 1,
      });
      await refreshAccount();
      notify.success("Variation created.");
      if (creatives?.[0]) navigate(`/creatives/${creatives[0].id}`);
    } catch (err) {
      notify.error(err.message);
      setBusy(event.currentTarget, false);
    }
  });

  $("#download-btn").addEventListener("click", () => downloadCreative(creative, book));

  $("#delete-btn").addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Delete this creative?",
      message: "It will be removed from the library. Campaigns already using it keep their results.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) return;
    await API.deleteCreative(creative.id);
    notify.success("Creative deleted.");
    navigate("/creatives");
  });
}

function scorePanel(creative) {
  const detail = creative.score_detail || {};
  const dimensions = detail.dimensions || {};
  const labels = {
    hook_strength: "Hook strength", clarity: "Clarity", emotional_impact: "Emotional impact",
    relevance: "Relevance", cta_strength: "CTA strength", audience_fit: "Audience fit",
    visual_concept: "Visual concept", differentiation: "Differentiation",
  };
  return html`
    <div class="bb-score-bars" style="margin-top:var(--bb-3)">
      ${raw(Object.entries(labels).map(([key, label]) => {
        const value = dimensions[key];
        if (value === undefined) return "";
        return html`<div class="bb-score-bar">
          <span class="bb-subtle">${label}</span>
          <span class="bb-progress"><span class="bb-progress__bar" style="width:${value}%"></span></span>
          <span class="bb-right">${value}</span>
        </div>`;
      }).join(""))}
    </div>
    ${detail.strengths?.length ? raw(html`
      <div style="margin-top:var(--bb-4)">
        <div class="bb-eyebrow">Working</div>
        ${raw(bullets(detail.strengths))}
      </div>`) : ""}
    ${detail.improvements?.length ? raw(html`
      <div style="margin-top:var(--bb-3)">
        <div class="bb-eyebrow">Could be stronger</div>
        ${raw(bullets(detail.improvements))}
      </div>`) : ""}
  `;
}

function openEditor(creative, onSaved) {
  const { root, close } = openModal(
    html`
      <div class="bb-modal__header"><h3>Edit copy</h3></div>
      <form id="edit-form">
        <div class="bb-field">
          <label class="bb-label" for="e-headline">Headline</label>
          <input class="bb-input" id="e-headline" name="headline" maxlength="300" value="${creative.headline || ""}">
        </div>
        <div class="bb-field">
          <label class="bb-label" for="e-primary">Primary text</label>
          <textarea class="bb-textarea" id="e-primary" name="primary_text" rows="5" maxlength="4000">${creative.primary_text || ""}</textarea>
        </div>
        <div class="bb-field">
          <label class="bb-label" for="e-description">Description</label>
          <input class="bb-input" id="e-description" name="description" maxlength="1000" value="${creative.description || ""}">
        </div>
        <div class="bb-field">
          <label class="bb-label" for="e-cta">Call to action</label>
          <input class="bb-input" id="e-cta" name="cta" maxlength="120" value="${creative.cta || ""}">
        </div>
        <div class="bb-modal__footer">
          <button type="button" class="bb-btn bb-btn--ghost" data-close>Cancel</button>
          <button type="submit" class="bb-btn bb-btn--primary">Save</button>
        </div>
      </form>`,
    { wide: false }
  );

  root.querySelector("#edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    setBusy(button, true, "Saving…");
    try {
      await API.updateCreative(creative.id, {
        headline: root.querySelector("#e-headline").value,
        primary_text: root.querySelector("#e-primary").value,
        description: root.querySelector("#e-description").value,
        cta: root.querySelector("#e-cta").value,
      });
      notify.success("Saved.");
      close();
      onSaved();
    } catch (err) {
      notify.error(err.message);
      setBusy(button, false);
    }
  });
}

/**
 * Download the creative as a plain text brief. Exporting what BookBoost
 * actually produced — copy plus art direction — is honest; offering a
 * "download image" button for artwork that was never rendered would not
 * be.
 */
function downloadCreative(creative, book) {
  const lines = [
    `BOOKBOOST AI — CREATIVE BRIEF${isDemo() ? " (DEMO DATA)" : ""}`,
    "",
    `Book:      ${book.title}`,
    `Platform:  ${creative.platform}`,
    `Format:    ${FORMAT_LABEL[creative.format] || creative.format}`,
    creative.score !== null && creative.score !== undefined
      ? `Score:     ${creative.score}/100 (predicted quality, not a sales forecast)`
      : "",
    "",
    "HEADLINE",
    creative.headline || "—",
    "",
    "PRIMARY TEXT",
    creative.primary_text || "—",
    "",
    "DESCRIPTION",
    creative.description || "—",
    "",
    "CALL TO ACTION",
    creative.cta || "—",
    "",
    "ART DIRECTION",
    creative.visual_prompt || "—",
  ];

  for (const slide of creative.body?.slides || []) {
    lines.push("", `${slide.label || "Slide"}: ${slide.text || ""}`, `  Visual: ${slide.visual || ""}`);
  }
  for (const beat of creative.body?.beats || []) {
    lines.push("", `${beat.timing || ""}`, `  VO: ${beat.voiceover || ""}`,
      `  On screen: ${beat.on_screen || ""}`, `  Visual: ${beat.visual || ""}`);
  }

  const blob = new Blob([lines.filter((l) => l !== "").join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bookboost-creative-${creative.id.slice(0, 8)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}
