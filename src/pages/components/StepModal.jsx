// src/pages/components/StepModal.jsx
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const StepModal = ({ step, onClose, stepDetails, setModalStep }) => {
  if (!step || !stepDetails[step]) return null;
  const detail = stepDetails[step];

  const contentRef = useRef(null);

  // ESC key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  // 🔝 Whenever the step changes, jump scroll to top of content
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'auto' }); // use 'smooth' if you want animation
    }
  }, [step]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/95 via-primary-900/85 to-secondary-900/95 backdrop-blur-xl animate-fadeIn" />

      {/* Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-primary-500/30 to-secondary-500/30 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-br from-secondary-500/30 to-primary-400/30 rounded-full blur-3xl animate-float-delayed" />

      {/* Modal */}
      <div
        className="relative bg-white/95 backdrop-blur-2xl rounded-t-2xl sm:rounded-3xl shadow-2xl sm:max-w-xl w-full max-h-[90vh] flex flex-col border border-white/20 overflow-hidden animate-scaleSpring p-5 sm:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient Glow */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 opacity-20 blur-xl -z-10" />

        {/* HEADER */}
        <div className="top-0 bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 text-white p-6 rounded-t-3xl flex items-start justify-between relative z-10">
          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />

          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center font-bold text-xl shadow-lg ring-2 ring-white/30">
              {step}
            </div>
            <div>
              <h3
                id="modal-title"
                className="text-2xl font-black tracking-tight leading-snug"
              >
                {detail.title}
              </h3>
              <p className="text-indigo-100 text-sm mt-1">Step {step} of 7</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="relative z-10 text-white/80 hover:text-white transition-all duration-300 p-2 hover:bg-white/20 rounded-full backdrop-blur-sm group"
            aria-label="Close modal"
          >
            <X className="w-6 h-6 transition-transform group-hover:rotate-90 duration-300" />
          </button>
        </div>

        {/* CONTENT */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar"
        >
          <div className="p-6 space-y-6">
            <div className="bg-gradient-to-br from-primary-50 to-indigo-50 rounded-2xl p-5 border border-indigo-100 shadow-sm">
              <p className="text-gray-700 leading-relaxed">{detail.description}</p>
            </div>

            {/* Screens */}
            <div className="bg-white rounded-2xl overflow-hidden flex items-center justify-center p-4 shadow-inner border border-gray-100">
              {step === 1 && (
                <img
                  src="/screenshots/canopy-step1-select-provider.webp"
                  alt="Step 1"
                  className="w-full max-w-xs h-auto object-cover rounded-lg shadow-md"
                />
              )}

              {step === 2 && (
                <img
                  src="/screenshots/canopy-step2-login.webp"
                  alt="Step 2"
                  className="w-full max-w-xs h-auto object-cover rounded-lg shadow-md"
                />
              )}

              {step === 3 && (
                <div className="aspect-[9/16] flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-secondary-500 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <span className="text-3xl">📱</span>
                    </div>
                    <p className="text-gray-700 font-semibold text-lg">
                      Verification Code Screen
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      You'll receive a code via text or email
                    </p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <img
                  src="/screenshots/canopy-step3-loading-policy.webp"
                  alt="Step 4"
                  className="w-full max-w-xs h-auto object-cover rounded-lg shadow-md"
                />
              )}

              {step === 5 && (
                <div className="aspect-[9/16] flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-secondary-500 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <span className="text-3xl">✓</span>
                    </div>
                    <p className="text-gray-700 font-semibold text-lg">
                      Contact Information
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Verify your contact details
                    </p>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="aspect-[9/16] flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-secondary-500 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <span className="text-3xl">👥</span>
                    </div>
                    <p className="text-gray-700 font-semibold text-lg">Add Drivers</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Confirm all drivers on your policy
                    </p>
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="aspect-[9/16] flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                      <span className="text-3xl">🎉</span>
                    </div>
                    <p className="text-gray-700 font-semibold text-lg">All Done!</p>
                    <p className="text-sm text-gray-500 mt-2">Your quote is on the way</p>
                  </div>
                </div>
              )}
            </div>

            {/* TIPS */}
            {detail.tips?.length > 0 && (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-2xl p-5 shadow-sm">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-xl">💡</span> Pro Tips
                </h4>
                <ul className="space-y-2">
                  {detail.tips.map((tip, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <span className="text-yellow-600 font-bold mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="border-t border-gray-200 p-6 flex justify-between items-center bg-gradient-to-r from-gray-50 to-gray-100 rounded-b-3xl">
          <button
            onClick={() => step > 1 && setModalStep(step - 1)}
            disabled={step === 1}
            className={`px-6 py-3 font-semibold rounded-xl transition-all shadow-md ${
              step === 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white hover:shadow-lg hover:shadow-primary-500/30 transform hover:scale-105 active:scale-95'
            }`}
          >
            ← Previous
          </button>

          <button
            onClick={() => step < 7 && setModalStep(step + 1)}
            disabled={step === 7}
            className={`px-6 py-3 font-semibold rounded-xl transition-all shadow-md ${
              step === 7
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white hover:shadow-lg hover:shadow-primary-500/30 transform hover:scale-105 active:scale-95'
            }`}
          >
            Next →
          </button>
        </div>

        <div className="h-1 bg-gradient-to-r from-primary-600 via-secondary-600 to-accent-600" />
      </div>

      {/* STYLES */}
      <style>{`
        /* Scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width:10px; }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: linear-gradient(to bottom,#f1f5f9,#e2e8f0);
          border-radius:10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom,#2563eb,#14b8a6);
          border-radius:10px;
          border:2px solid #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom,#1d4ed8,#0d9488);
        }
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #2563eb #f1f5f9;
        }
      `}</style>
    </div>
  );
};

export default StepModal;
