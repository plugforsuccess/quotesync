// src/pages/components/rate-checks/format.js
// Plain-English labels for rate check data, and the copy-ready policy sheet
// an agent pastes alongside the Allstate quote.

import { money, formatPhone } from './ui';
import {
  caps, insuredName, vehicleTitle, vehicleShort, vehicleCoverages, vehicleCoverageSetup, lienholderFor, autoCoverageGroups, propertyFacts, vehiclesNewestFirst,
  homeCoverageRows, endorsementsOf, driverRows, discountsOf,
} from './policyView';

// rate_checks.status → what an agent should read.
export const STATUS = {
  pending:        { label: 'Reading…',     cls: 'bg-gray-100 text-gray-700' },
  extracted:      { label: 'Needs quote',  cls: 'bg-primary-100 text-primary-700' },
  extract_failed: { label: 'Couldn’t read', cls: 'bg-red-100 text-red-700' },
  quoted:         { label: 'Quoted',       cls: 'bg-purple-100 text-purple-700' },
  won:            { label: 'We win',       cls: 'bg-green-100 text-green-700' },
  bound:          { label: 'Bound',        cls: 'bg-green-600 text-white' },
  lost:           { label: 'Can’t beat',   cls: 'bg-gray-200 text-gray-600' },
  declined:       { label: 'Declined',     cls: 'bg-gray-100 text-gray-500' },
};

// rate_checks.decision → the card. `cls` is the badge; `tone` picks the card colours.
export const DECISION = {
  quote_allstate:          { label: 'Quote Allstate',            tone: 'success', cls: 'bg-green-100 text-green-700' },
  quote_allstate_umbrella: { label: 'Quote Allstate Auto + HO + PUP', tone: 'success', cls: 'bg-green-100 text-green-700' },
  expanded_market:         { label: 'Expanded market',           tone: 'info',    cls: 'bg-primary-100 text-primary-700' },
  double_check:            { label: 'Double check',              tone: 'warning', cls: 'bg-yellow-100 text-yellow-700' },
  manual_review:           { label: 'Manual Review',             tone: 'warning', cls: 'bg-orange-100 text-orange-700' },
  refer:                   { label: 'Refer',                     tone: 'neutral', cls: 'bg-gray-200 text-gray-700' },
};

export function decisionLabel(rc) {
  const d = DECISION[rc.decision];
  if (!d) return null;
  return rc.decision === 'expanded_market' && rc.decision_carrier ? `${d.label} — ${rc.decision_carrier}` : d.label;
}

// Rule editor vocab (mirrors rate_check_rules check constraints).
export const RULE_FIELDS = [
  { value: 'dwelling', label: 'Dwelling limit', kind: 'money', lines: ['home'] },
  { value: 'home_liability', label: 'Liability limit', kind: 'money', lines: ['home', 'condo', 'renters', 'commercial', 'umbrella'] },
  { value: 'personal_property', label: 'Personal property limit', kind: 'money', lines: ['home', 'condo', 'renters'] },
  { value: 'bi_per_person', label: 'Bodily injury per person', kind: 'money', lines: ['auto', 'commercial_auto'] },
  { value: 'bi_per_accident', label: 'Bodily injury per accident', kind: 'money', lines: ['auto', 'commercial_auto'] },
  { value: 'pd', label: 'Property damage', kind: 'money', lines: ['auto', 'commercial_auto'] },
  { value: 'um_uim', label: 'Uninsured motorist', kind: 'money', lines: ['auto'] },
  { value: 'vehicle_count', label: 'Number of vehicles', kind: 'number', lines: ['auto', 'commercial_auto'] },
  { value: 'driver_count', label: 'Number of drivers', kind: 'number', lines: ['auto', 'commercial_auto'] },
  { value: 'annual_premium', label: 'Premium per year', kind: 'money' },
  { value: 'term_months', label: 'Term (months)', kind: 'number' },
  { value: 'carrier', label: 'Carrier', kind: 'text' },
  { value: 'policy_type', label: 'Policy type', kind: 'text' },
  { value: 'zip', label: 'ZIP', kind: 'text' },
  { value: 'housing_situation', label: 'Where they live (own, rent, family, retirement)', kind: 'text' },
];
export const RULE_OPS = {
  money:  [['gt', 'is over'], ['gte', 'is at least'], ['lt', 'is under'], ['lte', 'is at most'], ['missing', 'is not on the page']],
  number: [['gt', 'is more than'], ['gte', 'is at least'], ['lt', 'is less than'], ['lte', 'is at most'], ['eq', 'is'], ['missing', 'is not on the page']],
  text:   [['eq', 'is'], ['neq', 'is not'], ['in', 'is one of'], ['not_in', 'is not one of'], ['starts_with', 'starts with'], ['missing', 'is not on the page']],
};
export const RULE_DECISIONS = [
  ['umbrella', 'Counts toward a PUP (needs auto + home)'],
  ['expanded_market', 'Expanded market'],
  ['double_check', 'Double check'],
  ['manual_review', 'Manual Review'],
  ['refer', 'Refer'],
];

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

// Mirrors the edge function's list. 'Other' keeps the printed name in carrier_raw.
export const CARRIERS = [
  'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual',
  'Nationwide', 'Travelers', 'Auto-Owners', 'Georgia Farm Bureau', 'Erie',
  'American Family', 'Country Financial', 'Safeco', 'Mercury', 'National General', 'The Hartford',
  'Amica', 'Kemper', 'Direct Auto', 'The General', 'Root', 'Lemonade', 'Chubb', 'Cincinnati',
  'Encompass', 'Foremost', 'Grange', 'The Hanover', 'Shelter', 'Homesite', 'Openly', 'Branch',
  'Bristol West', 'Infinity', 'Esurance', 'Other',
];
// What to show for the carrier: the printed name when we didn't recognise it.
export const carrierLabel = (rc) => (rc.carrier === 'Other' && rc.carrier_raw ? rc.carrier_raw : rc.carrier) || null;

export const POLICY_TYPE_LABEL = {
  auto: 'Auto', home: 'Home', renters: 'Renters', condo: 'Condo', umbrella: 'Umbrella',
  commercial_auto: 'Commercial auto', commercial: 'Commercial', other: 'Other',
};
export const POLICY_TYPES = Object.keys(POLICY_TYPE_LABEL);
export const policyTypeLabel = (t) => POLICY_TYPE_LABEL[t] || t || '';

export function vehicleName(v) {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

// "2/4/2026" — the way producers say dates (no leading zeros).
export function usDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${Number(m)}/${Number(d)}/${y}` : iso;
}

// "2/4/2026 to 7/25/2026"
export function policyPeriod(rc) {
  const a = usDate(rc.effective_date), b = usDate(rc.expiration_date);
  return a && b ? `${a} to ${b}` : a || b || null;
}

// "$780 every 6 months" / "$2,013 a year"
export function termPrice(rc) {
  if (rc.current_premium == null) return null;
  if (Number(rc.term_months) === 6) return `${money(rc.current_premium, { cents: true })} every 6 months`;
  if (Number(rc.term_months) === 12) return `${money(rc.current_premium, { cents: true })} a year`;
  return money(rc.current_premium, { cents: true });
}

// Everything needed to run the Allstate quote, as plain text to paste, in the
// order it's keyed in. Same normalization as the drawer (policyView.js).
export function quoteSheet(rc) {
  const x = rc.extracted || {};
  const lines = [];
  const push = (...l) => lines.push(...l);
  const name = insuredName(x.insured_name) || caps(rc.first_name);
  if (name) push(name);
  if (rc.insured_address) push(caps(rc.insured_address));
  else if (rc.zip) push(`ZIP ${rc.zip}`);
  if (rc.phone) push(formatPhone(rc.phone));
  if (rc.email) push(rc.email);

  const type = rc.policy_type ? `${policyTypeLabel(rc.policy_type).toLowerCase()} ` : '';
  push('', `Current: ${carrierLabel(rc) || 'Unknown carrier'} ${type}policy`.replace(/\s+/g, ' '));
  const price = termPrice(rc);
  if (price) push(`Premium: ${price}${rc.annual_premium != null && Number(rc.term_months) !== 12 ? ` (${money(rc.annual_premium)}/yr)` : ''}`);
  const period = policyPeriod(rc);
  if (period) push(`Policy period: ${period}`);
  if (rc.policy_number) push(`Policy #: ${rc.policy_number}`);

  const drivers = driverRows(rc);
  if (drivers.length) {
    push('', 'Drivers:');
    drivers.forEach(d => push(`  ${[d.name, d.age != null ? `age ${d.age}` : null, d.status, d.usage].filter(Boolean).join(' — ')}`));
  } else if (rc.driver_count != null) push('', `Drivers: ${rc.driver_count}`);

  const vehicles = Array.isArray(rc.vehicles) ? rc.vehicles : [];
  const isAuto = ['auto', 'commercial_auto'].includes(rc.policy_type);
  const setup = isAuto && vehicles.length ? vehicleCoverageSetup(rc) : null;
  const physical = new Set(['comp_deductible', 'coll_deductible', 'rental', 'roadside']);
  if (vehicles.length) {
    push('', 'Vehicles:');
    vehiclesNewestFirst(rc).forEach(({ v, index: i }) => {
      const vin = v.vin ? (v.vin_complete === false ? `VIN ends ${v.vin}` : `VIN ${v.vin}`) : null;
      const level = setup?.coverages.length ? setup.vehicles.find(s => s.index === i)?.levelLabel : null;
      push(`  ${vehicleTitle(v)}${vin ? ` — ${vin}` : ''}${level ? ` — ${level.toUpperCase()}` : ''}`);
      const lien = lienholderFor(rc, i);
      if (lien) push(`    Lienholder: ${lien} — ask loan payoff year`);
      const own = vehicleCoverages(rc, i).filter(r => !setup || !physical.has(r.key));
      if (own.length) push(`    ${own.map(r => `${r.label} ${r.value}`).join(' · ')}`);
    });
  }

  if (isAuto) {
    const names = (idx) => idx.map(i => vehicleShort(vehicles[i])).join(', ');
    const pushSetup = () => {
      if (!setup?.coverages.length) return;
      push('', 'Vehicle coverages:');
      setup.coverages.forEach(c => {
        const label = { comp_deductible: 'Comp deductible', coll_deductible: 'Collision deductible' }[c.key] || c.label;
        if (c.same) push(`  ${label}: ${c.groups[0].value}`);
        else {
          push(`  ${label}:`);
          c.groups.forEach(g => push(`    ${g.value} — ${names(g.indexes)}`));
          if (c.none.length) push(`    None — ${names(c.none)}`);
        }
      });
    };
    const groups = autoCoverageGroups(rc).filter(g => !(setup && g.title === 'Every vehicle'));
    groups.filter(g => g.title === 'Liability').forEach(g => {
      push('', 'Liability:');
      g.rows.forEach(r => push(`  ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`));
    });
    pushSetup();
    groups.filter(g => g.title !== 'Liability').forEach(g => {
      push('', `${g.title === 'Every vehicle' ? 'On every vehicle' : g.title}:`);
      g.rows.forEach(r => push(`  ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`));
    });
  } else {
    const p = propertyFacts(rc);
    if (p) {
      push('', 'Property:');
      if (p.year_built) push(`  Year built: ${p.year_built}`);
      if (p.construction) push(`  Construction: ${caps(p.construction)}`);
      if (p.roof_material || p.roof_year) push(`  Roof: ${[caps(p.roof_material), p.roof_year ? `INSTALLED ${p.roof_year}` : null].filter(Boolean).join(', ')}`);
      if (p.square_feet) push(`  Square feet: ${p.square_feet}`);
      if (p.mortgagee) push(`  Mortgagee: ${caps(p.mortgagee)}${p.loan_number ? ` — loan ${p.loan_number}` : ''}`);
      if (p.paid_by_mortgagee) push('  Paid from escrow');
    }
    const rows = homeCoverageRows(rc);
    if (rows.length) { push('', 'Coverages:'); rows.forEach(r => push(`  ${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`)); }
    const ends = endorsementsOf(rc);
    if (ends.length) { push('', 'Endorsements:'); ends.forEach(e => push(`  ${[e.code, e.name].filter(Boolean).join(' ')}${e.limit ? `: ${e.limit}` : ''}`)); }
  }

  const record = [...(Array.isArray(rc.surcharges) ? rc.surcharges : []), ...(Array.isArray(rc.claims) ? rc.claims : [])];
  if (record.length) { push('', 'On the record:'); record.forEach(t => push(`  ${t}`)); }
  const discounts = discountsOf(rc);
  if (discounts.length) push('', `Discounts now: ${discounts.join(', ')}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Rows that were clicked while the agent was selecting text shouldn't open/toggle.
export function isSelectingText() {
  return (window.getSelection?.()?.toString() || '').length > 0;
}
