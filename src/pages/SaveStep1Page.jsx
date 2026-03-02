// src/pages/SaveStep1Page.jsx — Funnel Step 1: Quick Qualifier
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Lock } from 'lucide-react';
import { isTargetZip } from '../config/targetZips';
import { supabase } from '../lib/supabase';
import { trackFunnelStep } from '../lib/analytics';
import { getSessionId, getUtmParams } from '../lib/leadsApi';

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

export default function SaveStep1Page() {
  const navigate = useNavigate();
  const [zipCode, setZipCode] = useState('');
  const [ownsHome, setOwnsHome] = useState(null);
  const [vehicleCount, setVehicleCount] = useState(null);
  const [productIntent, setProductIntent] = useState(null);
  const [autoDrivingRecord, setAutoDrivingRecord] = useState(null);
  const [homeClaimsHistory, setHomeClaimsHistory] = useState(null);
  const [currentAutoCarrier, setCurrentAutoCarrier] = useState(null);
  const [currentHomeCarrier, setCurrentHomeCarrier] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zipError, setZipError] = useState('');
  const [defaultAgencyId, setDefaultAgencyId] = useState(null);

  // Capture UTM params on load
  const [utmParams] = useState(() => getUtmParams());

  useEffect(() => {
    document.title = 'See How Much You Could Save | Insured By Cam';
  }, []);

  // Fetch default agency for partial lead insert
  useEffect(() => {
    supabase
      .from('agencies')
      .select('id')
      .eq('is_default', true)
      .single()
      .then(({ data }) => {
        if (data) setDefaultAgencyId(data.id);
      });
  }, []);

  const handleZipChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
    setZipCode(value);
    setZipError('');
    if (errors.zipCode) {
      setErrors((prev) => ({ ...prev, zipCode: null }));
    }
  };

  const showAutoRisk = productIntent === 'auto' || productIntent === 'bundle';
  const showHomeRisk = productIntent === 'home' || productIntent === 'bundle';

  const validate = () => {
    const newErrors = {};

    if (!zipCode || zipCode.length !== 5) {
      newErrors.zipCode = 'Please enter a valid 5-digit ZIP code.';
    } else if (!isTargetZip(zipCode)) {
      setZipError(
        "We don't serve that area yet — but we're expanding! Check back soon."
      );
      return false;
    }

    if (ownsHome === null) {
      newErrors.ownsHome = 'Please select one.';
    }
    if (!productIntent) {
      newErrors.productIntent = 'Please select one.';
    }
    if (showAutoRisk && !currentAutoCarrier) {
      newErrors.currentAutoCarrier = 'Please select one.';
    }
    if (showHomeRisk && !currentHomeCarrier) {
      newErrors.currentHomeCarrier = 'Please select one.';
    }
    if (showAutoRisk && !autoDrivingRecord) {
      newErrors.autoDrivingRecord = 'Please select one.';
    }
    if (showHomeRisk && homeClaimsHistory === null) {
      newErrors.homeClaimsHistory = 'Please select one.';
    }
    if (vehicleCount === null) {
      newErrors.vehicleCount = 'Please select one.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const sessionId = getSessionId();

      // Insert partial lead into Supabase (only if we have a default agency)
      let leadId = null;
      if (defaultAgencyId) {
        const { data, error } = await supabase.from('leads').insert({
          status: 'partial',
          source: 'funnel',
          agency_id: defaultAgencyId,
          zip: zipCode,
          state: 'GA',
          owns_home: ownsHome,
          vehicle_count: vehicleCount,
          product_intent: productIntent,
          auto_driving_record: autoDrivingRecord || null,
          home_claims_history: homeClaimsHistory || null,
          current_auto_carrier: currentAutoCarrier || null,
          current_home_carrier: currentHomeCarrier || null,
          session_id: sessionId,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          utm_content: utmParams.utm_content,
          utm_term: utmParams.utm_term,
          landing_page: '/save',
        }).select('id').single();

        if (error) {
          console.error('Failed to create partial lead:', error);
        }

        leadId = data?.id || null;
      } else {
        console.warn('No default agency found, skipping partial lead insert');
      }
      sessionStorage.setItem(SESSION_KEYS.LEAD_ID, leadId);
      sessionStorage.setItem(SESSION_KEYS.ZIP, zipCode);
      sessionStorage.setItem(SESSION_KEYS.OWNS_HOME, JSON.stringify(ownsHome));
      sessionStorage.setItem(SESSION_KEYS.VEHICLE_COUNT, String(vehicleCount));
      sessionStorage.setItem(SESSION_KEYS.PRODUCT_INTENT, productIntent);
      sessionStorage.setItem(SESSION_KEYS.AUTO_DRIVING_RECORD, JSON.stringify(autoDrivingRecord));
      sessionStorage.setItem(SESSION_KEYS.HOME_CLAIMS_HISTORY, JSON.stringify(homeClaimsHistory));
      sessionStorage.setItem(SESSION_KEYS.CURRENT_AUTO_CARRIER, JSON.stringify(currentAutoCarrier));
      sessionStorage.setItem(SESSION_KEYS.CURRENT_HOME_CARRIER, JSON.stringify(currentHomeCarrier));
      sessionStorage.setItem(SESSION_KEYS.UTM, JSON.stringify(utmParams));

      // Fire analytics
      trackFunnelStep(1, { zip: zipCode, owns_home: ownsHome, vehicle_count: vehicleCount, product_intent: productIntent, auto_driving_record: autoDrivingRecord, home_claims_history: homeClaimsHistory, current_auto_carrier: currentAutoCarrier, current_home_carrier: currentHomeCarrier });

      navigate('/save/details');
    } catch (err) {
      console.error('Step 1 submission error:', err);
      // Still navigate even if DB insert fails — we can capture on Step 2
      sessionStorage.setItem(SESSION_KEYS.ZIP, zipCode);
      sessionStorage.setItem(SESSION_KEYS.OWNS_HOME, JSON.stringify(ownsHome));
      sessionStorage.setItem(SESSION_KEYS.VEHICLE_COUNT, String(vehicleCount));
      sessionStorage.setItem(SESSION_KEYS.PRODUCT_INTENT, productIntent);
      sessionStorage.setItem(SESSION_KEYS.AUTO_DRIVING_RECORD, JSON.stringify(autoDrivingRecord));
      sessionStorage.setItem(SESSION_KEYS.HOME_CLAIMS_HISTORY, JSON.stringify(homeClaimsHistory));
      sessionStorage.setItem(SESSION_KEYS.CURRENT_AUTO_CARRIER, JSON.stringify(currentAutoCarrier));
      sessionStorage.setItem(SESSION_KEYS.CURRENT_HOME_CARRIER, JSON.stringify(currentHomeCarrier));
      sessionStorage.setItem(SESSION_KEYS.UTM, JSON.stringify(utmParams));
      navigate('/save/details');
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
              <span className="font-semibold">Step 1 of 2</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-gradient-to-r from-accent-400 to-accent-500 rounded-full transition-all duration-500"></div>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
              See How Much You Could Save on Auto + Home Insurance
            </h1>
            <p className="text-lg text-white/80">
              Takes 30 seconds. Zero obligation. Personalized to your ZIP code.
            </p>
          </div>

          {/* Form Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 rounded-2xl opacity-75 blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* ZIP Code */}
                <div>
                  <label htmlFor="zipCode" className="block text-sm font-semibold text-gray-700 mb-2">
                    ZIP Code
                  </label>
                  <input
                    id="zipCode"
                    type="text"
                    inputMode="numeric"
                    value={zipCode}
                    onChange={handleZipChange}
                    placeholder="Enter your ZIP code"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-lg font-medium text-gray-900 placeholder:text-gray-400 bg-white transition-colors focus:outline-none focus:ring-0 ${
                      errors.zipCode || zipError
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-gray-200 focus:border-primary-500'
                    }`}
                    maxLength={5}
                    autoFocus
                  />
                  {errors.zipCode && (
                    <p className="mt-1.5 text-sm text-red-600">{errors.zipCode}</p>
                  )}
                  {zipError && (
                    <p className="mt-1.5 text-sm text-red-600">{zipError}</p>
                  )}
                </div>

                {/* Own or Rent */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Do you own your home?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'I Own', value: true },
                      { label: 'I Rent', value: false },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setOwnsHome(option.value);
                          if (errors.ownsHome) setErrors((prev) => ({ ...prev, ownsHome: null }));
                        }}
                        className={`py-3 px-4 rounded-xl border-2 font-semibold text-base transition-all duration-200 ${
                          ownsHome === option.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {errors.ownsHome && (
                    <p className="mt-1.5 text-sm text-red-600">{errors.ownsHome}</p>
                  )}
                </div>

                {/* Product Intent */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    What are you looking to insure?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: '🚗 Auto', value: 'auto' },
                      { label: '🏠 Home', value: 'home' },
                      { label: '🚗🏠 Both', value: 'bundle', badge: 'Most Popular' },
                      { label: '🤔 Not Sure', value: 'unsure' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setProductIntent(option.value);
                          if (errors.productIntent) setErrors((prev) => ({ ...prev, productIntent: null }));
                          // Reset risk answers when intent changes so stale data isn't submitted
                          if (option.value !== 'auto' && option.value !== 'bundle') {
                            setAutoDrivingRecord(null);
                            setCurrentAutoCarrier(null);
                          }
                          if (option.value !== 'home' && option.value !== 'bundle') {
                            setHomeClaimsHistory(null);
                            setCurrentHomeCarrier(null);
                          }
                        }}
                        className={`relative py-3 px-4 rounded-xl border-2 font-semibold text-base transition-all duration-200 ${
                          productIntent === option.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {option.badge && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                            {option.badge}
                          </span>
                        )}
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {errors.productIntent && (
                    <p className="mt-1.5 text-sm text-red-600">{errors.productIntent}</p>
                  )}
                </div>

                {/* Auto Carrier — conditional on auto or bundle */}
                {showAutoRisk && (
                  <div className="animate-fadeIn">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Who is your current auto insurance carrier?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'State Farm', value: 'state_farm' },
                        { label: 'GEICO', value: 'geico' },
                        { label: 'Progressive', value: 'progressive' },
                        { label: 'Allstate', value: 'allstate' },
                        { label: 'Farmers', value: 'farmers' },
                        { label: 'GA Farm Bureau', value: 'farm_bureau' },
                        { label: 'Other', value: 'other' },
                        { label: 'None', value: 'none' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setCurrentAutoCarrier(option.value);
                            if (errors.currentAutoCarrier) setErrors((prev) => ({ ...prev, currentAutoCarrier: null }));
                          }}
                          className={`py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                            currentAutoCarrier === option.value
                              ? option.value === 'allstate'
                                ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md'
                                : 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {errors.currentAutoCarrier && (
                      <p className="mt-1.5 text-sm text-red-600">{errors.currentAutoCarrier}</p>
                    )}
                  </div>
                )}

                {/* Home Carrier — conditional on home or bundle */}
                {showHomeRisk && (
                  <div className="animate-fadeIn">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Who is your current home insurance carrier?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'State Farm', value: 'state_farm' },
                        { label: 'Allstate', value: 'allstate' },
                        { label: 'Liberty Mutual', value: 'liberty_mutual' },
                        { label: 'Farmers', value: 'farmers' },
                        { label: 'GA Farm Bureau', value: 'farm_bureau' },
                        { label: 'Other', value: 'other' },
                        { label: 'None', value: 'none' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setCurrentHomeCarrier(option.value);
                            if (errors.currentHomeCarrier) setErrors((prev) => ({ ...prev, currentHomeCarrier: null }));
                          }}
                          className={`py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all duration-200 ${
                            currentHomeCarrier === option.value
                              ? option.value === 'allstate'
                                ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-md'
                                : 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {errors.currentHomeCarrier && (
                      <p className="mt-1.5 text-sm text-red-600">{errors.currentHomeCarrier}</p>
                    )}
                  </div>
                )}

                {/* Auto Risk — conditional on auto or bundle */}
                {showAutoRisk && (
                  <div className="animate-fadeIn">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Any accidents or tickets in the last 3 years?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'None', value: 'clean' },
                        { label: '1\u20132', value: '1-2' },
                        { label: '3+', value: '3+' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setAutoDrivingRecord(option.value);
                            if (errors.autoDrivingRecord) setErrors((prev) => ({ ...prev, autoDrivingRecord: null }));
                          }}
                          className={`py-3 px-4 rounded-xl border-2 font-semibold text-base transition-all duration-200 ${
                            autoDrivingRecord === option.value
                              ? option.value === '3+'
                                ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                                : 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {errors.autoDrivingRecord && (
                      <p className="mt-1.5 text-sm text-red-600">{errors.autoDrivingRecord}</p>
                    )}
                  </div>
                )}

                {/* Home Claims — conditional on home or bundle */}
                {showHomeRisk && (
                  <div className="animate-fadeIn">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      More than 1 home insurance claim in the last 5 years?
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'No', value: '0-1' },
                        { label: 'Yes', value: '2+' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setHomeClaimsHistory(option.value);
                            if (errors.homeClaimsHistory) setErrors((prev) => ({ ...prev, homeClaimsHistory: null }));
                          }}
                          className={`py-3 px-4 rounded-xl border-2 font-semibold text-base transition-all duration-200 ${
                            homeClaimsHistory === option.value
                              ? option.value === '2+'
                                ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                                : 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {errors.homeClaimsHistory && (
                      <p className="mt-1.5 text-sm text-red-600">{errors.homeClaimsHistory}</p>
                    )}
                  </div>
                )}

                {/* Vehicle Count */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    How many vehicles?
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => {
                          setVehicleCount(count);
                          if (errors.vehicleCount) setErrors((prev) => ({ ...prev, vehicleCount: null }));
                        }}
                        className={`py-3 rounded-xl border-2 font-semibold text-base transition-all duration-200 ${
                          vehicleCount === count
                            ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {count === 4 ? '4+' : count}
                      </button>
                    ))}
                  </div>
                  {errors.vehicleCount && (
                    <p className="mt-1.5 text-sm text-red-600">{errors.vehicleCount}</p>
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
                      {isSubmitting ? 'Checking...' : 'Check My Savings'}
                    </span>
                    {!isSubmitting && (
                      <ArrowRight className="relative z-10 w-5 h-5 text-white transition-transform duration-300 group-hover:translate-x-1" />
                    )}
                  </div>
                </button>
              </form>
            </div>
          </div>

          {/* Trust Bar */}
          <div className="mt-8 text-center">
            <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <img src="/logos/allstate-logo.svg" alt="Allstate" className="h-5 opacity-80" onError={(e) => { e.target.style.display = 'none'; }} />
                <span className="font-semibold">Licensed Georgia Agent</span>
              </div>
              <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
              <span className="text-white/70 text-sm font-medium">500+ Quotes Delivered</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
              <Lock className="w-4 h-4" />
              <span>Your information is never sold to third parties</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
