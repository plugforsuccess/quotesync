// src/lib/bookMetricsParser.js
// Pure parsers for the Allstate book-health reports, kept framework-free so
// they're unit-testable and reusable by any upload surface.
//
//   parsePremiumProfitability(rows) -> book_snapshots records  (product × month)
//   parsePolicyAudit(rows)          -> policy_audit_snapshots records (policy × month)
//
// `rows` is the sheet as an array-of-arrays (XLSX.utils.sheet_to_json with
// { header: 1 }), matching the existing retention-import parsers.

// ── shared helpers ───────────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "Apr-2026" | "4/01/2026" | Date  ->  "2026-04-01"  (first of the month)
export function parseProductionMonth(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw)) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const s = String(raw).trim();
  const m1 = s.match(/([A-Za-z]{3})[-\s]*(\d{4})/); // Apr-2026
  if (m1) {
    const mo = MONTHS[m1[1].toLowerCase()];
    if (mo) return `${m1[2]}-${String(mo).padStart(2, '0')}-01`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return null;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function intOrNull(v) {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

// Find the metadata value on a "label : value" row (labels live in col 0/1).
function findMeta(rows, labelIncludes) {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const label = (rows[i]?.[0] ?? '').toString().toLowerCase();
    if (label.includes(labelIncludes)) {
      // value is the next non-empty cell on the row
      for (let c = 1; c < (rows[i]?.length ?? 0); c++) {
        if (rows[i][c] != null && rows[i][c] !== '') return rows[i][c];
      }
    }
  }
  return null;
}

// Map an Allstate product label to QuoteSync's normalized key (mirrors the
// retention-import normaliser so book + case data line up on product_key).
export function normalizeProductKey(raw = '') {
  const v = String(raw).toLowerCase().trim();
  if (v.includes('specialty auto') || v.includes('motorcycle') || v.includes('recreational')) return 'specialty_auto';
  if (v.includes('non standard auto') || v.includes('nonstandard')) return 'auto';
  if (v.includes('voluntary auto')) return 'auto_rollup';
  if (v.includes('auto')) return 'auto';
  if (v.includes('manufactured') || v.includes('mobile')) return 'manufactured';
  if (v.includes('condo')) return 'condo';
  if (v.includes('homeowner') || v.includes('home')) return 'ho';
  if (v.includes('rent')) return 'renters';
  if (v.includes('landlord')) return 'landlord';
  if (v.includes('umbrella') || v.includes('pup')) return 'pup';
  if (v.includes('boat') || v.includes('marine') || v.includes('watercraft')) return 'boat';
  if (v.includes('motor club')) return 'motor_club';
  if (v.includes('fire')) return 'fire';
  return 'other';
}

// ── Premium & Profitability ──────────────────────────────────────────────────
// The sheet has a merged GROUP header row (e.g. "Policies in Force") sitting
// above a SUBHEADER row (e.g. "Current Month") — and the subheaders repeat
// across groups. We forward-fill the group labels and key each column by
// `group || subheader`, so lookups are unambiguous and resilient to column
// shuffles within the report.

function buildCompositeHeaders(groupRow, subRow) {
  const groups = [];
  let last = '';
  for (let c = 0; c < subRow.length; c++) {
    const g = (groupRow?.[c] ?? '').toString().trim();
    if (g) last = g;
    groups[c] = last;
  }
  return subRow.map((s, c) =>
    `${groups[c].toLowerCase()}||${(s ?? '').toString().trim().toLowerCase()}`
  );
}

export function parsePremiumProfitability(rows) {
  const productionMonth = parseProductionMonth(findMeta(rows, 'production month'));

  // header (subheader) row = the one whose first cell is "Products"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if ((rows[i]?.[0] ?? '').toString().trim().toLowerCase() === 'products') { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find the "Products" header row — check the report format.');

  const keys = buildCompositeHeaders(rows[headerIdx - 1] || [], rows[headerIdx]);
  const col = (groupIncl, subEquals) =>
    keys.findIndex((k) => {
      const [g, s] = k.split('||');
      return g.includes(groupIncl) && s === subEquals;
    });

  const idx = {
    pif_current:    col('policies in force', 'current month'),
    pif_pye:        col('policies in force', 'pye'),
    pif_variance:   col('policies in force', 'variance to pye'),
    pif_growth:     col('policies in force', 'ye estimated %growth'),
    ret_cur:        col('policy retention - current month', 'policy retention'),
    net_ret:        col('policy retention - current month', 'net retention'),
    ten_0_2:        col('policy retention - current month', 'tenure retention 0-2 years'),
    ten_2_5:        col('policy retention - current month', 'tenure retention 2-5 years'),
    ten_5p:         col('policy retention - current month', 'tenure retention 5+ years'),
    ret_py:         col('policy retention - prior year', 'policy retention'),
    ret_var:        col('policy retention - point variance to py', 'policy retention'),
    wp_total:       col('written and advanced premium', 'current month - total($)'),
    wp_ytd:         col('written and advanced premium', 'ytd - total($)'),
    lr_12:          keys.findIndex((k) => k.includes('% adjusted paid loss ratio - 12mm')),
    lr_24:          keys.findIndex((k) => k.includes('% adjusted paid loss ratio - 24mm')),
  };
  const at = (row, i) => (i >= 0 ? row[i] : null);

  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const product = (rows[r]?.[0] ?? '').toString().trim();
    if (!product) continue;                       // stop padding / blank rows
    if (product.toLowerCase().startsWith('total')) continue;

    const row = rows[r];
    records.push({
      production_month: productionMonth,
      product,
      product_key: normalizeProductKey(product),
      pif_current:           intOrNull(at(row, idx.pif_current)),
      pif_pye:               intOrNull(at(row, idx.pif_pye)),
      pif_variance:          intOrNull(at(row, idx.pif_variance)),
      pif_ye_est_growth_pct: num(at(row, idx.pif_growth)),
      policy_retention_pct:  num(at(row, idx.ret_cur)),
      net_retention_pct:     num(at(row, idx.net_ret)),
      retention_py_pct:      num(at(row, idx.ret_py)),
      retention_point_variance: num(at(row, idx.ret_var)),
      tenure_ret_0_2:        num(at(row, idx.ten_0_2)),
      tenure_ret_2_5:        num(at(row, idx.ten_2_5)),
      tenure_ret_5plus:      num(at(row, idx.ten_5p)),
      written_premium_total: num(at(row, idx.wp_total)),
      written_premium_ytd:   num(at(row, idx.wp_ytd)),
      loss_ratio_12mm:       num(at(row, idx.lr_12)),
      loss_ratio_24mm:       num(at(row, idx.lr_24)),
    });
  }
  return { productionMonth, records };
}

// ── Policy Audit ─────────────────────────────────────────────────────────────
// Flat per-policy table; header row's first cell is "Policy Status".

export function parsePolicyAudit(rows) {
  const productionMonth = parseProductionMonth(findMeta(rows, 'production month'));

  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if ((rows[i]?.[0] ?? '').toString().trim().toLowerCase() === 'policy status') { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find the "Policy Status" header row — check the report format.');

  const headers = rows[headerIdx].map((h) => (h ?? '').toString().toLowerCase().trim());
  // Candidate-priority match: earlier candidates win over later ones, so
  // specific header names beat generic fallbacks regardless of column order.
  const find = (...cands) => {
    for (const c of cands) {
      const i = headers.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = {
    status:      find('policy status'),
    policy_no:   find('policy number', 'policy no'),
    product:     find('product name', 'product'),
    zip:         find('zip'),
    pif_cur:     find('current month pif'),
    pif_pye:     find('pye pif'),
    ret_num:     find('retention numerator'),
    ret_den:     find('retention denominator'),
    wp:          find('12mm adv wp', '12 mm adv wp'),
    ep:          find('12mm ep', '12 mm ep'),
  };
  const at = (row, i) => (i >= 0 ? row[i] : null);

  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const policyNo = (at(rows[r], idx.policy_no) ?? '').toString().trim();
    if (!policyNo) continue;
    const row = rows[r];
    const product = (at(row, idx.product) ?? '').toString().trim();
    records.push({
      production_month: productionMonth,
      policy_no:        policyNo,
      policy_status:    (at(row, idx.status) ?? '').toString().trim() || null,
      product:          product || null,
      product_key:      product ? normalizeProductKey(product) : null,
      zip:              (at(row, idx.zip) ?? '').toString().trim() || null,
      pif_current:           intOrNull(at(row, idx.pif_cur)),
      pif_pye:               intOrNull(at(row, idx.pif_pye)),
      retention_numerator:   num(at(row, idx.ret_num)),
      retention_denominator: num(at(row, idx.ret_den)),
      written_premium_12mm:  num(at(row, idx.wp)),
      earned_premium_12mm:   num(at(row, idx.ep)),
    });
  }
  return { productionMonth, records };
}
