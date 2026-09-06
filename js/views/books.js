// My Books: library, detail and the add/edit form (spec §25).

import { html, raw, $, formData, setBusy, safeUrl } from "../core/dom.js";
import { API } from "../core/api.js";
import * as store from "../core/store.js";
import { notify, confirmDialog } from "../core/toast.js";
import { navigate } from "../core/router.js";
import { refreshAccount } from "../core/session.js";
import { GENRE_OPTIONS, CURRENCIES } from "./options.js";
import { pageHead, emptyState, cover, statusBadge, statGrid, fmt, demoBadge, paragraphs } from "./shared.js";

// ---------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------

export async function renderList(container) {
  const [{ books }, { campaigns }, analytics] = await Promise.all([
    API.books(),
    API.campaigns(),
    API.analytics(90).catch(() => ({ campaigns: [] })),
  ]);
  store.set({ books, campaigns });

  if (!books.length) {
    container.innerHTML = `
      ${pageHead({ title: "My Books", description: "Everything BookBoost does starts from a book." })}
      ${emptyState({
        icon: "▤",
        title: "No books yet",
        text: "Your next bestseller starts here.",
        action: '<a class="bb-btn bb-btn--primary" href="#/books/new">Add your first book</a>',
      })}`;
    return;
  }

  container.innerHTML = html`
    ${raw(pageHead({
      title: "My Books",
      description: "Each book carries its own readers, angles, creatives and results.",
      actions: `${demoBadge()}<a class="bb-btn bb-btn--primary" href="#/books/new">Add a book</a>`,
    }))}
    <div class="bb-grid bb-grid--cards">
      ${raw(books.map((book) => card(book, campaigns, analytics)).join(""))}
    </div>
  `;
}

function card(book, campaigns, analytics) {
  const bookCampaigns = campaigns.filter((c) => c.book_id === book.id);
  const ids = new Set(bookCampaigns.map((c) => c.id));
  const rows = (analytics.campaigns || []).filter((row) => ids.has(row.campaign.id));
  const totals = rows.reduce(
    (acc, row) => ({
      spendCents: acc.spendCents + (row.metrics.spendCents || 0),
      revenueCents: acc.revenueCents + (row.metrics.revenueCents || 0),
      conversions: acc.conversions + (row.metrics.conversions || 0),
    }),
    { spendCents: 0, revenueCents: 0, conversions: 0 }
  );
  const roas = totals.spendCents > 0 ? totals.revenueCents / totals.spendCents : null;
  const active = bookCampaigns.filter((c) => c.status === "active").length;

  return html`
    <article class="bb-card bb-card--interactive bb-book-card">
      <div class="bb-book-card__cover">${raw(cover(book))}</div>
      <div class="bb-book-card__body bb-stack-sm">
        <div>
          <a href="#/books/${book.id}"><strong class="bb-clamp-2">${book.title}</strong></a>
          <div class="bb-small bb-muted">${book.genre || "Genre not set"}</div>
        </div>
        <div class="bb-row bb-row--wrap" style="gap:6px">
          ${raw(statusBadge(book.status))}
          ${active ? raw(html`<span class="bb-badge bb-badge--success">${active} active</span>`) : ""}
        </div>
        <dl class="bb-kv bb-tiny" style="margin:0">
          <dt>Sales</dt><dd>${totals.conversions ? fmt.number(totals.conversions) : "—"}</dd>
          <dt>Revenue</dt><dd>${totals.revenueCents ? fmt.money(totals.revenueCents, book.currency) : "—"}</dd>
          <dt>ROAS</dt><dd>${roas === null ? "—" : fmt.multiple(roas)}</dd>
        </dl>
        <div class="bb-row bb-row--wrap" style="gap:6px">
          <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/strategy/${book.id}">Strategy</a>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="#/creatives/new?book=${book.id}">Generate ads</a>
        </div>
      </div>
    </article>
  `;
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

export async function renderDetail(container, params) {
  const [{ book }, strategy, { campaigns }, { creatives }] = await Promise.all([
    API.book(params.id),
    API.strategy(params.id).catch(() => ({ analysis: null, personas: [], angles: [] })),
    API.campaigns(),
    API.creatives(`?book_id=${encodeURIComponent(params.id)}`).catch(() => ({ creatives: [] })),
  ]);

  const bookCampaigns = campaigns.filter((c) => c.book_id === book.id);
  const performance = bookCampaigns.length
    ? await API.analytics(90).catch(() => null)
    : null;
  const rows = performance
    ? (performance.campaigns || []).filter((row) => bookCampaigns.some((c) => c.id === row.campaign.id))
    : [];
  const totals = rows.length
    ? rows.reduce((acc, row) => {
        const m = row.metrics;
        return {
          impressions: acc.impressions + m.impressions,
          clicks: acc.clicks + m.clicks,
          spendCents: acc.spendCents + m.spendCents,
          conversions: acc.conversions + m.conversions,
          revenueCents: acc.revenueCents + m.revenueCents,
        };
      }, { impressions: 0, clicks: 0, spendCents: 0, conversions: 0, revenueCents: 0 })
    : null;

  const derived = totals
    ? {
        ...totals,
        ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : null,
        cpc: totals.clicks ? totals.spendCents / totals.clicks : null,
        cpa: totals.conversions ? totals.spendCents / totals.conversions : null,
        conversionRate: totals.clicks ? (totals.conversions / totals.clicks) * 100 : null,
        roas: totals.spendCents ? totals.revenueCents / totals.spendCents : null,
        hasData: totals.impressions > 0 || totals.clicks > 0 || totals.spendCents > 0,
      }
    : null;

  container.innerHTML = html`
    <div class="bb-row bb-row--between" style="margin-bottom:var(--bb-5)">
      <a class="bb-small bb-muted" href="#/books">← All books</a>
      ${raw(demoBadge())}
    </div>

    <section class="bb-book-hero" style="margin-bottom:var(--bb-8)">
      <div>${raw(cover(book))}</div>
      <div class="bb-stack">
        <div>
          <h1 class="bb-display" style="font-size:1.8rem">${book.title}</h1>
          ${book.subtitle ? raw(html`<p class="bb-lead" style="margin:6px 0 0">${book.subtitle}</p>`) : ""}
        </div>
        <div class="bb-row bb-row--wrap" style="gap:6px">
          ${raw(statusBadge(book.status))}
          ${book.genre ? raw(html`<span class="bb-badge">${book.genre}</span>`) : ""}
          ${book.price_cents !== null && book.price_cents !== undefined
            ? raw(html`<span class="bb-badge">${fmt.money(book.price_cents, book.currency)}</span>`)
            : ""}
          ${book.author_name ? raw(html`<span class="bb-badge">${book.author_name}</span>`) : ""}
        </div>
        ${book.description ? raw(`<div class="bb-small bb-muted bb-clamp-3">${paragraphs(book.description)}</div>`) : ""}
        <div class="bb-row bb-row--wrap">
          <a class="bb-btn bb-btn--primary bb-btn--sm" href="#/strategy/${book.id}">AI strategy</a>
          <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/creatives/new?book=${book.id}">Generate ads</a>
          <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/campaigns/new?book=${book.id}">Create campaign</a>
          <a class="bb-btn bb-btn--ghost bb-btn--sm" href="#/books/${book.id}/edit">Edit</a>
          ${book.sales_url ? raw(html`<a class="bb-btn bb-btn--ghost bb-btn--sm" href="${safeUrl(book.sales_url)}" target="_blank" rel="noopener noreferrer">Sales page ↗</a>`) : ""}
          <button type="button" class="bb-btn bb-btn--danger bb-btn--sm" id="delete-book">Delete</button>
        </div>
      </div>
    </section>

    <div class="bb-stack-lg">
      <section>
        <h2 style="font-size:1.05rem;margin-bottom:var(--bb-3)">Performance</h2>
        ${raw(statGrid(derived, book.currency))}
      </section>

      <div class="bb-grid bb-grid--2">
        <section class="bb-card">
          <div class="bb-card__header"><div class="bb-card__title">AI strategy</div></div>
          <dl class="bb-kv">
            <dt>Analysis</dt><dd>${strategy.analysis ? "Complete" : "Not run yet"}</dd>
            <dt>Personas</dt><dd>${fmt.number(strategy.personas.length)}</dd>
            <dt>Angles</dt><dd>${fmt.number(strategy.angles.length)}</dd>
            <dt>Creatives</dt><dd>${fmt.number(creatives.length)}</dd>
          </dl>
          <a class="bb-btn bb-btn--secondary bb-btn--sm" style="margin-top:var(--bb-4)" href="#/strategy/${book.id}">
            ${strategy.analysis ? "Open strategy" : "Analyse this book"}
          </a>
        </section>

        <section class="bb-card">
          <div class="bb-card__header"><div class="bb-card__title">Campaigns</div></div>
          ${raw(bookCampaigns.length
            ? `<div class="bb-stack-sm">${bookCampaigns.slice(0, 5).map((campaign) => html`
                 <div class="bb-row bb-row--between">
                   <a href="#/campaigns/${campaign.id}" class="bb-truncate">${campaign.name}</a>
                   ${raw(statusBadge(campaign.status))}
                 </div>`).join("")}</div>`
            : `<p class="bb-small bb-muted">No campaigns for this book yet.</p>
               <a class="bb-btn bb-btn--secondary bb-btn--sm" href="#/campaigns/new?book=${book.id}">Create campaign</a>`)}
        </section>
      </div>
    </div>
  `;

  $("#delete-book").addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Delete this book?",
      message:
        "Its analysis, personas, angles, creatives and campaign history go with it. This can't be undone.",
      confirmLabel: "Delete book",
      tone: "danger",
    });
    if (!confirmed) return;
    await API.deleteBook(book.id);
    await refreshAccount();
    notify.success("Book deleted.");
    navigate("/books");
  });
}

// ---------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------

export async function renderForm(container, params) {
  const editing = Boolean(params.id);
  const book = editing ? (await API.book(params.id)).book : null;

  const value = (field) => (book?.[field] ?? "");

  container.innerHTML = html`
    ${raw(pageHead({
      title: editing ? "Edit book" : "Add a book",
      description: editing
        ? "Changing the description is worth re-running the analysis afterwards."
        : "The description is what the analysis reads — paste the one from your sales page.",
    }))}
    <form id="book-form" class="bb-card" style="max-width:720px">
      <div class="bb-field">
        <label class="bb-label" for="title">Title</label>
        <input class="bb-input" id="title" name="title" required maxlength="300" value="${value("title")}">
      </div>
      <div class="bb-field">
        <label class="bb-label" for="subtitle">Subtitle</label>
        <input class="bb-input" id="subtitle" name="subtitle" maxlength="300" value="${value("subtitle")}">
      </div>
      <div class="bb-field-row">
        <div class="bb-field">
          <label class="bb-label" for="author_name">Author name</label>
          <input class="bb-input" id="author_name" name="author_name" maxlength="200" value="${value("author_name")}">
        </div>
        <div class="bb-field">
          <label class="bb-label" for="genre">Genre</label>
          <select class="bb-select" id="genre" name="genre">${raw(GENRE_OPTIONS)}</select>
        </div>
      </div>
      <div class="bb-field">
        <label class="bb-label" for="subgenre">Subgenre</label>
        <input class="bb-input" id="subgenre" name="subgenre" maxlength="120" value="${value("subgenre")}"
          placeholder="e.g. Life transitions, cosy mystery, cybersecurity for SMBs">
      </div>
      <div class="bb-field">
        <label class="bb-label" for="description">Description</label>
        <textarea class="bb-textarea" id="description" name="description" rows="7" maxlength="8000">${value("description")}</textarea>
      </div>
      <div class="bb-field-row">
        <div class="bb-field">
          <label class="bb-label" for="price">Price</label>
          <input class="bb-input" id="price" name="price" type="number" min="0" step="0.01"
            value="${book?.price_cents !== null && book?.price_cents !== undefined ? (book.price_cents / 100).toFixed(2) : ""}">
        </div>
        <div class="bb-field">
          <label class="bb-label" for="currency">Currency</label>
          <select class="bb-select" id="currency" name="currency">${raw(CURRENCIES)}</select>
        </div>
      </div>
      <div class="bb-field">
        <label class="bb-label" for="sales_url">Sales URL</label>
        <input class="bb-input" id="sales_url" name="sales_url" type="url" value="${value("sales_url")}" placeholder="https://">
      </div>
      <div class="bb-field">
        <label class="bb-label" for="cover_url">Cover image URL</label>
        <input class="bb-input" id="cover_url" name="cover_url" type="url" value="${value("cover_url")}" placeholder="https://">
        <div class="bb-hint">A direct link to the image file.</div>
      </div>
      <div class="bb-field">
        <label class="bb-label" for="sample_text">Sample text</label>
        <textarea class="bb-textarea" id="sample_text" name="sample_text" rows="5" maxlength="40000"
          placeholder="An excerpt — the opening pages work best.">${value("sample_text")}</textarea>
        <div class="bb-hint">Used only to analyse your book and write your marketing. Never used to train a model.</div>
      </div>
      <div class="bb-field">
        <label class="bb-label" for="author_bio">Author bio</label>
        <textarea class="bb-textarea" id="author_bio" name="author_bio" rows="3" maxlength="4000">${value("author_bio")}</textarea>
      </div>
      <div class="bb-field">
        <label class="bb-label" for="reviews_text">Reviews you've actually received</label>
        <textarea class="bb-textarea" id="reviews_text" name="reviews_text" rows="3" maxlength="8000">${value("reviews_text")}</textarea>
        <div class="bb-hint">Paste them verbatim. Nothing will invent a review you didn't get.</div>
      </div>

      <div class="bb-wizard__footer">
        <a class="bb-btn bb-btn--ghost" href="${editing ? `#/books/${params.id}` : "#/books"}">Cancel</a>
        <button type="submit" class="bb-btn bb-btn--primary">${editing ? "Save changes" : "Add book"}</button>
      </div>
    </form>
  `;

  if (book?.genre) $("#genre").value = book.genre;
  $("#currency").value = book?.currency || store.get("profile")?.currency || "EUR";

  $("#book-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(event.target);
    const button = event.target.querySelector('button[type="submit"]');
    setBusy(button, true, "Saving…");
    try {
      const payload = {
        title: values.title,
        subtitle: values.subtitle || null,
        author_name: values.author_name || null,
        genre: values.genre || null,
        subgenre: values.subgenre || null,
        description: values.description || null,
        currency: values.currency,
        sales_url: values.sales_url || null,
        cover_url: values.cover_url || null,
        sample_text: values.sample_text || null,
        author_bio: values.author_bio || null,
        reviews_text: values.reviews_text || null,
      };
      if (values.price !== "") payload.price_cents = Math.round(Number(values.price) * 100);

      if (editing) {
        await API.updateBook(params.id, payload);
        notify.success("Book updated.");
        navigate(`/books/${params.id}`);
      } else {
        const { book: created } = await API.createBook(payload);
        await refreshAccount();
        notify.success("Book added.");
        navigate(`/books/${created.id}`);
      }
    } catch (err) {
      notify.error(err.message);
      setBusy(button, false);
    }
  });
}
