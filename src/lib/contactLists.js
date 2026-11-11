// src/lib/contactLists.js
// Contact lists (the Lists page; Add to List in Quick Send and the lead workspace): checks
// on what's typed, and reading an imported spreadsheet into people.

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(s || '').trim());
export const cleanEmail = (s) => String(s || '').trim().toLowerCase();
const titleWord = (w) => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w);
/** "  dana  " → "Dana"; leaves "McKay" and "DeShawn" alone. */
export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ').map(titleWord).join(' ');
/** 10 digits, or '' (a 1 in front is dropped). */
export const cleanPhone = (s) => {
  const d = String(s || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  return d.length === 10 ? d : '';
};

// Which spreadsheet column is which (headings vary: "E-mail", "First", "Mobile", …).
const HEADINGS = {
  first: /^(first|first ?name|given ?name|fname)$/,
  last: /^(last|last ?name|surname|family ?name|lname)$/,
  name: /^(name|full ?name|contact|contact ?name)$/,
  email: /^(e-?mail|e-?mail ?address|email ?1|primary ?email)$/,
  phone: /^(phone|mobile|cell|phone ?number|mobile ?phone|cell ?phone|phone ?1)$/,
  notes: /^(notes?|group|tag|tags|how ?we ?know|relationship)$/,
};

export function mapColumns(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const k = String(h || '').trim().toLowerCase().replace(/[_.]+/g, ' ');
    for (const [field, re] of Object.entries(HEADINGS)) if (map[field] === undefined && re.test(k)) map[field] = i;
  });
  return map;
}

/**
 * Rows from a spreadsheet (first row = headings) → people to add.
 * Returns { people: [{ first_name, last_name, email, phone, notes }], skipped: { noEmail, badEmail, duplicate }, columns }.
 */
export function parseImport(rows) {
  const [head = [], ...body] = rows;
  const col = mapColumns(head);
  const people = [];
  const seen = new Set();
  const skipped = { noEmail: 0, badEmail: 0, duplicate: 0 };
  for (const r of body) {
    if (!r || r.every(v => String(v ?? '').trim() === '')) continue;
    const get = (f) => (col[f] === undefined ? '' : String(r[col[f]] ?? '').trim());
    const email = cleanEmail(get('email'));
    if (!email) { skipped.noEmail++; continue; }
    if (!isEmail(email)) { skipped.badEmail++; continue; }
    if (seen.has(email)) { skipped.duplicate++; continue; }
    seen.add(email);
    let first = get('first'), last = get('last');
    if (!first && get('name')) {
      const parts = get('name').split(/\s+/);
      first = parts[0];
      last = last || parts.slice(1).join(' ');
    }
    people.push({
      first_name: cleanName(first) || email.split('@')[0],
      last_name: cleanName(last) || null,
      email,
      phone: cleanPhone(get('phone')) || null,
      notes: get('notes') || null,
    });
  }
  return { people, skipped, columns: col };
}
