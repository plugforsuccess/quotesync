// src/lib/crossSellParser.js
// Parses Allstate cross-sell audit export (Excel).
// Returns an array of normalised row objects ready for the match engine.

import * as XLSX from 'xlsx';

// Known column name variations in Allstate exports
const COL_MAP = {
  customer_name:       ['Customer Name', 'CUSTOMER NAME', 'Name', 'Insured Name'],
  policy_no:           ['Policy Number', 'Policy No', 'POLICY NO', 'Policy #'],
  current_product:     ['Product', 'Current Product', 'Line of Business', 'LOB'],
  recommended_product: ['Recommended Product', 'Cross-Sell Product', 'Opportunity Product', 'Rec Product'],
  opportunity_tier:    ['Opportunity Tier', 'Tier', 'Score Tier', 'Priority'],
  allstate_score:      ['Score', 'Opportunity Score', 'CS Score'],
};

function findCol(headers, candidates) {
  for (const c of candidates) {
    const match = headers.find(h => h?.toString().trim().toLowerCase() === c.toLowerCase());
    if (match) return match;
  }
  return null;
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
  for (const [pattern, value] of Object.entries(PRODUCT_NORMALISE)) {
    if (key.includes(pattern)) return value;
  }
  return raw.toString().trim().toLowerCase();
}

export function parseCrossSellReport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) {
          reject(new Error('File appears empty — no data rows found.'));
          return;
        }

        const headers = rows[0].map(h => h?.toString().trim());

        const cols = {};
        for (const [key, candidates] of Object.entries(COL_MAP)) {
          cols[key] = findCol(headers, candidates);
        }

        if (!cols.customer_name) {
          reject(new Error('Could not find Customer Name column. Check the file format.'));
          return;
        }
        if (!cols.recommended_product) {
          reject(new Error('Could not find Recommended Product column. Check the file format.'));
          return;
        }

        const parsed = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const get = (colName) => {
            if (!colName) return '';
            const idx = headers.indexOf(colName);
            return idx >= 0 ? row[idx]?.toString().trim() : '';
          };

          const name = get(cols.customer_name);
          if (!name) continue;

          parsed.push({
            customer_name:       name.toUpperCase(),
            policy_no:           get(cols.policy_no) || null,
            current_product:     normaliseProduct(get(cols.current_product)),
            recommended_product: normaliseProduct(get(cols.recommended_product)),
            opportunity_tier:    get(cols.opportunity_tier) || null,
            allstate_score:      parseFloat(get(cols.allstate_score)) || null,
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
