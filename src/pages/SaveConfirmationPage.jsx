// src/pages/SaveConfirmationPage.jsx — Funnel Step 3: Confirmation + Canopy Upsell
import { useEffect } from 'react';
import { CheckCircle, Zap, Shield, Clock, ArrowRight, Star } from 'lucide-react';
import { trackFunnelStep, trackEvent } from '../lib/analytics';
import { useCanopyLauncher } from '../hooks/useCanopyLauncher';
import { useFunnelAgency } from '../hooks/useFunnelAgency';

export default function SaveConfirmationPage() {
  const { launchCanopy } = useCanopyLauncher();
  const { data: funnelAgency } = useFunnelAgency();
  const agentName = funnelAgency?.agent_first_name || 'Your agent';
  const brandName = funnelAgency?.brand_name || 'your insurance agency';

  useEffect(() => {
    document.title = `You're All Set! | ${funnelAgency?.brand_name || 'QuoteSync'}`;

    // F-10 fix: Deduplicate pixel fires — only fire once per funnel completion
    const TRACKED_KEY = 'qs_confirmation_tracked';
    if (!sessionStorage.getItem(TRACKED_KEY)) {
      trackFunnelStep(3);

      // Meta Pixel ViewContent for retargeting pool
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'ViewContent', { content_name: 'Funnel Confirmation' });
      }

      sessionStorage.setItem(TRACKED_KEY, '1');
    }
  }, []);

  const handleCanopyClick = () => {
    trackEvent('canopy_upsell_clicked', { page: 'confirmation' });
    launchCanopy('confirmation');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-600 via-primary-900 to-secondary-900 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>

      <div className="container mx-auto px-4 py-12 sm:py-16 relative z-10">
        <div className="max-w-lg mx-auto">

          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="relative inline-block mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-success-400 to-success-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <div className="absolute top-0 left-1/2 -trangray-x-1/2 w-32 h-32 bg-success-400/20 rounded-full blur-2xl -z-10 animate-pulse"></div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
              You&apos;re All Set! Your Personalized Quote Is Being Prepared.
            </h1>
            <p className="text-lg text-white/80">
              {agentName} will reach out within the next few minutes to walk you through your options.
            </p>
          </div>

          {/* About Agent Card */}
          <div className="relative mb-8">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-2xl opacity-50 blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-3 border-primary-200 shadow-lg flex-shrink-0 bg-primary-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary-600">{agentName.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">About {agentName}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {brandName} — licensed insurance agent who personally reviews every quote.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Canopy Upsell Card */}
          <div className="relative mb-8">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600 rounded-2xl opacity-60 blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-xl p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-accent-500" />
                <h3 className="font-bold text-gray-900 text-lg">
                  Want Your Exact Savings Number — Not Just a Range?
                </h3>
              </div>

              <p className="text-gray-600 mb-5 leading-relaxed">
                Sync your current policy and {agentName} can have your comparison ready before the call.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  { icon: Clock, text: 'Takes 60 seconds' },
                  { icon: Shield, text: 'Bank-level security' },
                  { icon: CheckCircle, text: 'No forms to fill out' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-success-500 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleCanopyClick}
                className="group relative w-full inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 animate-gradient-x"></div>
                <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-accent-500 via-accent-600 to-accent-500 px-8 py-4 rounded-xl transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent trangray-x-[-200%] group-hover:trangray-x-[200%] transition-transform duration-1000"></div>
                  <span className="relative z-10 text-white font-black text-lg">
                    Sync My Policy
                  </span>
                  <ArrowRight className="relative z-10 w-5 h-5 text-white transition-transform duration-300 group-hover:trangray-x-1" />
                </div>
              </button>

              <p className="text-center text-sm text-gray-500 mt-4 font-medium italic">
                &ldquo;9 out of 10 people who sync get a better quote.&rdquo;
              </p>
            </div>
          </div>

          {/* Social Proof */}
          <div className="text-center">
            <p className="text-white/70 text-sm font-medium mb-2">
              Trusted by 500+ families
            </p>
            <div className="flex items-center justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 text-accent-400 fill-accent-400" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
