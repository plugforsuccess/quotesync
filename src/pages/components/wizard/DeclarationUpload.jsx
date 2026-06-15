// src/pages/components/wizard/DeclarationUpload.jsx
// Optional post-submit enrichment: the lead uploads their current declarations
// page (PDF preferred) and Claude extracts the policy details onto the lead.
// Rendered on the confirmation step, so the lead already exists — a slow or
// failed parse can never cost the lead.
import { useRef, useState } from 'react';
import { FileText, UploadCloud, CheckCircle, Loader2 } from 'lucide-react';
import { uploadDeclarationPdf } from '../../../lib/leadsApi';
import { trackEvent } from '../../../lib/analytics';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';

export default function DeclarationUpload({ leadId, agentName }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

  // Without a lead id we have nothing to attach the upload to.
  if (!leadId) return null;

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setStatus('working');
    trackEvent('declaration_upload_started', { page: 'wizard_confirmation' });

    try {
      await uploadDeclarationPdf({ leadId, file });
      setStatus('done');
      trackEvent('declaration_upload_parsed', { page: 'wizard_confirmation' });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStatus('error');
      trackEvent('declaration_upload_failed', { page: 'wizard_confirmation' });
    }
  };

  if (status === 'done') {
    return (
      <div className="bg-success-50 border border-success-200 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-gray-900">Got your declarations page!</h3>
            <p className="text-sm text-gray-600">
              {agentName || 'Your agent'} will have your current coverage details ready before the call.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-primary-500" />
        <h3 className="font-bold text-gray-900">
          Have your current policy handy? Upload your dec page.
        </h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Upload your declarations page (PDF preferred — a clear photo works too) and we&apos;ll
        read your current coverage and premium automatically, so {agentName || 'your agent'} can
        build an apples-to-apples comparison.
      </p>

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
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary-300 bg-white px-6 py-4 font-semibold text-primary-700 transition-all duration-200 hover:border-primary-500 hover:bg-primary-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {status === 'working' ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Reading {fileName ? `"${fileName}"` : 'your document'}…</span>
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
        Optional. Your document is stored securely and only seen by your agent.
      </p>
    </div>
  );
}
