// src/pages/components/rate-checks/PolicySheet.jsx
// The scanned policy laid out the way a producer keys it into Allstate:
// who's insured → current policy (prior carrier, expiration, premium) →
// drivers → vehicles (each with its own coverages and lienholder) →
// liability → discounts; or for a home: property → coverages A–F →
// endorsements → discounts. A short summary closes the sheet.
// All formatting lives in policyView.js.

import { AlertTriangle } from 'lucide-react';
import { HOUSING_LABEL } from '../../../lib/rateCheckApi';
import { CopyButton, Field } from './Copyable';
import { carrierLabel, policyPeriod, termPrice, TERM_HINT } from './format';
import {
  autoCoverageGroups, vehicleCoverages, homeCoverageRows, lienholderFor, propertyFacts, endorsementsOf,
  driverRows, discountsOf, headsUp, vehicleTitle, caps, insuredName,
} from './policyView';

const AUTO = ['auto', 'commercial_auto'];
const PROPERTY = ['home', 'condo', 'renters'];

export function Section({ title, aside, children }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>{title}</h3>
        {aside}
      </div>
      {children}
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

function Rows({ rows }) {
  return (
    <dl>
      {rows.map(r => (
        <Field key={r.key || r.label} label={r.label} value={r.value} hint={r.note || undefined} wide />
      ))}
    </dl>
  );
}

function VehicleCard({ rc, v, index }) {
  const vin = v.vin ? (v.vin_complete === false ? `…${v.vin}` : v.vin) : (v.vin_last4 ? `…${v.vin_last4}` : null);
  const vinWarn = v.vin_complete === false ? 'Only part of the VIN is on the page'
    : v.vin_complete && v.vin_valid === false ? 'This VIN doesn’t check out — compare with the photo' : null;
  const miles = v.annual_mileage ? `${Number(v.annual_mileage).toLocaleString('en-US')} mi/yr` : null;
  const own = vehicleCoverages(rc, index);
  const lien = lienholderFor(rc, index);
  return (
    <li className="py-3" style={{ borderTop: '1px solid var(--qs-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{vehicleTitle(v)}</p>
        {vin && (
          <span className="flex items-center gap-1">
            <span className="select-text font-mono text-sm" style={{ color: 'var(--qs-bright)' }}>{vin}</span>
            {v.vin && v.vin_complete !== false && <CopyButton text={v.vin} label={`Copy VIN for ${vehicleTitle(v)}`} />}
          </span>
        )}
      </div>
      {vinWarn && <p className="text-xs text-yellow-600">{vinWarn}</p>}
      {miles && <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>{miles}</p>}
      {own.length > 0 && (
        <p className="mt-1 text-sm" style={{ color: 'var(--qs-text)' }}>
          {own.map(r => `${r.label} ${r.value}`).join(' · ')}
        </p>
      )}
      {lien && (
        <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: 'var(--qs-text)' }}>
          <span style={{ color: 'var(--qs-subtle)' }}>Lienholder</span> {lien}
          <CopyButton text={lien} label={`Copy lienholder for ${vehicleTitle(v)}`} />
        </p>
      )}
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
          <ul>{vehicles.map((v, i) => <VehicleCard key={i} rc={rc} v={v} index={i} />)}</ul>
        </Section>
      )}

      {isAuto && autoCoverageGroups(rc).map(g => (
        <Section key={g.title} title={g.title === 'Liability' ? 'Liability' : g.title === 'Every vehicle' ? 'Coverage on every vehicle' : g.title}>
          <Rows rows={g.rows} />
        </Section>
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
        <Section title={isAuto ? 'Driving record on the page' : 'Claims on the page'}>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--qs-text)' }}>{record.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Section>
      )}

      {discounts.length > 0 && (
        <Section title="Discounts they have now">
          <div className="flex flex-wrap gap-1.5">{discounts.map(d => <Chip key={d}>{d}</Chip>)}</div>
        </Section>
      )}

      <SummarySection rc={rc} warning={warning} />

      {x.notes && (
        <details className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
          <summary className="cursor-pointer font-medium">Everything the scan noted</summary>
          <p className="mt-2 select-text" style={{ color: 'var(--qs-text)' }}>{x.notes}</p>
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
    <Section title="Summary">
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
              <span style={{ color: 'var(--qs-bright)' }}>{e.name}</span>
              {e.code && <span className="ml-1.5 font-mono text-xs" style={{ color: 'var(--qs-subtle)' }}>{e.code}</span>}
            </span>
            {e.limit && <span className="shrink-0 text-right" style={{ color: 'var(--qs-bright)' }}>{e.limit}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
