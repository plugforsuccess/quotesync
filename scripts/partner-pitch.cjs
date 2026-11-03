// Retakes the four partner-pitch screenshots (public/partner-pitch) from the site as it
// is now, so what a new partner receives always matches what the site shows.
//   node scripts/partner-pitch.cjs [base url]   (default http://localhost:4173)
// Pages are driven with sample data: partner "Alex Johnson", made-up referrals, a sample
// State Farm PDF and three page photos. Nothing is sent anywhere.
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'public', 'partner-pitch');
const TOKEN = 'a'.repeat(48);
const SHOT = { type: 'jpeg', quality: 88 };
// A machine with its own Chromium can point at it: PLAYWRIGHT_CHROMIUM=/path/to/chrome
const LAUNCH = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};

const month = (d) => d.toLocaleDateString('en-CA').slice(0, 7);
const back = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return month(d); };
const row = (first_name, label, fee) => ({ first_name, label, fee, over_cap: false });
const portal = () => ({
  first_name: 'Alex', name: 'Alex Johnson', agency_name: 'Cam Wiley Agency, Inc.', active: true, code: 'ALEX2026',
  agreement: { required: false, version: 'partner-v2', text: null, signed: false, signed_at: null },
  schedule: { auto_home: 45, auto_renters: 15, home_only: 15, auto_only: 10, renters_only: 2, extra_line: 5 }, monthly_cap: null,
  photo_url: null, pay_rule: 'reply',
  w9: { on_file: true, tin_type: 'ssn', last4: '1234', signed_at: `${back(2)}-02T15:00:00Z`, revision: 'Rev. March 2024', prefill: {} },
  months: [
    { month: back(0), households: 3, pending: 2, earned: 70, paid: null,
      rows: [row('Stephen', 'Auto + home or condo', 45), row('Ana', 'Auto only', 10), row('Marcus', 'Auto + renters', 15)] },
    { month: back(1), households: 4, pending: 3, earned: 85, paid: { amount: 85, paid_at: `${back(0)}-21T15:00:00Z` },
      rows: [row('Lee', 'Auto + home or condo', 45), row('Dana', 'Home or condo only', 15), row('Chris', 'Auto only', 10), row('Tasha', 'Auto + renters', 15)] },
    { month: back(2), households: 2, pending: 0, earned: 55, paid: { amount: 55, paid_at: `${back(1)}-21T15:00:00Z` },
      rows: [row('Jordan', 'Auto + home or condo', 45), row('Kim', 'Auto only', 10)] },
  ],
});

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
  const page = await ctx.newPage();
  await page.route('**/functions/v1/rate-check', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ promoter_name: 'Alex', promoter_full_name: 'Alex Johnson', promoter_initials: 'AJ', promoter_photo_url: null }) }));
  await page.route('**/functions/v1/rate-check-partner', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(portal()) }));
  await page.route(/supabase\.co\/(rest|auth)\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

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
  await page.goto(`${BASE}/partner/${TOKEN}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    // The sample shows the real domain and a plain greeting, whatever this run's host is.
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walk.nextNode())) n.nodeValue = n.nodeValue.replace(/^(https?:\/\/)?(localhost:\d+|127\.0\.0\.1:\d+)/, 'insuredbycam.com');
    const h = [...document.querySelectorAll('h1')].find((e) => /, Alex$/.test(e.textContent));
    if (h) h.textContent = 'Hi, Alex';
  });
  await page.screenshot({ path: path.join(OUT, '3-your-partner-page.jpg'), ...SHOT });
  const top = await page.getByText('Pending', { exact: true }).first()
    .evaluate((e) => e.closest('div').parentElement.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y - 24), top);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '4-track-your-earnings.jpg'), ...SHOT });

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('partner-pitch: 4 screenshots written to', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
