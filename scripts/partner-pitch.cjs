// Retakes the four partner-pitch screenshots (public/partner-pitch) from the site as it
// is now, so what a new partner receives always matches what the site shows.
//   node scripts/partner-pitch.cjs [base url]   (default http://localhost:4173)
//   SITE_COPY=site_copy.json node scripts/partner-pitch.cjs   (use the agency's saved wording)
// Pages are driven with sample data: partner "Alex Johnson" (PITCH_NAME="First Last" to change),
// made-up referrals, a sample
// State Farm PDF and three page photos. Nothing is sent anywhere.
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'public', 'partner-pitch');
const TOKEN = 'a'.repeat(48);
const NAME = process.env.PITCH_NAME || 'Alex Johnson';
const FIRST = NAME.split(/\s+/)[0];
const INITIALS = NAME.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
// The agency's default pay (rate-check-partner TIERS), for the pay table.
const PROGRAM = {
  tiers: [
    { key: 'auto_home', label: 'Auto + home or condo', amount: 45 }, { key: 'auto_renters', label: 'Auto + renters', amount: 15 },
    { key: 'home_only', label: 'Home or condo only', amount: 15 }, { key: 'auto_only', label: 'Auto only', amount: 10 },
    { key: 'renters_only', label: 'Renters only', amount: 2 }, { key: 'landlord', label: 'Landlord (paid on its own, on top of the rest)', amount: 10 },
  ],
  extra_line: { amount: 5, cap: 2 }, pay_day: 21, min_payout: 50, quote_days: 7,
};
const SHOT = { type: 'jpeg', quality: 88 };
// A machine with its own Chromium can point at it: PLAYWRIGHT_CHROMIUM=/path/to/chrome
const LAUNCH = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

const month = (d) => d.toLocaleDateString('en-CA').slice(0, 7);
const back = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return month(d); };
const row = (name, label, fee) => ({ first_name: name.split(' ')[0], last_initial: name.split(' ')[1] || null, label, fee, over_cap: false });
const portal = () => ({
  first_name: 'Alex', name: 'Alex Johnson', agency_name: 'Cam Wiley Agency, Inc.', active: true, code: 'ALEX2026',
  agreement: { required: false, version: 'partner-v2', text: null, signed: false, signed_at: null },
  schedule: { auto_home: 45, auto_renters: 15, home_only: 15, auto_only: 10, renters_only: 2, extra_line: 5 }, monthly_cap: null,
  photo_url: null, pay_rule: 'reply',
  terms: { accepted: true, version: 'aff-terms-v1' }, invites: { applied: 0, joined: 0 },
  w9: { on_file: true, tin_type: 'ssn', last4: '1234', signed_at: `${back(2)}-02T15:00:00Z`, revision: 'Rev. March 2024', prefill: {} },
  months: [
    { month: back(0), households: 3, pending: 2, earned: 70, paid: null,
      rows: [row('Stephen M', 'Auto + home or condo', 45), row('Ana R', 'Auto only', 10), row('Marcus T', 'Auto + renters', 15)] },
    { month: back(1), households: 4, pending: 3, earned: 85, paid: { amount: 85, paid_at: `${back(0)}-21T15:00:00Z` },
      rows: [row('Lee P', 'Auto + home or condo', 45), row('Dana W', 'Home or condo only', 15), row('Chris B', 'Auto only', 10), row('Tasha K', 'Auto + renters', 15)] },
    { month: back(2), households: 2, pending: 0, earned: 55, paid: { amount: 55, paid_at: `${back(1)}-21T15:00:00Z` },
      rows: [row('Jordan S', 'Auto + home or condo', 45), row('Kim L', 'Auto only', 10)] },
  ],
});

// The next Tuesday at 11am Eastern.
function nextWeekdayMorning() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7));
  d.setUTCHours(16, 0, 0, 0); // 11am EST
  return d;
}

// A three-page sample declarations PDF.
async function samplePdf(file) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Auto Policy Declarations', { x: 60, y: 720, size: 18, font });
    page.drawText(`Page ${i} of 3`, { x: 60, y: 700, size: 10, font });
  }
  fs.writeFileSync(file, await doc.save());
}

// A photographed page: white paper with a heading and lines, 900x1200.
async function samplePagePng(browser, file, n) {
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await p.setContent(`<body style="margin:0;background:#f3f0ea"><div style="margin:60px;padding:48px;background:#fff;height:1080px;box-sizing:border-box;font-family:Helvetica,Arial;color:#222">
    <div style="font-weight:700;color:#b91c1c;font-size:22px">Progressive</div><div style="font-size:13px;color:#555;margin-top:4px">Insurance Declarations · Page ${n} of 3</div>
    ${Array.from({ length: 26 }, (_, i) => `<div style="height:10px;margin-top:22px;background:#d9d9d9;width:${55 + ((i * 37) % 40)}%"></div>`).join('')}</div></body>`);
  await p.screenshot({ path: file });
  await p.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-'));
  const browser = await chromium.launch(LAUNCH);
  const pdf = path.join(tmp, 'State Farm Auto Declarations.pdf');
  await samplePdf(pdf);
  const photos = [];
  for (let i = 1; i <= 3; i++) { const f = path.join(tmp, `page-${i}.png`); await samplePagePng(browser, f, i); photos.push(f); }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // A weekday morning (agency time), so the card reads "Open now", not "Closed now".
  if (ctx.clock) await ctx.clock.setFixedTime(nextWeekdayMorning());
  const page = await ctx.newPage();
  await page.route('**/functions/v1/rate-check', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ promoter_name: FIRST, promoter_full_name: NAME, promoter_initials: INITIALS, promoter_photo_url: null }) }));
  // The portal, and the pay table's program (the agency's default pay).
  await page.route('**/functions/v1/rate-check-partner', (r) => {
    const mode = (() => { try { return JSON.parse(r.request().postData() || '{}').mode; } catch { return null; } })();
    const body = mode === 'program' ? PROGRAM : { ...portal(), first_name: FIRST, name: NAME };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // The same picks every run (the portal's greeting is random), so a daily run only
  // changes the pictures when the site does.
  await ctx.addInitScript(() => { Math.random = () => 0.2; });
  // A phone's share sheet, so the link card shows Share (as on an iPhone), not Copy.
  await ctx.addInitScript(() => {
    try { Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true }); } catch { /* ignore */ }
  });
  // An onboarded affiliate: the Home Screen step is done, so the portal shows its everyday view.
  await ctx.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch { /* ignore */ } }, `qs_aff_home_${TOKEN.slice(0, 12)}`);
  await page.route(/supabase\.co\/(rest|auth)\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  // The agency's saved wording edits, so the shots read like the live site:
  //   SITE_COPY=/path/site_copy.json  (an export of site_copy: [{ key, value }])
  if (process.env.SITE_COPY) {
    const copy = fs.readFileSync(process.env.SITE_COPY, 'utf8');
    await page.route(/supabase\.co\/rest\/v1\/site_copy/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: copy }));
  }

  // 1. The landing page a friend sees from the partner's link.
  await page.goto(`${BASE}/r/ALEX2026`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '1-what-your-friends-see.jpg'), ...SHOT });

  // 2. The policies step: a PDF policy and a photographed one.
  await page.getByTestId('rc-files').setInputFiles(pdf);
  await page.getByText('3 pages', { exact: true }).first().waitFor();
  await page.getByTestId('rc-files').setInputFiles(photos[0]);
  await page.getByText('Does this policy have more pages?').waitFor();
  for (const n of [2, 3]) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: `Add page ${n}` }).first().click();
    await (await chooser).setFiles(photos[n - 1]);
    await page.getByText(`${n} pages`, { exact: true }).first().waitFor();
  }
  await page.getByRole('button', { name: "That's all" }).click();
  await page.getByText('2 added').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '2-they-send-their-policy.jpg'), ...SHOT });

  // 3 and 4. The partner's own page: the link, then the referrals and earnings.
  await page.goto(`${BASE}/affiliate/${TOKEN}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    // The sample shows the real domain and a plain greeting, whatever this run's host is.
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walk.nextNode())) n.nodeValue = n.nodeValue.replace(/^(https?:\/\/)?(localhost:\d+|127\.0\.0\.1:\d+)/, 'insuredbycam.com');
  });
  await page.screenshot({ path: path.join(OUT, '3-your-partner-page.jpg'), ...SHOT });
  const top = await page.getByText('Pending', { exact: true }).first()
    .evaluate((e) => e.closest('div').parentElement.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y - 24), top);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '4-track-your-earnings.jpg'), ...SHOT });

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('affiliate-pitch: 4 screenshots written to', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
