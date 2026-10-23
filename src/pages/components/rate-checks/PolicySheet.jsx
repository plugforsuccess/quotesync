// src/pages/components/rate-checks/PolicySheet.jsx
// The scanned policy laid out the way a producer keys it into Allstate:
// who's insured → current policy (prior carrier, expiration, premium) →
// drivers → vehicles (each with its own coverages and lienholder) →
// liability → discounts; or for a home: property → coverages A–F →
// endorsements → discounts. A short summary closes the sheet.
// All formatting lives in policyView.js.

import { AlertTriangle, CircleHelp } from 'lucide-react';
import { HOUSING_LABEL } from '../../../lib/rateCheckApi';
import { CopyButton, Field } from './Copyable';
import { ADD_ON_CLS, ADD_ON_STYLE } from './ui';
import { carrierLabel, policyPeriod, termPrice, TERM_HINT } from './format';
import {
  autoCoverageGroups, vehicleCoverages, homeCoverageRows, lienholderFor, gapFor, propertyFacts, endorsementsOf, shortEndorsementName,
  driverRows, discountsOf, summaryLines, vehicleTitle, vehicleShort, caps, insuredName, vehiclesNewestFirst, replaceVehicleRefs,
  vehicleCoverageSetup,
} from './policyView';

const AUTO = ['auto', 'commercial_auto'];
const PROPERTY = ['home', 'condo', 'renters'];

// `ruled` draws the line under the title for content that isn't label/value rows
// (rows already start with their own top border), so every section looks the same.
export function Section({ title, aside, ruled = false, children }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>{title}</h3>
        {aside}
      </div>
      {ruled ? <div className="pt-3" style={{ borderTop: '1px solid var(--qs-border)' }}>{children}</div> : children}
    </section>
  );
}

function Chip({ children, tone, className = '' }) {
  const warn = tone === 'warn';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${warn ? 'text-yellow-700' : ''} ${className}`}
      style={warn
        ? { background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }
        : { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
      {children}
    </span>
  );
}

const DEDUCTIBLES = ['comp_deductible', 'coll_deductible'];
const PHYSICAL = [...DEDUCTIBLES, 'rental', 'roadside', 'glass'];

const TILE_LABEL = { Comprehensive: 'Comp', Collision: 'Collision' };

function DeductibleTile({ label, value }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}>
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{TILE_LABEL[label] || label} deductible</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--qs-bright)' }}>{value}</p>
    </div>
  );
}

function Rows({ rows }) {
  const tiles = rows.filter(r => DEDUCTIBLES.includes(r.key));
  const rest = rows.filter(r => !DEDUCTIBLES.includes(r.key));
  return (
    <>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-2 pb-1" style={{ borderTop: '1px solid var(--qs-border)' }}>
          {tiles.map(r => <DeductibleTile key={r.key} label={r.label} value={r.value} />)}
        </div>
      )}
      <dl>
        {rest.map(r => (
          <Field key={r.key || r.label} label={r.label} value={r.value} hint={r.note || undefined} addOn={r.addOn} wide />
        ))}
      </dl>
    </>
  );
}

const TILE = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' };
// Every tile has the same shape whatever the scan holds: a two-line label area, the
// value, then the "All 3 vehicles" line. So tiles match in height and values line up.
function TileLabel({ children }) {
  return (
    <p className="line-clamp-2 min-h-[30px] text-[11px] font-bold uppercase leading-[15px] tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>
      {children}
    </p>
  );
}
const TILE_NAME = { comp_deductible: 'Comp deductible', coll_deductible: 'Collision deductible' };
const LEVEL_TONE = {
  full: { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' },
  liability: { color: 'var(--qs-danger)', background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)' },
};

// "A · B" values → "A" large with "B" under it, so long values still fit a half-width tile.
function TileValue({ value, addOn, inline = false, size = 'text-xl' }) {
  const [main, ...rest] = String(value).split(' · ');
  const tone = addOn ? ADD_ON_STYLE : { color: 'var(--qs-bright)' };
  // Full-width tiles have room for "A · B" on one line.
  if (inline) {
    return (
      <p className="text-xl font-bold tabular-nums" style={tone}>
        {main}{rest.length > 0 && <span className="text-base font-semibold"> · {rest.join(' · ')}</span>}
      </p>
    );
  }
  return (
    <span className="block">
      <span className={`block ${size} font-bold tabular-nums`} style={tone}>{main}</span>
      {rest.length > 0 && <span className="block text-xs font-medium" style={addOn ? ADD_ON_STYLE : { color: 'var(--qs-subtle)' }}>{rest.join(' · ')}</span>}
    </span>
  );
}

// One tile per coverage. A plain tile is the same on every vehicle; when vehicles
// differ, each value gets chips naming its vehicles (a chip is tinted by that
// vehicle's level, so a liability-only car explains itself).
// Same cyan as the vehicle titles and number badges above, so a car reads the same everywhere.
const VEHICLE_TONE = { color: 'var(--qs-cyan)', background: 'rgba(6, 182, 212, 0.14)', border: '1px solid rgba(6, 182, 212, 0.45)' };

function VehicleChip({ x }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold" style={{ ...VEHICLE_TONE, color: 'var(--qs-bright)' }}>{vehicleShort(x.v)}</span>
  );
}

function CoverageTile({ c, setup, total, wide }) {
  // Differs → one row per car (newest first): chip, then that car's value.
  const deductible = c.key === 'comp_deductible' || c.key === 'coll_deductible';
  const rows = setup.vehicles.filter(x => !(deductible && x.level === 'liability'));
  // Glass reads "$0 · Glass deductible" when it's an amount, "Glass" when it's words ("Full glass").
  const name = c.key === 'glass' ? (c.groups.every(g => /^\$/.test(g.value)) ? 'Glass deductible' : 'Glass') : (TILE_NAME[c.key] || c.label);
  const everyCar = c.same && c.count === total;
  const withIt = setup.vehicles.filter(x => c.groups[0]?.indexes.includes(x.index));
  return (
    <div className={`rounded-lg px-3 py-2 ${wide ? 'col-span-2' : ''}`} style={TILE}>
      {wide
        ? <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{name}</p>
        : <TileLabel>{name}</TileLabel>}
      {c.groups.length === 1 && (everyCar || c.key !== 'rental') ? (
        // One value → one label; every vehicle says so, otherwise pills for the cars that have it.
        <div>
          <TileValue value={c.groups[0].value} addOn />
          {/* "All 3 vehicles" and car pills sit on the same line height, so side-by-side tiles line up. */}
          {total > 1 && (
            <div className="mt-1 flex min-h-[24px] flex-wrap items-center gap-1">
              {everyCar
                ? <span className="text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>All {total} vehicles</span>
                : withIt.map(x => <VehicleChip key={x.index} x={x} />)}
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {rows.map(x => (
            <li key={x.index} className="flex min-h-[28px] items-center justify-between gap-3">
              {/* The car never wraps; a long value breaks at its "·" instead. */}
              <span className="shrink-0"><VehicleChip x={x} /></span>
              {x.values[c.key] == null
                ? <span className="text-base font-bold" style={{ color: 'var(--qs-muted)' }}>None</span>
                : (
                  <span className="min-w-0 text-right text-base font-bold tabular-nums" style={ADD_ON_STYLE}>
                    {String(x.values[c.key]).split(' · ').map((part, k, all) => (
                      <span key={k}>{k > 0 && ' '}<span className="whitespace-nowrap">{part}{k < all.length - 1 && ' ·'}</span></span>
                    ))}
                  </span>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VehicleCoverages({ setup }) {
  const total = setup.vehicles.length;
  // In Allstate's order (comp, collision, rental, roadside, glass). Tiles with one value
  // pair up two per row: on every car, or (glass, roadside) on some cars with their pills.
  // Rental on only some cars keeps the full row so its "None" cars show; so does a tile
  // whose value differs by car, or one with no partner.
  const cells = [];
  const cs = setup.coverages;
  const compact = (c) => (c.same && c.count === total) || (c.groups.length === 1 && c.key !== 'rental');
  for (let i = 0; i < cs.length; i++) {
    if (compact(cs[i]) && cs[i + 1] && compact(cs[i + 1])) { cells.push([cs[i], false], [cs[i + 1], false]); i++; } else cells.push([cs[i], true]);
  }
  return (
    <Section title="Vehicle coverages" ruled>
      <div className="grid grid-cols-2 gap-2">
        {cells.map(([c, wide]) => <CoverageTile key={c.key} c={c} setup={setup} total={total} wide={wide} />)}
      </div>
    </Section>
  );
}

const GAP = ['gap', 'loan_lease'];
const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-4';
// Gap they have: filled add-on yellow. Something to ask about gap: amber outline only.
const GAP_PILL = { color: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' };
const FLAG_PILL = { color: 'var(--qs-warning)', background: 'transparent', border: '1px dashed var(--qs-warning)' };

function VehicleCard({ rc, v, index, level, n }) {
  const vin = v.vin ? (v.vin_complete === false ? `…${v.vin}` : v.vin) : (v.vin_last4 ? `…${v.vin_last4}` : null);
  const vinWarn = v.vin_complete === false ? 'Only part of the VIN is on the page'
    : v.vin_complete && v.vin_valid === false ? 'This VIN doesn’t check out — compare with the photo' : null;
  // Comp, collision, rental and roadside are grouped across vehicles below; only other lines stay here.
  // Gap sits with the lienholder as pills, so it's left out of the lines below.
  const extras = vehicleCoverages(rc, index).filter(r => !PHYSICAL.includes(r.key) && !GAP.includes(r.key));
  const lien = lienholderFor(rc, index);
  const gap = gapFor(rc, index);
  const hasGapRow = gap.pills.length > 0 || Boolean(gap.flag);
  const gapRow = (mt) => hasGapRow && (
    <div className={`${mt} flex flex-wrap items-center gap-1.5 pl-[34px]`}>
      {gap.pills.map(p => <span key={p.key} className={PILL} style={GAP_PILL}>{p.label}</span>)}
      {gap.flag === 'no_gap' && <span className={PILL} style={FLAG_PILL}>No Gap</span>}
      {gap.flag === 'no_lien' && (
        <span className={`${PILL} gap-1`} style={FLAG_PILL}>
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" /> No lienholder listed — paid off?
        </span>
      )}
    </div>
  );
  return (
    <li className="py-4" style={{ borderTop: '1px solid var(--qs-border)' }}>
      {/* Number badge, year/make/model and the coverage level on one line; the VIN under the title. */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
          style={VEHICLE_TONE} aria-hidden="true">{n}</span>
        <p className="min-w-0 flex-1 truncate text-[17px] font-semibold" style={{ color: 'var(--qs-cyan)' }}>
          <span className="sr-only">Vehicle {n}: </span>{vehicleTitle(v)}
        </p>
        {level && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em]"
            style={LEVEL_TONE[level.level] || { color: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }}>
            {level.levelLabel}
          </span>
        )}
      </div>
      {vin && (
        <p className="mt-1 flex items-center gap-1 pl-[34px]">
          <span className="select-text font-mono text-sm" style={{ color: 'var(--qs-bright)' }}>{vin}</span>
          {v.vin && v.vin_complete !== false && <CopyButton text={v.vin} label={`Copy VIN for ${vehicleTitle(v)}`} />}
        </p>
      )}
      {vinWarn && <p className="pl-[34px] text-xs text-yellow-600">{vinWarn}</p>}
      {lien && (
        <>
          <p className="mt-3 flex items-center gap-1 pl-[34px] text-sm" style={{ color: 'var(--qs-text)' }}>
            <span style={{ color: 'var(--qs-subtle)' }}>Lienholder</span> {lien}
            <CopyButton text={lien} label={`Copy lienholder for ${vehicleTitle(v)}`} />
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 pl-[34px] text-sm" style={{ color: 'var(--qs-text)' }}>
            <span style={{ color: 'var(--qs-subtle)' }}>Loan Payoff</span>
            <CircleHelp className="h-4 w-4" style={{ color: 'var(--qs-warning)' }} aria-label="Not on the dec page — ask the customer" role="img" />
          </p>
          {gapRow('mt-2')}
        </>
      )}
      {!lien && gapRow('mt-3')}
      {extras.map((r, i) => (
        <p key={r.key} className={`${i === 0 && !lien && !hasGapRow ? 'mt-3' : 'mt-1.5'} pl-[34px] text-sm ${r.addOn ? ADD_ON_CLS : ''}`} style={r.addOn ? ADD_ON_STYLE : { color: 'var(--qs-text)' }}>
          {r.label} {r.value}
        </p>
      ))}
    </li>
  );
}

export default function PolicySheet({ rc, warning }) {
  const x = rc.extracted || {};
  const isAuto = AUTO.includes(rc.policy_type);
  const isProperty = PROPERTY.includes(rc.policy_type);
  const vehicles = Array.isArray(rc.vehicles) ? rc.vehicles : [];
  const drivers = driverRows(rc);
  const discounts = discountsOf(rc);
  const record = [...(rc.surcharges || []), ...(rc.claims || [])];
  const termHint = TERM_HINT[rc.term_source];
  const insured = insuredName(x.insured_name);
  const setup = isAuto && vehicles.length ? vehicleCoverageSetup(rc) : null;
  // With vehicles listed, comp / collision / rental / roadside live in "Vehicle coverages".
  const coverageGroups = isAuto ? autoCoverageGroups(rc).filter(g => !(setup && g.title === 'Every vehicle')) : [];
  const levelOf = (index) => setup?.coverages.length ? setup.vehicles.find(s => s.index === index) : null;

  return (
    <div className="space-y-6">
      <Section title="Insured">
        <dl>
          <Field label="Name on policy" value={insured} copy />
          <Field label="Address" value={rc.insured_address ? caps(rc.insured_address) : (rc.zip ? `ZIP ${rc.zip}` : null)} copy={rc.insured_address ? caps(rc.insured_address) : rc.zip} />
          {rc.email && <Field label="Email" value={rc.email} copy />}
          {rc.housing_situation && <Field label="Lives" value={HOUSING_LABEL[rc.housing_situation] || rc.housing_situation} />}
        </dl>
      </Section>

      <Section title="Current policy">
        <dl>
          <Field label="Carrier" value={carrierLabel(rc)} />
          <Field label="Policy number" value={rc.policy_number} copy mono />
          <Field label="Policy period" value={policyPeriod(rc)} />
          <Field label="Premium" value={termPrice(rc)} hint={termHint?.text} hintTone={termHint?.tone} />
        </dl>
      </Section>

      {isAuto && drivers.length > 0 && (
        <Section title={`Drivers · ${drivers.length}`}>
          <dl>
            {drivers.map((d, i) => (
              <Field key={i} label={d.display} wide
                value={[d.age != null ? `Age ${d.age}` : null, d.status, d.usage].filter(Boolean).join(' · ') || 'Listed'}
                hint={d.excluded ? 'Excluded driver' : undefined} hintTone="warn" />
            ))}
          </dl>
        </Section>
      )}

      {isAuto && vehicles.length > 0 && (
        <Section title={`Vehicles · ${vehicles.length}`}>
          <ul>{vehiclesNewestFirst(rc).map(({ v, index }, i) => <VehicleCard key={index} rc={rc} v={v} index={index} level={levelOf(index)} n={i + 1} />)}</ul>
        </Section>
      )}

      {isAuto && coverageGroups.filter(g => g.title === 'Liability').map(g => (
        <Section key={g.title} title="Liability"><Rows rows={g.rows} /></Section>
      ))}
      {setup?.coverages.length > 0 && <VehicleCoverages setup={setup} />}
      {isAuto && coverageGroups.filter(g => g.title !== 'Liability').map(g => (
        <Section key={g.title} title={g.title === 'Every vehicle' ? 'Coverage on every vehicle' : g.title}><Rows rows={g.rows} /></Section>
      ))}
      {isAuto && <AutoEndorsements rc={rc} />}

      {isProperty && <PropertySection rc={rc} />}
      {isProperty && homeCoverageRows(rc).length > 0 && (
        <Section title="Coverages"><Rows rows={homeCoverageRows(rc)} /></Section>
      )}
      {isProperty && <EndorsementsSection rc={rc} />}

      {!isAuto && !isProperty && rc.coverages && Object.keys(rc.coverages).length > 0 && (
        <Section title="Coverages"><Rows rows={homeCoverageRows(rc)} /></Section>
      )}

      {record.length > 0 && (
        <Section title={isAuto ? 'Driving record on the page' : 'Claims on the page'} ruled>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>{record.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Section>
      )}

      {discounts.length > 0 && (
        <Section title="Discounts they have now" ruled>
          {/* Two equal columns like the tiles, so the pills fill the width; an odd last one spans the row. */}
          <ul className="grid grid-cols-2 gap-1.5">
            {discounts.map((d, i) => (
              <li key={d} className={`flex ${i === discounts.length - 1 && discounts.length % 2 ? 'col-span-2' : ''}`}>
                <Chip className="w-full justify-center text-center">{d}</Chip>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <SummarySection rc={rc} warning={warning} />

      {x.notes && (
        <details className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <summary className="cursor-pointer font-medium">Everything the scan noted</summary>
          <p className="mt-2 select-text" style={{ color: 'var(--qs-text)' }}>{replaceVehicleRefs(x.notes, rc.vehicles || x.vehicles)}</p>
        </details>
      )}
    </div>
  );
}

// What the producer should know that the fields above don't say: the scan's
// summary (or, for older scans, what's left of its note), plus a read-quality warning.
function SummarySection({ rc, warning }) {
  const lines = summaryLines(rc);
  if (!lines.length && !warning) return null;
  return (
    <Section title="Summary" ruled>
      <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--qs-text)' }}>
        {warning && (
          <p className="flex gap-2 text-yellow-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{warning}</p>
        )}
        {lines.map(l => (
          <p key={l.tag} className="select-text"><b style={{ color: 'var(--qs-bright)' }}>{l.tag}.</b> {l.text}</p>
        ))}
      </div>
    </Section>
  );
}

function PropertySection({ rc }) {
  const p = propertyFacts(rc);
  if (!p) return null;
  const roof = [caps(p.roof_material), p.roof_year ? `INSTALLED ${p.roof_year}` : null].filter(Boolean).join(', ');
  return (
    <Section title="Property">
      <dl>
        {p.year_built && <Field label="Year built" value={String(p.year_built)} />}
        {p.construction && <Field label="Construction" value={caps(p.construction)} />}
        {roof && <Field label="Roof" value={roof} />}
        {p.square_feet && <Field label="Square feet" value={Number(p.square_feet).toLocaleString('en-US')} />}
        {p.stories && <Field label="Stories" value={String(p.stories)} />}
        {p.mortgagee && <Field label="Mortgagee" value={caps(p.mortgagee)} copy />}
        {p.loan_number && <Field label="Loan number" value={p.loan_number} copy mono />}
        {p.paid_by_mortgagee != null && <Field label="Paid by" value={p.paid_by_mortgagee ? 'Mortgage company (escrow)' : 'Customer'} />}
      </dl>
    </Section>
  );
}

// Auto endorsements (accident forgiveness, rideshare, new car replacement…) as tiles,
// two per row at the same size as the vehicle-coverage tiles: name, the limit (or Yes),
// then "All 3 vehicles". The scan puts anything printed per vehicle on that vehicle, so
// what's left here is policy-wide. The carrier's form code is only a tooltip: it isn't
// something to key into Allstate. Yellow like every add-on: easy to leave off a quote.
function AutoEndorsements({ rc }) {
  const list = endorsementsOf(rc);
  if (!list.length) return null;
  const cars = Array.isArray(rc.vehicles) ? rc.vehicles.length : 0;
  return (
    <Section title={`Endorsements · ${list.length}`} ruled>
      <ul className="grid grid-cols-2 gap-2">
        {list.map((e, i) => (
          <li key={i} className="rounded-lg px-3 py-2" style={TILE} title={[e.name, e.code && `Form ${e.code}`].filter(Boolean).join(' · ')}>
            <TileLabel>{shortEndorsementName(e.name)}</TileLabel>
            {/* A long limit ("$100 off per year") drops a size so it stays on one line and the tiles match. */}
            <TileValue value={e.limit || 'Yes'} addOn size={String(e.limit || '').length > 9 ? 'text-base leading-7' : 'text-xl'} />
            <div className="mt-1 flex min-h-[24px] items-center">
              <span className="text-xs font-medium" style={{ color: 'var(--qs-subtle)' }}>
                {cars > 1 ? `All ${cars} vehicles` : cars === 1 ? 'This vehicle' : 'Whole policy'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EndorsementsSection({ rc }) {
  const list = endorsementsOf(rc);
  if (!list.length) return null;
  return (
    <Section title={`Endorsements · ${list.length}`}>
      <ul>
        {list.map((e, i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm" style={{ borderTop: '1px solid var(--qs-border)' }}>
            <span>
              <span className="font-semibold" style={{ color: 'var(--qs-warning)' }}>{e.name}</span>
              {e.code && <span className="ml-1.5 font-mono text-xs" style={{ color: 'var(--qs-subtle)' }}>{e.code}</span>}
            </span>
            {e.limit && <span className="shrink-0 text-right font-semibold" style={{ color: 'var(--qs-bright)' }}>{e.limit}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
