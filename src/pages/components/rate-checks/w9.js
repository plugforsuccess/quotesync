// src/pages/components/rate-checks/w9.js
// The partner W-9 as the portal collects it: tax classifications, TIN rules and
// formatting, and the payload the rate-check-partner function fills the IRS form
// from. Pure functions so the checks can be tested; the function re-checks them.

export const TAX_CLASSES = [
  { value: 'individual', label: 'Individual / sole proprietor', hint: 'Most partners. Use your own name and SSN.' },
  { value: 'llc', label: 'LLC', hint: 'Taxed as a C corporation, S corporation or partnership.' },
  { value: 's_corp', label: 'S corporation' },
  { value: 'c_corp', label: 'C corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust', label: 'Trust / estate' },
  { value: 'other', label: 'Other' },
];
export const LLC_CLASSES = [['C', 'C corporation'], ['S', 'S corporation'], ['P', 'Partnership']];

export const digits = (s) => String(s || '').replace(/\D/g, '');

/** "123456789" → "123-45-6789" (SSN) or "12-3456789" (EIN), as far as typed. */
export function formatTin(value, type) {
  const d = digits(value).slice(0, 9);
  if (type === 'ein') return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-');
}

/** Why a TIN can't be right, or null. Mirrors the IRS's own ranges, not just "9 digits". */
export function tinProblem(value, type) {
  const d = digits(value);
  if (d.length !== 9) return `Enter all 9 digits of your ${type === 'ein' ? 'EIN' : 'SSN'}.`;
  if (/^(\d)\1{8}$/.test(d)) return 'That doesn’t look like a real number.';
  if (type === 'ein') {
    if (d.startsWith('00')) return 'An EIN can’t start with 00.';
    return null;
  }
  const area = d.slice(0, 3), group = d.slice(3, 5), serial = d.slice(5);
  if (area === '000' || area === '666' || area >= '900') return 'That isn’t a valid SSN (check the first 3 digits).';
  if (group === '00' || serial === '0000') return 'That isn’t a valid SSN.';
  if (d === '123456789') return 'That doesn’t look like a real number.';
  return null;
}

/** Checks the whole form; returns { field: message } (empty when it's good to send). */
export function w9Problems(f) {
  const p = {};
  const name = String(f.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) p.name = 'Enter the name that goes on your tax return.';
  if (!TAX_CLASSES.some(t => t.value === f.tax_class)) p.tax_class = 'Choose how you file.';
  if (f.tax_class === 'llc' && !LLC_CLASSES.some(([v]) => v === f.llc_class)) p.llc_class = 'Choose how the LLC is taxed.';
  if (f.tax_class === 'other' && !String(f.other_text || '').trim()) p.other_text = 'Say what kind of entity.';
  if (String(f.address || '').trim().length < 5) p.address = 'Enter your street address.';
  if (!/^.{2,},?\s*[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(String(f.city_state_zip || '').trim())) p.city_state_zip = 'City, state and ZIP, like “Atlanta, GA 30303”.';
  const tin = tinProblem(f.tin, f.tin_type);
  if (tin) p.tin = tin;
  if (f.tax_class === 'individual' && f.tin_type === 'ein' && !String(f.business_name || '').trim()) {
    // Allowed by the IRS for a sole proprietor, but it's usually a mistake.
    p.tin_type = 'A sole proprietor usually uses their SSN. Use an EIN only if you have one for this business.';
  }
  const sig = String(f.signed_name || '').replace(/\s+/g, ' ').trim();
  if (sig.length < 3 || !sig.includes(' ')) p.signed_name = 'Type your full name as your signature.';
  if (f.accept !== true) p.accept = 'Tick the box to certify.';
  return p;
}

/** What goes to the function. The TIN travels once, over HTTPS, and is never kept client-side. */
export function w9Payload(token, f) {
  return {
    mode: 'w9', token,
    name: String(f.name).replace(/\s+/g, ' ').trim(),
    business_name: String(f.business_name || '').trim() || null,
    tax_class: f.tax_class,
    llc_class: f.tax_class === 'llc' ? f.llc_class : null,
    other_text: f.tax_class === 'other' ? String(f.other_text).trim() : null,
    address: String(f.address).trim(),
    city_state_zip: String(f.city_state_zip).trim(),
    tin_type: f.tin_type,
    tin: digits(f.tin),
    signed_name: String(f.signed_name).replace(/\s+/g, ' ').trim(),
    accept: f.accept === true,
  };
}
