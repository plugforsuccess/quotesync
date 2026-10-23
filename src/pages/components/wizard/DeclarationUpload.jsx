// src/pages/components/wizard/DeclarationUpload.jsx
// Optional post-submit enrichment on the confirmation step: the lead can attach
// their current declarations page(s) — PDF preferred — and Claude extracts the
// policy details onto the lead. Supports multiple (e.g. auto + home). The lead
// already exists here, so a slow or failed parse can never cost the lead.
import { useRef } from 'react';
import { FileText, UploadCloud, CheckCircle, Loader2, Plus } from 'lucide-react';
import { useDeclarationUploads } from '../../../hooks/useDeclarationUploads';
import { trackEvent } from '../../../lib/analytics';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';

const POLICY_LABEL = {
  auto: 'Auto', home: 'Home', renters: 'Renters',
  condo: 'Condo', landlord: 'Landlord', umbrella: 'Umbrella', other: 'Policy',
};

function declarationLabel(d) {
  const type = POLICY_LABEL[d?.policy_type] || 'Policy';
  return d?.insurer ? `${type} — ${d.insurer}` : type;
}

export default function DeclarationUpload({ leadId, agentName }) {
  const inputRef = useRef(null);
  const { items, status, error, pendingName, upload } = useDeclarationUploads(leadId);

  // Without a lead id we have nothing to attach the upload to.
  if (!leadId) return null;

  const handleFile = async (file) => {
    if (!file) return;
    trackEvent('declaration_upload_started', { page: 'wizard_confirmation' });
    const result = await upload(file);
    trackEvent(result ? 'declaration_upload_parsed' : 'declaration_upload_failed', {
      page: 'wizard_confirmation',
    });
    if (inputRef.current) inputRef.current.value = '';
  };

  const hasItems = items.length > 0;

  return (
    <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-primary-500" />
        <h3 className="font-bold text-gray-900">
          {hasItems ? 'Add another policy?' : 'Have your current policy handy?'}
        </h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        {hasItems
          ? `Upload another declarations page if you have one (e.g. your ${items.some(i => i.policy_type === 'auto') ? 'home' : 'auto'} policy).`
          : `Upload your declarations page (PDF preferred — a clear photo works too) and we'll read your current coverage and premium automatically, so ${agentName || 'your agent'} can build an apples-to-apples comparison.`}
      </p>

      {/* Uploaded so far */}
      {items.map((d, i) => (
        <div key={i} className="flex items-center gap-2 mb-2 text-sm">
          <CheckCircle className="w-4 h-4 text-success-600 flex-shrink-0" />
          <span className="font-medium text-gray-900">{declarationLabel(d)}</span>
          <span className="text-gray-400">captured</span>
        </div>
      ))}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'working'}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary-300 bg-white px-6 py-3.5 font-semibold text-primary-700 transition-all duration-200 hover:border-primary-500 hover:bg-primary-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {status === 'working' ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Reading {pendingName ? `"${pendingName}"` : 'your document'}…</span>
          </>
        ) : hasItems ? (
          <>
            <Plus className="w-5 h-5" />
            <span>Add another dec page</span>
          </>
        ) : (
          <>
            <UploadCloud className="w-5 h-5" />
            <span>{status === 'error' ? 'Try another file' : 'Choose file'}</span>
          </>
        )}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-3 text-center text-xs text-gray-400">
        Optional. Your documents are stored securely and only seen by your agent.
      </p>
    </div>
  );
}
