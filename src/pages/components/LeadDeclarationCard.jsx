// src/pages/components/LeadDeclarationCard.jsx
// Renders the data extracted from a lead's uploaded declarations page, plus a
// link to view the original document. Read-only; values may be imperfect, so the
// confidence flag and a "view original" link let the agent verify against source.
import { useState } from 'react';
import { FileText, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const POLICY_TYPE_LABELS = {
  auto: 'Auto', home: 'Home', renters: 'Renters',
  condo: 'Condo', umbrella: 'Umbrella', other: 'Other',
};

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-gray-500 text-sm">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export default function LeadDeclarationCard({ lead }) {
  const [opening, setOpening] = useState(false);
  const [linkError, setLinkError] = useState(null);

  const status = lead.declaration_parse_status;
  const data = lead.declaration_data;
  const hasPdf = !!lead.declaration_pdf_path;

  // Nothing uploaded — don't render the card at all.
  if (!status && !hasPdf) return null;

  const openOriginal = async () => {
    setLinkError(null);
    setOpening(true);
    try {
      const { data: signed, error } = await supabase.storage
        .from('lead-declarations')
        .createSignedUrl(lead.declaration_pdf_path, 120);
      if (error || !signed?.signedUrl) throw error || new Error('No URL');
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setLinkError('Could not open the document. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  const fmtMoney = (n) =>
    typeof n === 'number' ? `$${n.toLocaleString()}` : n;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-500" />
          Declarations Page
        </h2>
        {hasPdf && (
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

      {status === 'failed' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            We couldn&apos;t read this document automatically. The original is on file — open it above to review manually.
          </p>
        </div>
      )}

      {status === 'pending' && (
        <p className="text-sm text-gray-500">Document uploaded — extraction in progress.</p>
      )}

      {status === 'parsed' && data && (
        <>
          {data.confidence && (
            <div className="mb-4">
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${CONFIDENCE_STYLES[data.confidence] || 'bg-gray-100 text-gray-600'}`}>
                {data.confidence === 'low' ? 'Low confidence — verify against original' : `Extraction confidence: ${data.confidence}`}
              </span>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4">
            <Field label="Policy Type" value={POLICY_TYPE_LABELS[data.policy_type] || data.policy_type} />
            <Field label="Insurer" value={data.insurer} />
            <Field label="Policy Number" value={data.policy_number} />
            <Field label="Named Insured" value={data.named_insured} />
            <Field label="Effective Date" value={data.effective_date} />
            <Field label="Expiration / Renewal" value={data.expiration_date} />
            <Field label="Annual Premium" value={fmtMoney(data.annual_premium)} />
            <Field label="Mailing Address" value={data.mailing_address} />
          </dl>

          {Array.isArray(data.vehicles) && data.vehicles.length > 0 && (
            <div className="mt-4">
              <dt className="text-gray-500 text-sm mb-1">Vehicles</dt>
              <ul className="space-y-1">
                {data.vehicles.map((v, i) => (
                  <li key={i} className="text-sm font-medium text-gray-900">
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                    {v.vin && <span className="text-gray-400 font-normal"> · VIN {v.vin}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(data.drivers) && data.drivers.length > 0 && (
            <div className="mt-4">
              <dt className="text-gray-500 text-sm mb-1">Drivers</dt>
              <ul className="space-y-1">
                {data.drivers.map((d, i) => (
                  <li key={i} className="text-sm font-medium text-gray-900">
                    {d.name || 'Driver'}
                    {d.date_of_birth && <span className="text-gray-400 font-normal"> · DOB {d.date_of_birth}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(data.coverages) && data.coverages.length > 0 && (
            <div className="mt-4">
              <dt className="text-gray-500 text-sm mb-2">Coverages</dt>
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.coverages.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-700">{c.type || '-'}</td>
                        <td className="px-3 py-2 text-gray-900 font-medium text-right">{c.limit || '-'}</td>
                        <td className="px-3 py-2 text-gray-500 text-right">{c.deductible ? `${c.deductible} ded.` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.notes && (
            <p className="mt-4 text-sm text-gray-500 italic">{data.notes}</p>
          )}
        </>
      )}
    </div>
  );
}
