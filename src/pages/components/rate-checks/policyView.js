// src/pages/components/rate-checks/policyView.js
// Turns what the scan stored into what a producer reads and keys into Allstate:
// money that reads like money ("$250k / $500k"), names in normal case, coverages
// in the order they're quoted, per-vehicle coverages and lienholders on the
// vehicle they belong to ("’22 Jaguar XF", not "vehicle 002"), home facts and
// endorsements as their own lists, and short discount tags.
//
// Newer scans return these as structured fields. For older scans the same facts
// are recovered from the scan's free-text note where its wording is predictable;
// anything not recovered stays in "Scan notes". Pure functions — see
// tests/unit/rateCheckPolicyView.test.mjs.

// ── Text ──────────────────────────────────────────────────────────────────────

const hasLower = (s) => /[a-z]/.test(s);

/** "JOCELYN PEARSON" → "Jocelyn Pearson"; leaves mixed-case input alone. */
export function nameCase(s) {
  if (!s) return s;
  const str = String(s).trim();
  if (hasLower(str)) return str;
  return str.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, m => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);
}

/** Make/model words: "LAND ROVER" → "Land Rover", but "S550", "XF", "BMW", "F-150" stay. */
const STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH ' +
  'OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR').split(' '));

/**
 * "255 WALTHAM WAY, FAYETTEVILLE GA 30214" → "255 Waltham Way, Fayetteville GA 30214".
 * The state is always two capitals ("Atlanta, Ga" → "Atlanta, GA"), however the
 * address was typed; street words like "La Vista Rd" are left alone.
 */
export function addressCase(s) {
  if (!s) return s;
  let out = String(s).trim();
  if (!hasLower(out)) {
    out = nameCase(out).replace(/\b(Ne|Nw|Se|Sw|Po)\b/g, m => m.toUpperCase());
  }
  // A state code sits after a comma or space and is followed by a ZIP or the end.
  return out.replace(/(^|[\s,])([A-Za-z]{2})(?=,?\s+\d{5}(?:-\d{4})?\b|\s*$)/g,
    (m, pre, st) => (STATES.has(st.toUpperCase()) ? pre + st.toUpperCase() : m));
}

export function vehicleWords(s) {
  if (!s) return s;
  const str = String(s).trim();
  if (hasLower(str)) return str;
  return str.split(/\s+/).map(w => (/\d/.test(w) || w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

export function vehicleTitle(v) {
  return [v?.year, vehicleWords(v?.make), vehicleWords(v?.model)].filter(Boolean).join(' ') || 'Vehicle';
}

/** "’15 Mercedes S550" — for referring to a vehicle inside other text. */
export function vehicleShort(v) {
  const yr = v?.year ? `’${String(v.year).slice(-2)}` : null;
  return [yr, vehicleWords(v?.make), vehicleWords(v?.model)].filter(Boolean).join(' ') || 'Vehicle';
}

// ── Vehicles referenced by number ("002") ─────────────────────────────────────

/** Find a vehicle by its printed number; falls back to list order (001 = first). */
export function vehicleByRef(vehicles, ref) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const n = parseInt(String(ref).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  const byNumber = list.find(v => v?.number && parseInt(String(v.number).replace(/\D/g, ''), 10) === n);
  return byNumber || list[n - 1] || null;
}

const VEHICLE_REF = /\b(?:vehicles?|veh\.?)\s*#?\s*((?:\d{1,3})(?:\s*(?:,|&|and)\s*#?\s*\d{1,3})*)/gi;

/** Indexes (into vehicles) a text refers to, e.g. "(vehicles 002, 003)" → [1, 2]. */
export function vehicleIndexesIn(text, vehicles) {
  const out = new Set();
  const list = Array.isArray(vehicles) ? vehicles : [];
  for (const m of String(text || '').matchAll(VEHICLE_REF)) {
    for (const ref of m[1].split(/\s*(?:,|&|and)\s*/)) {
      const v = vehicleByRef(list, ref);
      if (v) out.add(list.indexOf(v));
    }
  }
  return [...out];
}

/** "vehicles 002, 003" → "’22 Jaguar XF, ’21 Land Rover Velar". */
export function replaceVehicleRefs(text, vehicles) {
  if (!text) return text;
  return String(text).replace(VEHICLE_REF, (whole, refs) => {
    const names = refs.split(/\s*(?:,|&|and)\s*/).map(r => vehicleByRef(vehicles, r)).filter(Boolean).map(vehicleShort);
    return names.length ? names.join(', ') : whole;
  });
}

// ── Money ─────────────────────────────────────────────────────────────────────

/** "$1,130,300" / "250000" / "1,000.00" → number; anything else → null. */
export function parseAmount(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const m = String(s).trim().match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const full = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
/** $250k, $1M, $1.5M — how producers say limits. */
export function short(n) {
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000 && n % 1000 === 0) return `$${n / 1000}k`;
  return full(n);
}

const EMPTY = new Set(['', '—', '-', 'null', 'none', 'n/a']);

/** Split a printed value into the value and a trailing "(…)" note. */
function splitNote(raw) {
  const s = String(raw).trim();
  const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m && m[1] ? { value: m[1].trim(), note: m[2].trim() } : { value: s, note: null };
}

/**
 * A coverage value as a producer reads it, plus any note (with vehicle numbers
 * swapped for names). Returns null when nothing is printed.
 */
export function formatCoverage(raw, key, vehicles) {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    return { value: Object.entries(raw).map(([k, x]) => `${coverageName(k)} ${x}`).join(' · '), note: null };
  }
  if (EMPTY.has(String(raw).trim().toLowerCase())) return null;
  const { value, note } = splitNote(raw);
  const prettyNote = note ? replaceVehicleRefs(note.replace(/^all vehicles$/i, 'all vehicles'), vehicles) : null;

  if (key === 'rental') {
    const parts = value.split('/').map(parseAmount);
    if (parts.length === 2 && parts.every(n => n != null)) return { value: `${full(parts[0])}/day · ${full(parts[1])} max`, note: prettyNote };
  }
  if (key === 'roadside' && /^[A-Z]{1,2}$/.test(value)) return { value: `Included (${value})`, note: prettyNote };

  if (value.includes('/')) {
    const parts = value.split('/').map(p => p.trim());
    const nums = parts.map(parseAmount);
    if (nums.every(n => n != null)) {
      // "250/500/100" (thousands) or "250000/500000/100000".
      const scaled = nums.every(n => n < 1000) && nums.some(n => n >= 15) ? nums.map(n => n * 1000) : nums;
      return { value: scaled.map(short).join(' / '), note: prettyNote };
    }
    return { value, note: prettyNote };
  }
  const n = parseAmount(value);
  if (n != null) return { value: full(n), note: prettyNote };
  return { value: hasLower(value) ? value : value.charAt(0) + value.slice(1).toLowerCase(), note: prettyNote };
}

// ── Coverages, in the order they're quoted ────────────────────────────────────

const NAMES = {
  bi: 'Bodily injury', bi_per_person: 'Bodily injury (per person)', bi_per_accident: 'Bodily injury (per accident)',
  pd: 'Property damage', um_uim: 'Uninsured motorist', umpd: 'Uninsured motorist (property)', med_pay: 'Medical payments',
  pip: 'Personal injury protection', comp_deductible: 'Comprehensive', coll_deductible: 'Collision',
  rental: 'Rental', roadside: 'Roadside',
  dwelling: 'Dwelling (A)', other_structures: 'Other structures (B)', personal_property: 'Personal property (C)',
  loss_of_use: 'Loss of use (D)', liability: 'Personal liability (E)', home_med_pay: 'Medical payments (F)',
  deductible: 'Deductible', wind_hail_deductible: 'Wind / hail deductible', hurricane_deductible: 'Hurricane deductible',
  aggregate: 'Aggregate', property: 'Property', business_income: 'Business income', hired_non_owned: 'Hired / non-owned auto',
  workers_comp: "Workers' comp",
};
export function coverageName(key) {
  if (NAMES[key]) return NAMES[key];
  const s = String(key).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const AUTO_LIABILITY = ['pd', 'um_uim', 'umpd', 'med_pay', 'pip'];
const AUTO_PHYSICAL = ['comp_deductible', 'coll_deductible', 'rental', 'roadside'];
const HOME_ORDER = ['dwelling', 'other_structures', 'personal_property', 'loss_of_use', 'liability', 'med_pay', 'deductible', 'wind_hail_deductible', 'hurricane_deductible'];

function row(key, raw, vehicles, label) {
  const f = formatCoverage(raw, key, vehicles);
  return f ? { key, label: label || coverageName(key), value: f.value, note: f.note } : null;
}

/**
 * Auto coverages split into policy-level groups. Physical-damage lines that
 * name specific vehicles move onto those vehicles (see vehicleCoverages) and
 * are left out here.
 */
export function autoCoverageGroups(rc) {
  const cov = rc?.coverages && typeof rc.coverages === 'object' ? rc.coverages : {};
  const vehicles = Array.isArray(rc?.vehicles) ? rc.vehicles : [];
  const used = new Set(['bi_per_person', 'bi_per_accident']);
  const liability = [];

  const pp = parseAmount(cov.bi_per_person);
  const pa = cov.bi_per_accident;
  if (pa && String(pa).includes('/')) liability.push(row('bi', pa, vehicles, 'Bodily injury'));
  else if (pp != null || parseAmount(pa) != null) {
    liability.push({ key: 'bi', label: 'Bodily injury', value: [pp, parseAmount(pa)].filter(n => n != null).map(short).join(' / '), note: null });
  }
  for (const k of AUTO_LIABILITY) {
    used.add(k);
    if (!(k in cov)) continue;
    liability.push(row(k, cov[k], vehicles) || { key: k, label: coverageName(k), value: 'None listed', muted: true });
  }

  const physical = [];
  for (const k of AUTO_PHYSICAL) {
    used.add(k);
    if (cov[k] == null) continue;
    if (vehicleIndexesIn(cov[k], vehicles).length) continue; // shown on those vehicles
    const r = row(k, cov[k], vehicles);
    if (r) physical.push({ ...r, note: r.note === 'all vehicles' ? null : r.note });
  }

  const other = Object.keys(cov).filter(k => !used.has(k)).map(k => row(k, cov[k], vehicles)).filter(Boolean);
  return [
    { title: 'Liability', rows: liability.filter(Boolean) },
    { title: vehicles.length > 1 ? 'Every vehicle' : 'Physical damage', rows: physical },
    { title: 'Other', rows: other },
  ].filter(g => g.rows.length);
}

/** Coverages that belong to one vehicle: its own, plus policy lines that name it. */
export function vehicleCoverages(rc, index) {
  const vehicles = Array.isArray(rc?.vehicles) ? rc.vehicles : [];
  const v = vehicles[index] || {};
  const own = v.coverages && typeof v.coverages === 'object' ? v.coverages : {};
  const rows = [];
  for (const k of AUTO_PHYSICAL) {
    if (own[k] != null) { const r = row(k, own[k], vehicles); if (r) rows.push({ ...r, note: null }); }
  }
  for (const k of Object.keys(own).filter(k => !AUTO_PHYSICAL.includes(k))) {
    const r = row(k, own[k], vehicles); if (r) rows.push({ ...r, note: null });
  }
  const cov = rc?.coverages && typeof rc.coverages === 'object' ? rc.coverages : {};
  for (const k of AUTO_PHYSICAL) {
    if (own[k] != null || cov[k] == null) continue;
    if (vehicleIndexesIn(cov[k], vehicles).includes(index)) {
      const r = row(k, splitNote(cov[k]).value, vehicles);
      if (r) rows.push(r);
    }
  }
  return rows;
}

/** Home / condo / renters coverages A–F then deductibles, with % deductibles spelled out. */
export function homeCoverageRows(rc) {
  const cov = rc?.coverages && typeof rc.coverages === 'object' ? rc.coverages : {};
  const dwelling = parseAmount(cov.dwelling);
  const rows = [];
  for (const k of HOME_ORDER) {
    if (cov[k] == null) continue;
    const r = row(k, cov[k], [], k === 'med_pay' ? NAMES.home_med_pay : undefined);
    if (!r) continue;
    const amt = parseAmount(cov[k]);
    if (/deductible/.test(k) && dwelling && amt) {
      const pct = (amt / dwelling) * 100;
      const near = [0.5, 1, 2, 3, 5, 10].find(p => Math.abs(pct - p) < 0.05);
      if (near) r.note = `${near}% of dwelling`;
    }
    rows.push(r);
  }
  for (const k of Object.keys(cov).filter(k => !HOME_ORDER.includes(k))) { const r = row(k, cov[k], []); if (r) rows.push(r); }
  return rows;
}

// ── Facts recovered from older scans' free-text notes ─────────────────────────

export function noteSentences(notes) {
  if (!notes) return [];
  return String(notes).split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(s => s.trim()).filter(Boolean);
}

const LIEN = /^(.+?)\s+(?:is\s+)?(?:listed\s+)?as\s+(?:the\s+)?(?:creditor|lienholder|lien holder|loss payee|lessor|lender)\s+(?:for|on)\s+(vehicles?\s*#?\s*[\d,\s&and#]+)/i;
const USAGE = /usage is (?:stated|listed|shown) as\s+["“]?([^"”]+?)["”]?\s+for all vehicles/i;
const PROPERTY_HINT = /year built|construction is|roof material|mortgage/i;
const ENDORSE = /endorsements?\s+including\s+(.+?)\.?$/i;
const DRIVERS_HINT = /there appear to be .* named|drivers? listed/i;

/** Lienholder for a vehicle: the scan's field, else "X listed as creditor for Vehicle 003". */
export function lienholderFor(rc, index) {
  const v = (rc?.vehicles || [])[index];
  if (v?.lienholder) return v.lienholder;
  for (const s of noteSentences(rc?.extracted?.notes)) {
    const m = s.match(LIEN);
    if (m && vehicleIndexesIn(m[2], rc.vehicles).includes(index)) return m[1].replace(/^(?:and|also)\s+/i, '').trim();
  }
  return null;
}

/** Usage for a vehicle: the scan's field, else "Usage is stated as … for all vehicles". */
export function usageFor(rc, index) {
  const v = (rc?.vehicles || [])[index];
  if (v?.usage) return v.usage;
  const m = String(rc?.extracted?.notes || '').match(USAGE);
  return m ? m[1].trim() : null;
}

/** { year_built, construction, roof_material, roof_year, mortgagee, loan_number, paid_by_mortgagee, … } */
export function propertyFacts(rc) {
  const p = rc?.property && typeof rc.property === 'object' ? { ...rc.property } : {};
  const notes = String(rc?.extracted?.notes || '');
  const pick = (re) => notes.match(re)?.[1]?.trim() || null;
  const year = (re) => { const y = pick(re); return y ? Number(y) : null; };
  p.year_built ??= year(/year built[:\s]+(\d{4})/i);
  p.construction ??= pick(/construction(?: type)?(?: is|:)\s*([^,.;]+)/i);
  p.roof_material ??= pick(/roof material(?: is|:)?\s+([^,.;]+)/i);
  p.roof_year ??= year(/roof (?:year|installed|replaced)[:\s]+(\d{4})/i);
  const mort = notes.match(/mortgage(?:e)? (?:is |held by |:)\s*(.+?)(?:\s+with loan (?:number|#)\s*([\w-]+))?\./i);
  p.mortgagee ??= mort ? nameCaseCompany(mort[1]) : null;
  p.loan_number ??= mort?.[2] || null;
  if (p.paid_by_mortgagee == null && /paid by (?:the )?mortgagee|escrow/i.test(notes)) p.paid_by_mortgagee = true;
  return Object.values(p).some(v => v != null && v !== '') ? p : null;
}

function nameCaseCompany(s) {
  return hasLower(s) ? s.trim() : s.trim().split(/\s+/).map(w => (/^(LLC|NA|FSB|USA|N\.A\.)$/i.test(w) ? w.toUpperCase() : /^(INC|CO|CORP)\.?$/i.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');
}

/** [{ code, name, limit }] — the scan's list, else parsed from "endorsements including A, B, and C". */
export function endorsementsOf(rc) {
  if (Array.isArray(rc?.endorsements) && rc.endorsements.length) return rc.endorsements;
  for (const s of noteSentences(rc?.extracted?.notes)) {
    const m = s.match(ENDORSE);
    if (!m) continue;
    return m[1].split(/,\s+(?:and\s+)?|\s+and\s+(?=(?:Option|[A-Z]{1,4}-?\d))/).map(item => {
      const t = item.trim().replace(/\.$/, '');
      const code = t.match(/^(Option\s+[A-Z0-9]+|[A-Z]{1,4}-[\d.]+)\s*-?\s*/i);
      let rest = code ? t.slice(code[0].length) : t;
      const lim = rest.match(/\s+((?:up to\s+)?\$[\d,]+.*|\d+(?:\.\d+)?%.*)$/i);
      const limit = lim ? lim[1].trim() : null;
      if (lim) rest = rest.slice(0, lim.index);
      return { code: code ? code[1] : null, name: rest.trim(), limit };
    }).filter(e => e.name);
  }
  return [];
}

/** Note sentences not already shown as a field above. */
export function remainingNotes(rc) {
  const all = noteSentences(rc?.extracted?.notes);
  return all.filter(s => !(LIEN.test(s) || USAGE.test(s) || ENDORSE.test(s) || DRIVERS_HINT.test(s)
    || (PROPERTY_HINT.test(s) && propertyFacts(rc)) || /^premium (?:is )?(?:to be )?paid by (?:the )?mortgagee\.?$/i.test(s)));
}

// ── Drivers and discounts ─────────────────────────────────────────────────────

const firstName = (n) => String(n || '').trim().split(/\s+/)[0]?.toLowerCase() || '';

/**
 * First names on the policy's "Name on policy" line, in order:
 * "PEARSON, STEPHEN & JOCELYN" → [stephen, jocelyn]; "Stephen and Jocelyn Pearson" → [stephen, jocelyn].
 */
export function insuredFirstNames(insured) {
  if (!insured) return [];
  const str = String(insured).trim();
  const firsts = str.includes(',') ? str.slice(str.indexOf(',') + 1) : str;
  return firsts.split(/\s*(?:&|\band\b|\/)\s*/i).map(firstName).filter(Boolean);
}

const byAgeDesc = (a, b) => (b.age ?? -1) - (a.age ?? -1);

/**
 * Drivers in the order a producer enters them: named insured, then spouse, then
 * everyone else oldest to youngest. Roles come from the name on the policy (or a
 * printed "spouse"); when two drivers share the insured's first name, the older
 * one is the insured. Two people with one name are told apart by age.
 */
export function driverRows(rc) {
  const list = (Array.isArray(rc?.drivers) ? rc.drivers : []).map((d, i) => ({ ...d, i, display: nameCase(d.name) || 'Driver' }));
  const [insuredFirst, spouseFirst] = insuredFirstNames(rc?.extracted?.insured_name);
  const pick = (pred) => list.filter(d => !d.role && pred(d)).sort(byAgeDesc)[0];
  const insured = insuredFirst ? pick(d => firstName(d.display) === insuredFirst) : null;
  if (insured) insured.role = 'insured';
  // A spouse is only placed second when we know who the insured is; otherwise everyone is by age.
  const spouse = !insured ? null : (spouseFirst ? pick(d => firstName(d.display) === spouseFirst) : null)
    || pick(d => /spouse|wife|husband/i.test(`${d.status || ''} ${d.usage || ''}`));
  if (spouse) spouse.role = 'spouse';
  const ordered = [insured, spouse].filter(Boolean).concat(list.filter(d => !d.role).sort((a, b) => byAgeDesc(a, b) || a.i - b.i));

  const counts = ordered.reduce((m, d) => m.set(d.display, (m.get(d.display) || 0) + 1), new Map());
  return ordered.map(d => ({
    name: counts.get(d.display) > 1 && d.age ? `${d.display} (${d.age})` : d.display,
    display: d.display,
    role: d.role || null,
    age: d.age ?? null,
    status: d.status ? nameCase(d.status) : null,
    usage: d.usage || null,
    young: d.age != null && d.age < 25,
    excluded: /exclud/i.test(d.status || ''),
  }));
}

/** "Multicar (because you insure more than one vehicle with us)" → "Multicar". */
export function cleanDiscount(s) {
  const raw = String(s || '').replace(/&amp;/g, '&');
  const years = raw.match(/\((?:because|for|since)\b[^)]*?(\d+)\s+years?[^)]*\)/i)?.[1];
  let t = raw.replace(/\s*\((?:because|for|since)\b[^)]*\)/gi, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  t = t.replace(/\s+discount$/i, '').replace(/\bfor the (?:last|past) (\d+) years?\b/i, '$1 yrs').trim();
  if (years && !/\d/.test(t)) t = `${t} ${years} yrs`;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}
export function discountsOf(rc) {
  const list = Array.isArray(rc?.extracted?.discounts) ? rc.extracted.discounts : [];
  return [...new Set(list.map(cleanDiscount).filter(Boolean))];
}

// ── Summary ───────────────────────────────────────────────────────────────────

/** What to tell the producer in a sentence or two: the scan's summary, else leftover notes. */
export function headsUp(rc) {
  if (rc?.summary) return [rc.summary];
  return remainingNotes(rc);
}
