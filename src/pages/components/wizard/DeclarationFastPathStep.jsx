// src/pages/components/wizard/DeclarationFastPathStep.jsx
// Early funnel fast-path (right after ZIP): the lead uploads their current
// declarations page(s) instead of answering the manual questionnaire. We read
// premium/coverages/vehicles/mortgage from the document(s) and then only need
// contact + consent. Supports multiple uploads (e.g. one auto + one home).
import { T } from '../../../components/SiteCopy';
import { useRef, useCallback } from 'react';
import { FileText, UploadCloud, CheckCircle, Loader2, Plus, ArrowRight } from 'lucide-react';
import { SESSION_KEYS } from '../../../hooks/useWizard';
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

// The partial lead is created when leaving the ZIP step; it may still be in
// flight when this step renders, so poll sessionStorage briefly for its id.
function makeLeadIdResolver() {
  return async () => {
    for (let i = 0; i < 12; i++) {
      const id = sessionStorage.getItem(SESSION_KEYS.LEAD_ID);
      if (id) return id;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  };
}

export default function DeclarationFastPathStep({ onContinue, onSkip }) {
  const inputRef = useRef(null);
  const resolveLeadId = useRef(makeLeadIdResolver()).current;
  const { items, status, error, pendingName, upload } = useDeclarationUploads(resolveLeadId);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    trackEvent('declaration_upload_started', { page: 'wizard_fastpath' });
    const result = await upload(file);
    trackEvent(result ? 'declaration_upload_parsed' : 'declaration_upload_failed', {
      page: 'wizard_fastpath',
    });
    if (inputRef.current) inputRef.current.value = '';
  }, [upload]);

  const hasItems = items.length > 0;
  const working = status === 'working';

  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
        <FileText className="w-7 h-7 text-white" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 leading-tight">
        <T k="pages.components.wizard.declarationfastpathstep.ad0dfc">Skip the Questions — Upload Your Policy</T>
      </h2>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        <T k="pages.components.wizard.declarationfastpathstep.60a29f">Have your current declarations page? Upload it (PDF preferred — a clear photo works too) and we'll read your coverage, premium, and vehicles automatically. Bundling? Add your auto</T> <span className="font-medium"><T k="pages.components.wizard.declarationfastpathstep.be5d5d">and</T></span> <T k="pages.components.wizard.declarationfastpathstep.17cd1d">home dec pages.</T>
      </p>

      {/* Uploaded so far */}
      {hasItems && (
        <div className="mb-4 space-y-2 text-left">
          {items.map((d, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success-50 border border-success-200">
              <CheckCircle className="w-4 h-4 text-success-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900">{declarationLabel(d)}</span>
              <span className="text-xs text-gray-500"><T k="pages.components.wizard.declarationfastpathstep.2f7765">captured</T></span>
            </div>
          ))}
        </div>
      )}

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
        disabled={working}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary-300 bg-white px-6 py-4 font-semibold text-primary-700 transition-all duration-200 hover:border-primary-500 hover:bg-primary-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {working ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span><T k="pages.components.wizard.declarationfastpathstep.26fccd">Reading</T> {pendingName ? `"${pendingName}"` : <T k="pages.components.wizard.declarationfastpathstep.2dd31f">{'Your Document'}</T>}…</span>
          </>
        ) : hasItems ? (
          <>
            <Plus className="w-5 h-5" />
            <span><T k="pages.components.wizard.declarationfastpathstep.e4e33d">Add Another Dec Page</T></span>
          </>
        ) : (
          <>
            <UploadCloud className="w-5 h-5" />
            <span>{status === 'error' ? <T k="pages.components.wizard.declarationfastpathstep.4fb7e2">{'Try Another File'}</T> : <T k="pages.components.wizard.declarationfastpathstep.bb23c3">{'Upload Declarations Page'}</T>}</span>
          </>
        )}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Continue (only once something is uploaded) */}
      {hasItems && !working && (
        <button
          type="button"
          onClick={() => onContinue(items)}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 px-6 py-4 font-black text-white text-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <T k="pages.components.wizard.declarationfastpathstep.a0bfb8">Continue</T>
          <ArrowRight className="w-5 h-5" />
        </button>
      )}

      {/* Skip to the manual questionnaire */}
      <button
        type="button"
        onClick={onSkip}
        disabled={working}
        className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800 bg-transparent border-0 cursor-pointer disabled:opacity-40"
      >
        <T k="pages.components.wizard.declarationfastpathstep.ebdca9">I don't have it — answer a few questions instead</T>
      </button>
    </div>
  );
}
