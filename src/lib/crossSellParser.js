// src/lib/crossSellParser.js
// Parses the Allstate "Book Of Business - Cross Sell Audit Report" (Excel).
// Returns an array of normalised row objects ready for the match engine.
//
// Real export shape (not the earlier assumed format):
//   - 3–4 preamble rows (title, Download Date, Downloaded By, blank) before
//     the header row.
//   - Name is split: "Insured First Name" / "Insured Last Name" — there is
//     no "Customer Name" column.
//   - The customer's CURRENT line is "Product Name" (e.g. Homeowners); the
//     report has no "Recommended Product" column. The cross-sell target is
//     the complementary core line (property → Auto, auto → Homeowners),
//     which also matches the agency's direction-specific file workflow
//     (e.g. XSELL_..._HOAUTO = HO customers, pitch Auto).
//   - "Associated Product *" columns hold an already-bundled second policy
//     when populated; a row already carrying the recommended line is not an
//     opportunity and is skipped.

import * as XLSX from 'xlsx';

// Column header candidates, matched case-insensitively (exact, then contains).
const COL_MAP = {
  first_name:          ['insured first name', 'first name'],
  last_name:           ['insured last name', 'last name'],
  customer_name:       ['customer name', 'insured name', 'name'], // fallback: single-column formats
  policy_no:           ['policy number', 'policy no', 'policy #'],
  zip:                 ['zip code', 'zip', 'postal'],
  product_name:        ['product name'],
  product_code:        ['product code', 'line code', 'line of business', 'lob'],
  associated_product:  ['associated product name'],
  associated_policy:   ['associated policy number'],
  opportunity_tier:    ['opportunity tier', 'score tier', 'priority', 'tier'],
  allstate_score:      ['opportunity score', 'cs score', 'score'],
};

// Returns the column INDEX for the first matching candidate, or -1.
function findColIdx(headers, candidates) {
  // Pass 1: exact match (most specific).
  for (const c of candidates) {
    const i = headers.findIndex(h => h === c);
    if (i >= 0) return i;
  }
  // Pass 2: contains.
  for (const c of candidates) {
    const i = headers.findIndex(h => h?.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

const PRODUCT_NORMALISE = {
  'auto':           'auto',
  'automobile':     'auto',
  'homeowners':     'ho',
  'home':           'ho',
  'ho':             'ho',
  'renters':        'renters',
  'condo':          'condo',
  'landlord':       'landlord',
  'manufactured':   'manufactured',
  'mobile home':    'manufactured',
  'life':           'life',
  'pup':            'pup',
  'umbrella':       'pup',
  'boat':           'boat',
  'specialty auto': 'specialty_auto',
  'motorcycle':     'specialty_auto',
};

function normaliseProduct(raw) {
  if (!raw) return null;
  const key = raw.toString().trim().toLowerCase();
  // Check multi-word patterns before single words (e.g. "mobile home" before "home").
  for (const [pattern, value] of Object.entries(PRODUCT_NORMALISE)) {
    if (key.includes(pattern)) return value;
  }
  return key || null;
}

const AUTO_LINES = ['auto', 'specialty_auto'];

// The cross-sell target is the complementary core line. The agency's book
// is HO ↔ Auto, so a property-line customer is pitched Auto and an auto
// customer is pitched Homeowners.
function recommendedFor(currentProduct) {
  if (!currentProduct) return null;
  return AUTO_LINES.includes(currentProduct) ? 'ho' : 'auto';
}

export function parseCrossSellReport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (allRows.length < 2) {
          reject(new Error('File appears empty — no data rows found.'));
          return;
        }

        // Locate the header row — skip the title/Download Date preamble.
        let headerIdx = -1;
        for (let i = 0; i < Math.min(12, allRows.length); i++) {
          const r = allRows[i].map(h => h?.toString().toLowerCase().trim());
          if (r.some(h => h?.includes('policy number') || h === 'insured first name')) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx < 0) {
          reject(new Error('Could not find the header row (expected an "Insured First Name" or "Policy Number" column). Check the file format.'));
          return;
        }

        const headers = allRows[headerIdx].map(h => h?.toString().toLowerCase().trim());
        const col = {};
        for (const [key, candidates] of Object.entries(COL_MAP)) {
          col[key] = findColIdx(headers, candidates);
        }

        const hasName = col.first_name >= 0 || col.customer_name >= 0;
        if (!hasName) {
          reject(new Error('Could not find an Insured/Customer Name column. Check the file format.'));
          return;
        }
        if (col.product_name < 0 && col.product_code < 0) {
          reject(new Error('Could not find a Product column. Check the file format.'));
          return;
        }

        const cell = (row, idx) => (idx >= 0 ? row[idx]?.toString().trim() ?? '' : '');

        const parsed = [];

        for (let i = headerIdx + 1; i < allRows.length; i++) {
          const row = allRows[i];
          if (!row || !row.some(Boolean)) continue;

          // Build the customer name (split first/last, or single column).
          let name = '';
          if (col.first_name >= 0 || col.last_name >= 0) {
            name = `${cell(row, col.first_name)} ${cell(row, col.last_name)}`.trim();
          }
          if (!name && col.customer_name >= 0) name = cell(row, col.customer_name);
          if (!name) continue;

          const currentProduct = normaliseProduct(cell(row, col.product_name) || cell(row, col.product_code));
          const recommendedProduct = recommendedFor(currentProduct);

          // Skip customers who already hold the line we'd pitch — they're
          // bundled, not an opportunity.
          const associated = normaliseProduct(cell(row, col.associated_product));
          if (associated && associated === recommendedProduct) {
            continue;
          }

          parsed.push({
            customer_name:       name.toUpperCase(),
            policy_no:           cell(row, col.policy_no) || null,
            zip:                 cell(row, col.zip).slice(0, 5) || null,
            current_product:     currentProduct,
            recommended_product: recommendedProduct,
            opportunity_tier:    cell(row, col.opportunity_tier) || null,
            allstate_score:      parseFloat(cell(row, col.allstate_score)) || null,
          });
        }

        resolve(parsed);
      } catch (err) {
        reject(new Error(`Parse error: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsArrayBuffer(file);
  });
}
