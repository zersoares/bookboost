// End-to-end walk of the checklist in spec §55, driven through the demo
// workspace so it needs no database, no API keys and no account.
//
// Playwright is not a dependency of this repository (there is no
// package.json — see README.md § "Why there is no build
// step"), so install it wherever you like and point this at a served
// copy of the site:
//
//   python3 -m http.server 8899 &
//   npm i playwright                       # in a scratch directory
//   CHROMIUM=/path/to/chrome node tests/browser/flows.mjs
//
// Exits non-zero on any failed step or unexpected console error.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8899';
const results = [];
const consoleErrors = [];

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) consoleErrors.push(`console: ${m.text()}`);
});

async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name} :: ${err.message.split('\n')[0]}`);
  }
}

let nav = 0;
const go = async (hash) => {
  // A cache-busting param guarantees a real document load: navigating to
  // a URL identical to the current one is a same-document navigation and
  // would not re-run the app.
  nav += 1;
  await page.goto(`${BASE}/app.html?demo=1&n=${nav}#${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
};

await step('Landing page CTA reaches the signup screen', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.click('a.bb-btn--primary >> nth=0');
  await page.waitForSelector('#auth-form', { timeout: 6000 });
  if (!(await page.locator('input[name="fullName"]').count())) throw new Error('signup form missing');
});

await step('Signup form validates and explains when accounts are unavailable', async () => {
  const notice = await page.locator('.bb-alert--info').first().innerText();
  if (!/demo/i.test(notice)) throw new Error(`expected an honest unavailable notice, got: ${notice.slice(0, 60)}`);
  const disabled = await page.locator('#auth-form button[type=submit]').isDisabled();
  if (!disabled) throw new Error('submit should be disabled with no backend');
});

await step('Add book: form saves and lands on the new book', async () => {
  await go('/books/new');
  await page.fill('#title', 'The Cybersecurity Handbook for Small Teams');
  await page.selectOption('#genre', 'Cybersecurity');
  await page.fill('#description', 'A practical guide for teams without a security department.');
  await page.fill('#price', '14.50');
  await page.click('#book-form button[type=submit]');
  await page.waitForSelector('.bb-book-hero', { timeout: 8000 });
  const heading = await page.locator('.bb-book-hero h1').innerText();
  if (!heading.includes('Cybersecurity')) throw new Error(`unexpected book page: ${heading}`);
});

await step('Edit book: changes persist', async () => {
  await page.click('a[href$="/edit"]');
  await page.waitForSelector('#book-form');
  await page.fill('#subtitle', 'Without hiring anyone');
  await page.click('#book-form button[type=submit]');
  await page.waitForSelector('.bb-book-hero', { timeout: 8000 });
  const sub = await page.locator('.bb-book-hero .bb-lead').innerText();
  if (!sub.includes('Without hiring')) throw new Error('subtitle did not persist');
});

await step('New book shows an empty strategy with the right next step', async () => {
  await page.click('a:has-text("AI strategy")');
  await page.waitForSelector('.bb-empty', { timeout: 8000 });
  const text = await page.locator('.bb-empty').innerText();
  if (!/Analyse this book/i.test(text)) throw new Error(`unexpected empty state: ${text.slice(0, 60)}`);
});

await step('Run analysis, then personas, then angles — in that order', async () => {
  await page.click('#run-analysis');
  await page.waitForSelector('.bb-card:has-text("Positioning")', { timeout: 15000 });

  await page.click('.bb-tab:has-text("Reader personas")');
  await page.waitForSelector('#run-personas', { timeout: 8000 });
  await page.click('#run-personas');
  await page.waitForSelector('.bb-persona', { timeout: 15000 });
  const personaCount = await page.locator('.bb-persona').count();
  if (personaCount < 3) throw new Error(`expected 3+ personas, got ${personaCount}`);

  await page.click('.bb-tab:has-text("Marketing angles")');
  await page.waitForSelector('#run-angles', { timeout: 8000 });
  await page.click('#run-angles');
  await page.waitForSelector('.bb-angle', { timeout: 15000 });
  const angleCount = await page.locator('.bb-angle').count();
  if (angleCount < 10) throw new Error(`spec asks for 10+ angles, got ${angleCount}`);
});

await step('Angle filter chips narrow the list', async () => {
  const before = await page.locator('#angle-grid > article:visible').count();
  await page.click('.bb-chip[data-filter]:not([data-filter=""]) >> nth=0');
  await page.waitForTimeout(250);
  const after = await page.locator('#angle-grid > article:visible').count();
  if (after >= before) throw new Error(`filter did not narrow: ${before} -> ${after}`);
});

await step('Credits are spent and shown in the sidebar', async () => {
  const credits = await page.locator('.bb-credits__row strong').innerText();
  const value = Number(credits.replace(/\D/g, ''));
  if (!(value < 74)) throw new Error(`credits should have decreased from 74, showing ${credits}`);
});

await step('Creative factory generates and scores a creative', async () => {
  await page.click('.bb-angle a:has-text("Create ads from this angle") >> nth=0');
  await page.waitForSelector('#factory-form', { timeout: 8000 });
  await page.click('#factory-form button[type=submit]');
  await page.waitForSelector('#factory-results .bb-creative', { timeout: 15000 });
  await page.click('#factory-results .bb-creative a:has-text("Open") >> nth=0');
  await page.waitForSelector('.bb-creative__preview', { timeout: 8000 });
});

await step('Creative detail: edit copy saves', async () => {
  await page.click('#edit-btn');
  await page.waitForSelector('#edit-form');
  await page.fill('#e-headline', 'An edited headline');
  await page.click('#edit-form button[type=submit]');
  await page.waitForTimeout(900);
  const shown = await page.locator('.bb-creative__headline').first().innerText();
  if (!shown.includes('edited')) throw new Error(`edit did not persist: ${shown}`);
});

await step('Campaign builder runs all ten steps and saves a draft', async () => {
  await go('/campaigns/new');
  await page.waitForSelector('#w-book', { timeout: 20000 });
  const options = await page.locator('#w-book option').allTextContents();
  const demoIndex = options.findIndex((t) => /Starting Over/.test(t));
  if (demoIndex < 0) throw new Error('demo book missing from the picker');
  await page.selectOption('#w-book', { index: demoIndex });
  await page.waitForTimeout(600);
  await page.click('[data-next]');                                   // 1 -> 2
  await page.waitForSelector('[data-persona]', { timeout: 8000 });
  await page.check('[data-persona] >> nth=0');
  await page.click('[data-next]');                                   // 2 -> 3
  await page.waitForSelector('[data-angle]', { timeout: 8000 });
  await page.check('[data-angle] >> nth=0');
  await page.click('[data-next]');                                   // 3 -> 4
  await page.waitForSelector('[data-creative]', { timeout: 8000 });
  await page.check('[data-creative] >> nth=0');
  await page.click('[data-next]');                                   // 4 -> 5
  await page.waitForSelector('#w-objective', { timeout: 8000 });
  await page.click('[data-next]');                                   // 5 -> 6
  await page.waitForSelector('input[name="budget"]', { timeout: 8000 });
  await page.click('[data-next]');                                   // 6 -> 7
  await page.waitForSelector('input[name="duration"]', { timeout: 8000 });
  await page.click('[data-next]');                                   // 7 -> 8
  await page.waitForSelector('#w-url', { timeout: 8000 });
  await page.fill('#w-url', 'https://example.com/starting-over');
  await page.click('[data-next]');                                   // 8 -> 9 review
  await page.waitForSelector('.bb-kv', { timeout: 8000 });
  const review = await page.locator('.bb-wizard').innerText();
  if (!/Maximum spend/.test(review)) throw new Error('review step should state the maximum spend');
  await page.click('[data-next]');                                   // save
  await page.waitForSelector('text=Campaign saved as a draft', { timeout: 12000 });
});

await step('Amazon destination warns that sales cannot be tracked there', async () => {
  await go('/campaigns/new');
  await page.waitForSelector('#w-book', { timeout: 20000 });
  const options = await page.locator('#w-book option').allTextContents();
  await page.selectOption('#w-book', { index: options.findIndex((t) => /Starting Over/.test(t)) });
  await page.waitForTimeout(600);
  for (let i = 0; i < 8; i += 1) {
    if (await page.locator('#w-url').count()) break;
    if (await page.locator('[data-persona]').count()) await page.check('[data-persona] >> nth=0');
    if (await page.locator('[data-creative]').count()) await page.check('[data-creative] >> nth=0');
    await page.click('[data-next]');
    await page.waitForTimeout(400);
  }
  await page.check('input[name="destination"][value="amazon"]');
  await page.waitForTimeout(250);
  const note = await page.locator('#amazon-note').innerText();
  if (!/does not report sales/i.test(note)) throw new Error('missing Amazon caveat');
});

await step('Campaign detail shows creative performance and a launch gate', async () => {
  await go('/campaigns');
  await page.click('.bb-table a:has-text("angle test")');
  await page.waitForSelector('.bb-stat-grid, .bb-panel', { timeout: 8000 });
  const body = await page.locator('#view').innerText();
  if (!/Creative performance/.test(body)) throw new Error('no creative table');
  if (!/🏆/.test(body)) throw new Error('no winner marked on a campaign with a clear winner');
});

await step('Campaign analysis produces insights with a confidence level', async () => {
  await page.click('#analyse-btn');
  await page.waitForSelector('#analysis-output .bb-insight', { timeout: 15000 });
  const text = await page.locator('#analysis-output').innerText();
  if (!/confidence/i.test(text)) throw new Error('analysis must state confidence');
  if (!/never changes a budget/i.test(text)) throw new Error('missing the "recommendations only" disclaimer');
});

await step('Budget advice returns three bands and a caveat', async () => {
  await page.click('#budget-btn');
  await page.waitForSelector('#analysis-output:has-text("Budget recommendation")', { timeout: 15000 });
  const text = await page.locator('#analysis-output').innerText();
  if (!/conservative[\s\S]*balanced[\s\S]*aggressive/i.test(text)) throw new Error('missing bands');
  if (!/not a guarantee/i.test(text)) throw new Error('missing the estimate caveat');
});

await step('Analytics sorts the creative table', async () => {
  await go('/analytics');
  await page.waitForSelector('#creative-table table', { timeout: 8000 });
  const column = () => page.locator('#creative-table tbody tr td:first-child').allTextContents();
  const before = (await column()).join('|');
  await page.click('#creative-table th[data-key="clicks"]');
  await page.waitForTimeout(300);
  const after = (await column()).join('|');
  if (before === after) throw new Error('sorting did not change the order');
  await page.click('#creative-table th[data-key="clicks"]');
  await page.waitForTimeout(300);
  const reversed = (await column()).join('|');
  if (reversed === after) throw new Error('clicking twice should reverse the direction');
});

await step('Advisor answers and offers actions, not automation', async () => {
  await go('/advisor');
  await page.click('.bb-chip[data-question] >> nth=0');
  await page.waitForSelector('#thinking', { timeout: 8000 });
  await page.waitForSelector('#thinking', { state: 'detached', timeout: 15000 });
  const answer = await page.locator('.bb-bubble--ai').last().innerText();
  if (answer.length < 60) throw new Error('advisor answer too short');
  const disclaimer = await page.locator('.bb-advisor').innerText();
  if (!/says how confident|isn't enough of it/i.test(disclaimer)) throw new Error('missing confidence framing');
});

await step('Attribution page marks unavailable integrations honestly', async () => {
  await go('/attribution');
  const text = await page.locator('#view').innerText();
  if (!/Amazon does not report your KDP sales/i.test(text)) throw new Error('missing the Amazon truth');
  if (!/coming soon|Not in the demo|Not configured/i.test(text)) throw new Error('unavailable integrations must say so');
});

await step('Billing shows plans and disables checkout when unavailable', async () => {
  await go('/billing');
  await page.waitForSelector('.bb-pricing', { timeout: 8000 });
  const plans = await page.locator('.bb-plan').count();
  if (plans !== 4) throw new Error(`expected 4 plans, got ${plans}`);
  const text = await page.locator('#view').innerText();
  if (!/Checkout is switched off/i.test(text)) throw new Error('demo must say checkout is off');
});

await step('Settings: privacy toggles and export are present', async () => {
  await go('/settings');
  await page.waitForSelector('#profile-form', { timeout: 8000 });
  await page.check('#analytics_consent');
  await page.waitForTimeout(600);
  if (!(await page.locator('#analytics_consent').isChecked())) throw new Error('consent toggle did not stick');
  if (!(await page.locator('#export-btn').count())) throw new Error('no data export');
  if (!(await page.locator('#delete-btn').count())) throw new Error('no account deletion');
});

await step('Notifications panel opens and marks read', async () => {
  await go('/overview');
  await page.click('#notif-btn');
  await page.waitForSelector('.bb-notifications .bb-notification', { timeout: 8000 });
  const items = await page.locator('.bb-notification').count();
  if (items < 1) throw new Error('no notifications rendered');
  await page.click('#read-all');
  await page.waitForTimeout(500);
});

await step('Unknown route shows a not-found state, not a blank page', async () => {
  await go('/does-not-exist');
  const text = await page.locator('#view').innerText();
  if (!/doesn't exist/i.test(text)) throw new Error(`unexpected: ${text.slice(0, 60)}`);
});

await step('Demo reset restores the starting workspace', async () => {
  await go('/books');
  await page.click('#demo-reset');
  await page.waitForTimeout(900);
  await go('/books');
  const cards = await page.locator('.bb-book-card').count();
  if (cards !== 1) throw new Error(`expected 1 book after reset, got ${cards}`);
});

await step('Every screen in the demo carries a DEMO DATA marker', async () => {
  for (const route of ['/overview', '/books', '/creatives', '/campaigns', '/analytics', '/billing']) {
    await go(route);
    const badges = await page.locator('.bb-demo-badge').count();
    if (badges < 1) throw new Error(`${route} has no demo marker`);
  }
});

await browser.close();

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (consoleErrors.length) {
  console.log('\nUnexpected console/page errors:');
  consoleErrors.forEach((e) => console.log(' -', e));
}
process.exit(failed.length || consoleErrors.length ? 1 : 0);
