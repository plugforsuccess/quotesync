// src/pages/components/rate-checks/format.js
// Plain-English labels for rate check data, and the copy-ready policy sheet
// an agent pastes alongside the Allstate quote.

import { money, formatPhone } from './ui';

// rate_checks.status → what an agent should read.
export const STATUS = {
  pending:        { label: 'Reading…',     cls: 'bg-gray-100 text-gray-700' },
  extracted:      { label: 'Needs quote',  cls: 'bg-primary-100 text-primary-700' },
  extract_failed: { label: 'Couldn’t read', cls: 'bg-red-100 text-red-700' },
  quoted:         { label: 'Quoted',       cls: 'bg-purple-100 text-purple-700' },
  won:            { label: 'We win',       cls: 'bg-green-100 text-green-700' },
  lost:           { label: 'Can’t beat',   cls: 'bg-gray-200 text-gray-600' },
  declined:       { label: 'Declined',     cls: 'bg-gray-100 text-gray-500' },
};

// Only worth saying when the scan wasn't sure.
export const CONFIDENCE_WARNING = {
  medium: 'Double-check the price and term against the photo.',
  low: 'The photo was hard to read — check every number against it.',
};

// rate_checks.term_source → a hint only when the term needs confirming.
export const TERM_HINT = {
  carrier_default: { text: 'Guessed from the carrier — confirm', tone: 'warn' },
  unknown: { text: 'Not on the page — confirm', tone: 'warn' },
  agent: { text: 'Set by you' },
};

const COVERAGE_LABELS = {
  bi_per_person: 'Bodily injury (per person)',
  bi_per_accident: 'Bodily injury (per accident)',
  pd: 'Property damage',
  um_uim: 'Uninsured motorist',
  med_pay: 'Medical payments',
  comp_deductible: 'Comprehensive deductible',
  coll_deductible: 'Collision deductible',
  rental: 'Rental',
  roadside: 'Roadside',
  dwelling: 'Dwelling',
  other_structures: 'Other structures',
  personal_property: 'Personal property',
  loss_of_use: 'Loss of use',
  liability: 'Liability',
  deductible: 'Deductible',
  wind_hail_deductible: 'Wind / hail deductible',
};

export function coverageLabel(key) {
  if (COVERAGE_LABELS[key]) return COVERAGE_LABELS[key];
  const s = String(key).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function coverageValue(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') {
    return Object.entries(v)
      .map(([k, x]) => `${coverageLabel(k)}: ${typeof x === 'object' ? JSON.stringify(x) : x}`)
      .join(' · ');
  }
  return String(v);
}

export function vehicleName(v) {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

function usDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

export function policyPeriod(rc) {
  const a = usDate(rc.effective_date), b = usDate(rc.expiration_date);
  return a && b ? `${a} – ${b}` : a || b || null;
}

// "$780 every 6 months" / "$2,013 a year"
export function termPrice(rc) {
  if (rc.current_premium == null) return null;
  if (Number(rc.term_months) === 6) return `${money(rc.current_premium, { cents: true })} every 6 months`;
  if (Number(rc.term_months) === 12) return `${money(rc.current_premium, { cents: true })} a year`;
  return money(rc.current_premium, { cents: true });
}

// Everything needed to run the Allstate quote, as plain text to paste.
export function quoteSheet(rc) {
  const x = rc.extracted || {};
  const lines = [];
  const name = x.insured_name || rc.first_name;
  if (name) lines.push(name);
  if (rc.insured_address) lines.push(rc.insured_address);
  else if (rc.zip) lines.push(`ZIP ${rc.zip}`);
  if (rc.phone) lines.push(formatPhone(rc.phone));
  lines.push('');

  const type = rc.policy_type ? `${rc.policy_type} ` : '';
  lines.push(`Current: ${rc.carrier || 'Unknown carrier'} ${type}policy`.replace(/\s+/g, ' '));
  if (rc.policy_number) lines.push(`Policy #: ${rc.policy_number}`);
  const period = policyPeriod(rc);
  if (period) lines.push(`Policy period: ${period}`);
  const price = termPrice(rc);
  if (price) lines.push(`Premium: ${price}${rc.annual_premium != null && Number(rc.term_months) !== 12 ? ` (${money(rc.annual_premium)}/yr)` : ''}`);

  const vehicles = Array.isArray(rc.vehicles) ? rc.vehicles : [];
  if (vehicles.length) {
    lines.push('', 'Vehicles:');
    vehicles.forEach(v => {
      const vin = v.vin ? (v.vin_complete === false ? ` — VIN ends ${v.vin}` : ` — VIN ${v.vin}`) : '';
      lines.push(`  ${vehicleName(v)}${vin}`);
    });
  }
  if (rc.driver_count != null) lines.push(`Drivers: ${rc.driver_count}`);

  const cov = rc.coverages && typeof rc.coverages === 'object' ? Object.entries(rc.coverages) : [];
  if (cov.length) {
    lines.push('', 'Coverages:');
    cov.forEach(([k, v]) => lines.push(`  ${coverageLabel(k)}: ${coverageValue(v)}`));
  }
  if (Array.isArray(x.discounts) && x.discounts.length) lines.push('', `Discounts: ${x.discounts.join(', ')}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Rows that were clicked while the agent was selecting text shouldn't open/toggle.
export function isSelectingText() {
  return (window.getSelection?.()?.toString() || '').length > 0;
}
