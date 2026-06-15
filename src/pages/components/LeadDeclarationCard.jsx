// src/pages/components/LeadDeclarationCard.jsx
// Renders the data extracted from a lead's uploaded declarations page(s). A lead
// may upload more than one (e.g. auto + home), so declaration_data is an array;
// each entry renders its own block with a link to view that original document.
// Read-only; values may be imperfect, so a confidence flag + the original link
// let the agent verify against source.
import { useState } from 'react';
import { FileText, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const POLICY_TYPE_LABELS = {
  auto: 'Auto', home: 'Home', renters: 'Renters',
  condo: 'Condo', landlord: 'Landlord', umbrella: 'Umbrella', other: 'Other',
};

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

const fmtMoney = (n) => (typeof n === 'number' ? `$${n.toLocaleString()}` : n);

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-gray-500 text-sm">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function DeclarationEntry({ entry }) {
  const [opening, setOpening] = useState(false);
  const [linkError, setLinkError] = useState(null);

  const title = `${POLICY_TYPE_LABELS[entry.policy_type] || 'Policy'}${entry.insurer ? ` — ${entry.insurer}` : ''}`;

  const openOriginal = async () => {
    if (!entry.pdf_path) return;
    setLinkError(null);
    setOpening(true);
    try {
      const { data: signed, error } = await supabase.storage
        .from('lead-declarations')
        .createSignedUrl(entry.pdf_path, 120);
      if (error || !signed?.signedUrl) throw error || new Error('No URL');
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setLinkError('Could not open the document. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {entry.confidence && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CONFIDENCE_STYLES[entry.confidence] || 'bg-gray-100 text-gray-600'}`}>
              {entry.confidence === 'low' ? 'low confidence' : `${entry.confidence} confidence`}
            </span>
          )}
        </div>
        {entry.pdf_path && (
          <button
            type="button"
            onClick={openOriginal}
            disabled={opening}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800 disabled:opacity-60"
          >
            {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            View original
          </button>
        )}
      </div>

      {linkError && <p className="text-sm text-red-600 mb-3">{linkError}</p>}

      <dl className="grid grid-cols-2 gap-4">
        <Field label="Policy Number" value={entry.policy_number} />
        <Field label="Term" value={entry.policy_term} />
        <Field label="Named Insured" value={entry.named_insured} />
        <Field label="Effective Date" value={entry.effective_date} />
        <Field label="Expiration / Renewal" value={entry.expiration_date} />
        <Field label="Annual Premium" value={fmtMoney(entry.annual_premium)} />
        {entry.term_premium != null && <Field label="Term Premium" value={fmtMoney(entry.term_premium)} />}
        {entry.fees != null && <Field label="Fees" value={fmtMoney(entry.fees)} />}
        <Field label="Risk Address" value={entry.risk_address} />
        <Field label="Mailing Address" value={entry.mailing_address} />
      </dl>

      {Array.isArray(entry.discounts) && entry.discounts.length > 0 && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-1.5">Discounts on current policy</dt>
          <div className="flex flex-wrap gap-1.5">
            {entry.discounts.map((d, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* Mortgagee / lienholder — high-value competitive intel */}
      {Array.isArray(entry.mortgagees) && entry.mortgagees.length > 0 && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-1.5">Mortgagee / Lienholder</dt>
          <ul className="space-y-1.5">
            {entry.mortgagees.map((m, i) => (
              <li key={i} className="text-sm text-gray-900">
                <span className="font-medium">{m.lender_name || 'Lender'}</span>
                {m.position && <span className="text-gray-400 font-normal"> · {m.position}</span>}
                {m.loan_number && <span className="text-gray-400 font-normal"> · Loan {m.loan_number}</span>}
                {m.address && <div className="text-xs text-gray-500">{m.address}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Home / dwelling coverages (Coverage A–F) */}
      {entry.property && Object.values(entry.property).some((v) => v != null) && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-2">Home Coverages &amp; Property</dt>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="A · Dwelling" value={entry.property.dwelling_coverage_a} />
            <Field label="B · Other Structures" value={entry.property.other_structures_b} />
            <Field label="C · Personal Property" value={entry.property.personal_property_c} />
            <Field label="D · Loss of Use" value={entry.property.loss_of_use_d} />
            <Field label="E · Personal Liability" value={entry.property.personal_liability_e} />
            <Field label="F · Medical Payments" value={entry.property.medical_payments_f} />
            <Field label="Deductible" value={entry.property.all_perils_deductible} />
            <Field label="Wind / Hail Deductible" value={entry.property.wind_hail_deductible} />
            {entry.property.replacement_cost != null && (
              <Field label="Valuation" value={entry.property.replacement_cost ? 'Replacement Cost' : 'Actual Cash Value'} />
            )}
            <Field label="Year Built" value={entry.property.year_built} />
            <Field label="Square Footage" value={entry.property.square_footage != null ? entry.property.square_footage.toLocaleString() : null} />
            <Field label="Construction" value={entry.property.construction_type} />
            <Field label="Roof" value={[entry.property.roof_type, entry.property.roof_year].filter(Boolean).join(' · ')} />
          </dl>
        </div>
      )}

      {Array.isArray(entry.vehicles) && entry.vehicles.length > 0 && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-1">Vehicles</dt>
          <ul className="space-y-1.5">
            {entry.vehicles.map((v, i) => (
              <li key={i} className="text-sm text-gray-900">
                <span className="font-medium">{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}</span>
                {v.vin && <span className="text-gray-400 font-normal"> · VIN {v.vin}</span>}
                {(v.lienholder || v.finance_type || v.primary_use || v.annual_mileage != null) && (
                  <div className="text-xs text-gray-500">
                    {[
                      v.finance_type,
                      v.lienholder && `Lienholder: ${v.lienholder}`,
                      v.primary_use,
                      v.annual_mileage != null && `${v.annual_mileage.toLocaleString()} mi/yr`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(entry.drivers) && entry.drivers.length > 0 && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-1">Drivers</dt>
          <ul className="space-y-1">
            {entry.drivers.map((d, i) => (
              <li key={i} className="text-sm font-medium text-gray-900">
                {d.name || 'Driver'}
                {d.date_of_birth && <span className="text-gray-400 font-normal"> · DOB {d.date_of_birth}</span>}
                {d.relationship && <span className="text-gray-400 font-normal"> · {d.relationship}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(entry.coverages) && entry.coverages.length > 0 && (
        <div className="mt-4">
          <dt className="text-gray-500 text-sm mb-2">Coverages</dt>
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {entry.coverages.map((c, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-700">
                      {c.type || '-'}
                      {c.applies_to && <span className="block text-xs text-gray-400">{c.applies_to}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-900 font-medium text-right">{c.limit || '-'}</td>
                    <td className="px-3 py-2 text-gray-500 text-right whitespace-nowrap">
                      {c.deductible ? `${c.deductible} ded.` : ''}
                      {c.premium != null && <span className="block text-xs text-gray-400">{fmtMoney(c.premium)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {entry.notes && <p className="mt-4 text-sm text-gray-500 italic">{entry.notes}</p>}
    </div>
  );
}

export default function LeadDeclarationCard({ lead }) {
  const status = lead.declaration_parse_status;
  const hasPath = !!lead.declaration_pdf_path;

  // declaration_data is an array of entries; tolerate a legacy single object.
  const raw = lead.declaration_data;
  const declarations = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // Nothing uploaded — don't render the card at all.
  if (!status && !hasPath && declarations.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary-500" />
        {declarations.length > 1 ? 'Declarations Pages' : 'Declarations Page'}
      </h2>

      {status === 'failed' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            A document couldn&apos;t be read automatically. The original is on file — open it to review manually.
          </p>
        </div>
      )}

      {status === 'pending' && declarations.length === 0 && (
        <p className="text-sm text-gray-500">Document uploaded — extraction in progress.</p>
      )}

      {declarations.length > 0 && (
        <div className="divide-y divide-gray-200 [&>*]:py-5 first:[&>*]:pt-0 last:[&>*]:pb-0">
          {declarations.map((entry, i) => (
            <DeclarationEntry key={entry.pdf_path || i} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
