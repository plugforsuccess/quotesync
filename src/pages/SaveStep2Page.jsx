// src/pages/SaveStep2Page.jsx — Funnel Step 2: Contact Capture
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { trackFunnelStep, trackLeadSubmission, trackGoogleAdsConversion } from '../lib/analytics';
import { formatPhoneInput, toE164, isValidPhone } from '../utils/phoneFormat';

const SESSION_KEYS = {
  LEAD_ID: 'qs_funnel_lead_id',
  ZIP: 'qs_funnel_zip',
  OWNS_HOME: 'qs_funnel_owns_home',
  VEHICLE_COUNT: 'qs_funnel_vehicle_count',
  UTM: 'qs_funnel_utm',
  PRODUCT_INTENT: 'qs_funnel_product_intent',
  AUTO_DRIVING_RECORD: 'qs_funnel_auto_driving_record',
  HOME_CLAIMS_HISTORY: 'qs_funnel_home_claims_history',
  CURRENT_AUTO_CARRIER: 'qs_funnel_current_auto_carrier',
  CURRENT_HOME_CARRIER: 'qs_funnel_current_home_carrier',
};

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lead`
  : '/functions/v1/create-lead';

// TCPA consent version — increment when disclaimer text changes
const TCPA_CONSENT_VERSION = 'v1.0-2026-03';

const getSavingsEstimate = (ownsHome, vehicleCount, productIntent) => {
  if (productIntent === 'bundle' || (ownsHome && productIntent !== 'auto' && productIntent !== 'home')) {
    if (vehicleCount >= 2) {
      return { range: '$400 – $1,200/year', message: 'Bundle savings available! Most homeowners with 2+ cars save big.' };
    }
    return { range: '$300 – $800/year', message: 'Homeowners qualify for exclusive bundle discounts.' };
  }
  if (productIntent === 'home') {
    return { range: '$200 – $500/year', message: 'Homeowner savings are waiting for you.' };
  }
  if (vehicleCount >= 2) {
    return { range: '$200 – $600/year', message: 'Multi-car discounts add up fast.' };
  }
  return { range: '$150 – $500/year', message: 'Let\'s find you a better rate.' };
};

/**
 * Compute a simplified lead score for manual form leads
 */
const computeManualLeadScore = (ownsHome, vehicleCount, zip, utmParams, productIntent, riskData) => {
  let score = 0;

  if (ownsHome) score += 30;
  if (vehicleCount >= 2) score += 20;
  if (vehicleCount >= 3) score += 10;
  if (zip) score += 15;

  // Product intent scoring
  if (productIntent === 'bundle') score += 20;
  else if (productIntent === 'auto' || productIntent === 'home') score += 10;
  // 'unsure' gets no bonus

  // Risk screening scoring
  if (riskData?.autoDrivingRecord === 'clean') score += 15;
  else if (riskData?.autoDrivingRecord === '1-2') score += 5;
  else if (riskData?.autoDrivingRecord === '3+') score -= 20;

  if (riskData?.homeClaimsHistory === '0-1') score += 10;
  else if (riskData?.homeClaimsHistory === '2+') score -= 15;

  // Carrier scoring — Allstate conflict reduces score
  if (riskData?.currentAutoCarrier === 'allstate') score -= 10;
  if (riskData?.currentHomeCarrier === 'allstate') score -= 10;

  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 17) score += 10;
  if (utmParams?.utm_campaign) score += 5;

  return Math.max(0, Math.min(score, 100));
};

export default function SaveStep2Page() {
  const navigate = useNavigate();

  // Load Step 1 data from sessionStorage
  const [step1Data] = useState(() => {
    const zip = sessionStorage.getItem(SESSION_KEYS.ZIP);
    if (!zip) return null;

    return {
      leadId: sessionStorage.getItem(SESSION_KEYS.LEAD_ID),
      zip,
      ownsHome: JSON.parse(sessionStorage.getItem(SESSION_KEYS.OWNS_HOME) || 'false'),
      vehicleCount: parseInt(sessionStorage.getItem(SESSION_KEYS.VEHICLE_COUNT) || '1', 10),
      utm: JSON.parse(sessionStorage.getItem(SESSION_KEYS.UTM) || '{}'),
      productIntent: sessionStorage.getItem(SESSION_KEYS.PRODUCT_INTENT) || null,
      autoDrivingRecord: JSON.parse(sessionStorage.getItem(SESSION_KEYS.AUTO_DRIVING_RECORD) || 'null'),
      homeClaimsHistory: JSON.parse(sessionStorage.getItem(SESSION_KEYS.HOME_CLAIMS_HISTORY) || 'null'),
      currentAutoCarrier: JSON.parse(sessionStorage.getItem(SESSION_KEYS.CURRENT_AUTO_CARRIER) || 'null'),
      currentHomeCarrier: JSON.parse(sessionStorage.getItem(SESSION_KEYS.CURRENT_HOME_CARRIER) || 'null'),
    };
  });

  // F-09: Guard — redirect to /save if no Step 1 data in sessionStorage
  useEffect(() => {
    if (!step1Data) {
      navigate('/save', { replace: true });
    }
  }, [step1Data, navigate]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // F-12: Error state for submission failures
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    document.title = 'Your Savings Estimate | Insured By Cam';
  }, []);

  if (!step1Data) return null;

  const savings = getSavingsEstimate(step1Data.ownsHome, step1Data.vehicleCount, step1Data.productIntent);

  const validate = () => {
    const newErrors = {};

    if (!firstName.trim() || firstName.trim().length < 2) {
      newErrors.firstName = 'Please enter your first name.';
    } else if (!/^[a-zA-Z\s'-]+$/.test(firstName.trim())) {
      newErrors.firstName = 'Please enter a valid name.';
    }

    if (!lastName.trim() || lastName.trim().length < 2) {
      newErrors.lastName = 'Please enter your last name.';
    } else if (!/^[a-zA-Z\s'-]+$/.test(lastName.trim())) {
      newErrors.lastName = 'Please enter a valid name.';
    }

    if (!phone || !isValidPhone(phone)) {
      newErrors.phone = 'Please enter a valid 10-digit phone number.';
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const phoneE164 = toE164(phone);
      const leadScore = computeManualLeadScore(
        step1Data.ownsHome,
        step1Data.vehicleCount,
        step1Data.zip,
        step1Data.utm,
        step1Data.productIntent,
        {
          autoDrivingRecord: step1Data.autoDrivingRecord,
          homeClaimsHistory: step1Data.homeClaimsHistory,
          currentAutoCarrier: step1Data.currentAutoCarrier,
          currentHomeCarrier: step1Data.currentHomeCarrier,
        }
      );

      // F-02 fix: Single write path through the Edge Function only.
      // The Edge Function handles dedup via session_id — it will find and
      // update the partial lead from Step 1 instead of creating a duplicate.
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phoneE164,
          email: email.trim(),
          zip: step1Data.zip,
          state: 'GA',
          owns_home: step1Data.ownsHome,
          vehicle_count: step1Data.vehicleCount,
          product_intent: step1Data.productIntent,
          auto_driving_record: step1Data.autoDrivingRecord,
          home_claims_history: step1Data.homeClaimsHistory,
          current_auto_carrier: step1Data.currentAutoCarrier,
          current_home_carrier: step1Data.currentHomeCarrier,
          source: 'funnel',
          lead_score: leadScore,
          session_id: sessionStorage.getItem('insuredbycam_session_id'),
          landing_page: '/save',
          // F-04: TCPA consent metadata
          consent_given_at: new Date().toISOString(),
          consent_version: TCPA_CONSENT_VERSION,
          consent_user_agent: navigator.userAgent,
          // UTM params (sanitized server-side via F-05)
          ...step1Data.utm,
        }),
      });

      // F-12: Check for actual success before navigating
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error (${response.status})`);
      }

      // Fire analytics events
      trackFunnelStep(2, {
        has_phone: true,
        owns_home: step1Data.ownsHome,
        vehicle_count: step1Data.vehicleCount,
      });
      trackLeadSubmission({
        source: 'funnel',
        owns_home: step1Data.ownsHome,
        vehicle_count: step1Data.vehicleCount,
        product_intent: step1Data.productIntent,
        auto_driving_record: step1Data.autoDrivingRecord,
        home_claims_history: step1Data.homeClaimsHistory,
        current_auto_carrier: step1Data.currentAutoCarrier,
        current_home_carrier: step1Data.currentHomeCarrier,
      });
      // F-11: Conversion label read from env var (set VITE_GADS_CONVERSION_LABEL in .env)
      const conversionLabel = import.meta.env.VITE_GADS_CONVERSION_LABEL;
      if (conversionLabel) {
        trackGoogleAdsConversion(conversionLabel, 60);
      }

      // Clear sessionStorage
      Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));

      navigate('/save/confirmation');
    } catch (err) {
      console.error('Step 2 submission error:', err);
      // F-12: Show error UI instead of silently navigating to success
      setSubmitError(
        'Something went wrong submitting your quote request. Please try again, or call us directly.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-600 via-primary-900 to-secondary-900 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>

      <div className="container mx-auto px-4 py-12 sm:py-16 relative z-10">
        <div className="max-w-lg mx-auto">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-sm text-white/70 mb-2">
              <span className="font-semibold">Step 2 of 2</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-accent-400 to-accent-500 rounded-full transition-all duration-500"></div>
            </div>
          </div>

          {/* Savings Estimate Card */}
          <div className="relative mb-8">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-success-400 to-success-600 rounded-2xl opacity-50 blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-xl p-6 text-center">
              <p className="text-lg font-bold text-gray-800 mb-2">
                Great news!
              </p>
              <p className="text-gray-600 mb-4">
                Based on your info, {step1Data.ownsHome ? 'homeowners' : 'renters'} in{' '}
                <span className="font-semibold text-gray-900">{step1Data.zip}</span> with{' '}
                <span className="font-semibold text-gray-900">
                  {step1Data.vehicleCount}{step1Data.vehicleCount >= 4 ? '+' : ''} vehicle{step1Data.vehicleCount !== 1 ? 's' : ''}
                </span>{' '}
                typically save:
              </p>
              <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-success-600 to-success-700 bg-clip-text text-transparent mb-3">
                {savings.range}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-success-700 bg-success-50 rounded-lg px-4 py-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">{savings.message}</span>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Where should we send your personalized quote?
            </h2>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 rounded-2xl opacity-75 blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
              {/* F-12: Error banner */}
              {submitError && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 font-medium">{submitError}</p>
                    <button
                      onClick={() => setSubmitError(null)}
                      className="text-sm text-red-600 underline mt-1 bg-transparent border-0 cursor-pointer p-0"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* First Name */}
                <div>
                  <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: null }));
                    }}
                    placeholder="Your first name"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
                      errors.firstName
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-200 focus:border-primary-500'
                    }`}
                    autoFocus
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
                  )}
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: null }));
                    }}
                    placeholder="Your last name"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
                      errors.lastName
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-200 focus:border-primary-500'
                    }`}
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(formatPhoneInput(e.target.value));
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: null }));
                    }}
                    placeholder="(555) 123-4567"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
                      errors.phone
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-200 focus:border-primary-500'
                    }`}
                    maxLength={14}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: null }));
                    }}
                    placeholder="you@example.com"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-base text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
                      errors.email
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-200 focus:border-primary-500'
                    }`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative w-full inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 animate-gradient-x"></div>
                  <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 px-8 py-4 rounded-xl transition-all duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                    <span className="relative z-10 text-white font-black text-lg">
                      {isSubmitting ? 'Submitting...' : 'Get My Free Quote'}
                    </span>
                    {!isSubmitting && (
                      <ArrowRight className="relative z-10 w-5 h-5 text-white transition-transform duration-300 group-hover:translate-x-1" />
                    )}
                  </div>
                </button>

                {/* TCPA Consent Disclaimer */}
                <p className="text-xs text-gray-500 leading-relaxed">
                  By clicking &apos;Get My Free Quote&apos;, you agree to be contacted by Insured By
                  Cam regarding insurance quotes via phone, SMS, and email at the number provided,
                  including through automated technology. Consent is not a condition of purchase. Msg
                  &amp; data rates may apply. Reply STOP to opt out at any time.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
