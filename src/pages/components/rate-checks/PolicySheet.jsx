// src/pages/components/rate-checks/PolicySheet.jsx
// The scanned policy laid out the way a producer keys it into Allstate:
// who's insured → current policy (prior carrier, expiration, premium) →
// drivers → vehicles (each with its own coverages and lienholder) →
// liability → discounts; or for a home: property → coverages A–F →
// endorsements → discounts. A short summary closes the sheet.
// All formatting lives in policyView.js.

import { useState } from 'react';
import { AlertTriangle, CircleHelp } from 'lucide-react';
import { HOUSING_LABEL } from '../../../lib/rateCheckApi';
import { CopyButton, Field } from './Copyable';
import { ADD_ON_CLS, ADD_ON_STYLE } from './ui';
import { carrierLabel, policyPeriod, termPrice, TERM_HINT } from './format';
import {
  autoCoverageGroups, vehicleCoverages, homeCoverageRows, lienholderFor, propertyFacts, endorsementsOf,
  driverRows, discountsOf, headsUp, vehicleTitle, vehicleShort, caps, insuredName, vehiclesNewestFirst, replaceVehicleRefs,
  vehicleCoverageSetup, keyingSteps,
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

function Chip({ children, tone }) {
  const warn = tone === 'warn';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${warn ? 'text-yellow-700' : ''}`}
      style={warn
        ? { background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }
        : { background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
      {children}
    </span>
  );
}

const DEDUCTIBLES = ['comp_deductible', 'coll_deductible'];
const PHYSICAL = [...DEDUCTIBLES, 'rental', 'roadside'];

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
const TILE_NAME = { comp_deductible: 'Comp deductible', coll_deductible: 'Collision deductible' };
const LEVEL_TONE = {
  full: { color: 'var(--qs-success)', background: 'var(--qs-success-subtle)', border: '1px solid var(--qs-success-border)' },
  liability: { color: 'var(--qs-danger)', background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)' },
};

// "$50/day · $1,500 max" → "$50/day" large with "$1,500 max" under it, so long
// values still fit a half-width tile.
function TileValue({ value, addOn, size = 'text-xl' }) {
  const [main, ...rest] = String(value).split(' · ');
  return (
    <span className="block">
      <span className={`block ${size} font-bold tabular-nums`} style={addOn ? ADD_ON_STYLE : { color: 'var(--qs-bright)' }}>{main}</span>
      {rest.length > 0 && <span className="block text-xs font-medium" style={addOn ? ADD_ON_STYLE : { color: 'var(--qs-subtle)' }}>{rest.join(' · ')}</span>}
    </span>
  );
}

// One card per Allstate selection: Allstate changes a coverage on several vehicles at
// once only when it's the same change for all of them, so this is the fewest
// selections, biggest first, with the values to enter as tiles. Tick a card off when done.
function KeyingSteps({ rc, steps, total }) {
  const [done, setDone] = useState(() => new Set());
  const toggle = (id) => setDone(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const names = (indexes) => indexes.map(i => vehicleShort(rc.vehicles[i])).join(' + ');
  return (
    <ol className="space-y-3">
      {steps.map((st, i) => {
        const checked = done.has(st.id);
        return (
          <li key={st.id} className="rounded-lg p-2" style={{ border: '1px solid var(--qs-border)', opacity: checked ? 0.5 : 1 }}>
            {total > 1 && (
              <label className="mb-2 flex cursor-pointer items-start gap-2 px-1">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={checked} onChange={() => toggle(st.id)}
                  aria-label={`Step ${i + 1} done`} />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-bright)' }}>
                  {i + 1}. Select {st.all ? `all ${st.indexes.length} vehicles` : names(st.indexes)}
                </span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              {st.changes.map((ch, j) => (
                <div key={ch.key} className={`rounded-lg px-3 py-2 ${j === st.changes.length - 1 && st.changes.length % 2 === 1 ? 'col-span-2' : ''}`} style={TILE}>
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--qs-subtle)' }}>{TILE_NAME[ch.key] || ch.label}</p>
                  <TileValue value={ch.value} addOn={ch.addOn} />
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// "$50/day · $1,500 max" → "$50 / $1,500" so four columns fit the drawer.
const gridValue = (v) => (v == null ? '—' : String(v).replace('/day · ', ' / ').replace(/ max$/, ''));
const GRID_HEAD = { comp_deductible: 'Comp', coll_deductible: 'Coll', rental: 'Rental', roadside: 'Road' };

// After keying: every vehicle's physical damage on one line, to check against Allstate.
function CheckByVehicle({ setup }) {
  const keys = Object.keys(GRID_HEAD).filter(k => setup.coverages.some(c => c.key === k));
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium" style={{ color: 'var(--qs-subtle)' }}>Check by vehicle</summary>
      <table className="mt-2 w-full table-fixed text-xs">
        <thead>
          <tr style={{ color: 'var(--qs-subtle)' }}>
            <th className="w-[34%] py-1 text-left font-semibold">Vehicle</th>
            {keys.map(k => <th key={k} className="py-1 text-right font-semibold">{GRID_HEAD[k]}</th>)}
          </tr>
        </thead>
        <tbody>
          {setup.vehicles.map(x => (
            <tr key={x.index} style={{ borderTop: '1px solid var(--qs-border)' }}>
              <td className="py-1.5 pr-1 font-medium" style={{ color: 'var(--qs-bright)' }}>{vehicleShort(x.v)}</td>
              {keys.map(k => (
                <td key={k} className="py-1.5 text-right tabular-nums"
                  style={x.values[k] == null ? { color: 'var(--qs-muted)' } : (k === 'rental' || k === 'roadside' ? ADD_ON_STYLE : { color: 'var(--qs-bright)' })}>
                  {gridValue(x.values[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function VehicleCoverages({ rc, setup }) {
  const total = setup.vehicles.length;
  const steps = keyingSteps(setup);
  return (
    <Section title="Vehicle coverages" ruled aside={total > 1 && (
      <span className="text-xs" style={{ color: 'var(--qs-subtle)' }}>{steps.length} {steps.length === 1 ? 'selection' : 'selections'} in Allstate</span>
    )}>
      <KeyingSteps key={rc.id} rc={rc} steps={steps} total={total} />
      {total > 1 && <CheckByVehicle setup={setup} />}
    </Section>
  );
}

function VehicleCard({ rc, v, index, level }) {
  const vin = v.vin ? (v.vin_complete === false ? `…${v.vin}` : v.vin) : (v.vin_last4 ? `…${v.vin_last4}` : null);
  const vinWarn = v.vin_complete === false ? 'Only part of the VIN is on the page'
    : v.vin_complete && v.vin_valid === false ? 'This VIN doesn’t check out — compare with the photo' : null;
  // Comp, collision, rental and roadside are grouped across vehicles below; only other lines stay here.
  const extras = vehicleCoverages(rc, index).filter(r => !PHYSICAL.includes(r.key));
  const lien = lienholderFor(rc, index);
  return (
    <li className="py-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{vehicleTitle(v)}</p>
        {vin && (
          <span className="inline-flex items-center gap-1">
            <span className="select-text font-mono text-sm" style={{ color: 'var(--qs-bright)' }}>{vin}</span>
            {v.vin && v.vin_complete !== false && <CopyButton text={v.vin} label={`Copy VIN for ${vehicleTitle(v)}`} />}
          </span>
        )}
      </div>
      {level && (
        <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
          style={LEVEL_TONE[level.level] || { color: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)', border: '1px solid var(--qs-warning-border)' }}>
          {level.levelLabel}
        </span>
      )}
      {vinWarn && <p className="text-xs text-yellow-600">{vinWarn}</p>}
      {lien && (
        <>
          <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: 'var(--qs-text)' }}>
            <span style={{ color: 'var(--qs-subtle)' }}>Lienholder</span> {lien}
            <CopyButton text={lien} label={`Copy lienholder for ${vehicleTitle(v)}`} />
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm" style={{ color: 'var(--qs-text)' }}>
            <span style={{ color: 'var(--qs-subtle)' }}>Loan payoff year</span>
            <CircleHelp className="h-4 w-4" style={{ color: 'var(--qs-warning)' }} aria-label="Not on the dec page — ask the customer" role="img" />
          </p>
        </>
      )}
      {extras.map(r => (
        <p key={r.key} className={`mt-1.5 text-sm ${r.addOn ? ADD_ON_CLS : ''}`} style={r.addOn ? ADD_ON_STYLE : { color: 'var(--qs-text)' }}>
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
          <ul>{vehiclesNewestFirst(rc).map(({ v, index }) => <VehicleCard key={index} rc={rc} v={v} index={index} level={levelOf(index)} />)}</ul>
        </Section>
      )}

      {isAuto && coverageGroups.filter(g => g.title === 'Liability').map(g => (
        <Section key={g.title} title="Liability"><Rows rows={g.rows} /></Section>
      ))}
      {setup?.coverages.length > 0 && <VehicleCoverages rc={rc} setup={setup} />}
      {isAuto && coverageGroups.filter(g => g.title !== 'Liability').map(g => (
        <Section key={g.title} title={g.title === 'Every vehicle' ? 'Coverage on every vehicle' : g.title}><Rows rows={g.rows} /></Section>
      ))}

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
          <div className="flex flex-wrap gap-1.5">{discounts.map(d => <Chip key={d}>{d}</Chip>)}</div>
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
  const lines = headsUp(rc);
  if (!lines.length && !warning) return null;
  return (
    <Section title="Summary" ruled>
      <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--qs-text)' }}>
        {warning && (
          <p className="flex gap-2 text-yellow-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{warning}</p>
        )}
        {lines.length > 0 && <p className="select-text">{lines.join(' ')}</p>}
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
