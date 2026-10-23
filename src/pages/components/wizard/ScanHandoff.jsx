// src/pages/components/wizard/ScanHandoff.jsx
// The wizard's dec-page uploads go through the Rate Check scanner (/): one reader,
// one inbox. These send the person there with what they've already answered, so
// the scan lands as a rate check (quote cards, household, partner credit) on the
// same lead instead of a second, separate parse.
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowRight } from 'lucide-react';
import { handOffToScanner } from '../../../lib/rateCheckApi';
import { trackEvent } from '../../../lib/analytics';

const housingFrom = (ownsHome) => (ownsHome === true ? 'own' : ownsHome === false ? 'rent' : '');

function useScanHandoff(page) {
  const navigate = useNavigate();
  return (answers = {}) => {
    handOffToScanner({
      firstName: answers.firstName || '', phone: answers.phone || '', email: answers.email || '',
      zip: answers.zip || '', housing: housingFrom(answers.ownsHome),
    });
    trackEvent('declaration_handoff_to_scanner', { page });
    navigate('/');
  };
}

/** Early fast path (right after ZIP): scan the dec page instead of answering questions. */
export function ScanFastPathStep({ answers, onSkip }) {
  const scan = useScanHandoff('wizard_fastpath');
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
        <Camera className="w-7 h-7 text-white" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 leading-tight">
        Skip the questions — scan your policy
      </h2>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Snap the first page of each policy (car, home, renters). We read your coverage and price,
        and Cam texts you only if Allstate can beat it.
      </p>
      <button
        type="button"
        onClick={() => scan(answers)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 px-6 py-4 font-black text-white text-lg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        Scan my dec page
        <ArrowRight className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800 bg-transparent border-0 cursor-pointer"
      >
        I don&apos;t have it — answer a few questions instead
      </button>
    </div>
  );
}

/** On the confirmation screen: add a dec page now so Cam can quote it exactly. */
export function ScanHandoffCard({ answers, agentName }) {
  const scan = useScanHandoff('wizard_confirmation');
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="font-bold text-gray-900 mb-1">Have your declarations page?</h3>
      <p className="text-sm text-gray-500 mb-4">
        Scan it and {agentName || 'your agent'} can quote your exact coverage instead of an estimate.
      </p>
      <button
        type="button"
        onClick={() => scan(answers)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary-300 bg-white px-6 py-3 font-semibold text-primary-700 transition-colors hover:border-primary-500 hover:bg-primary-50"
      >
        <Camera className="w-5 h-5" />
        Scan my dec page
      </button>
    </div>
  );
}
