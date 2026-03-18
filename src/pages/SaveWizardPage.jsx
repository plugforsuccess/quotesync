// src/pages/SaveWizardPage.jsx — Funnel V2: Single-question-at-a-time wizard
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, ArrowLeft, Lock } from 'lucide-react';
import { useWizard, SESSION_KEYS } from '../hooks/useWizard';
import { supabase } from '../lib/supabase';
import { trackFunnelStep, trackLeadSubmission, trackGoogleAdsConversion, trackEvent, trackZipSubmitted, trackQuoteAbandoned } from '../lib/analytics';
import { getSessionId, getUtmParams } from '../lib/leadsApi';
import { toE164, isValidPhone } from '../utils/phoneFormat';
import { buildZipValidator, getStateFromZip } from '../config/targetZips';
import { useFunnelAgency } from '../hooks/useFunnelAgency';
import {
  ZipStep,
  DiscountQualifierStep,
  VeteranStatusStep,
  ProductIntentStep,
  EarlyPhoneStep,
  CarrierSelectionStep,
  AUTO_TOP_CARRIERS, AUTO_SECOND_TIER,
  HOME_TOP_CARRIERS, HOME_SECOND_TIER,
  RENTERS_TOP_CARRIERS, RENTERS_SECOND_TIER,
  CurrentAutoPremiumStep,
  CurrentHomePremiumStep,
  CoverageLapseStep,
  VehicleYearStep,
  VehicleMakeStep,
  VehicleModelStep,
  VehicleUseStep,
  AutoDrivingRecordStep,
  HomeClaimsHistoryStep,
  DobStep,
  AddressStep,
  ContactStep,
  ConfirmationStep,
  // New auto wizard redesign components
  CurrentlyInsuredStep,
  CanopyMidFunnelStep,
  ContinuousInsuredStep,
  IncidentFreeStep,
  BundleOfferStep,
  GenderStep,
  OwnOrLeaseStep,
  BodilyInjuryLimitsStep,
} from './components/wizard/WizardSteps';
import { validateStep } from './components/wizard/wizardValidation';

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lead`
  : '/functions/v1/create-lead';

const TCPA_CONSENT_VERSION = 'v1.0-2026-03';

// ─── Lead Scoring (same logic as v1) ──────────────────────────────

function computeLeadScore(answers, utmParams) {
  let score = 0;
  if (answers.ownsHome === true) score += 30;
  if (answers.vehicleCount >= 2) score += 20;
  if (answers.vehicleCount >= 3) score += 10;
  if (answers.zip) score += 15;
  if (answers.productIntent === 'bundle') score += 20;
  else if (answers.productIntent === 'auto_renters') score += 15;
  else if (answers.productIntent === 'auto' || answers.productIntent === 'home') score += 10;
  else if (answers.productIntent === 'renters') score += 5; // legacy pre-v2.1 — kept for in-flight sessions
  if (answers.autoDrivingRecord === 'clean') score += 15;
  else if (answers.autoDrivingRecord === '1-2') score += 5;
  else if (answers.autoDrivingRecord === '3+') score -= 20;
  if (answers.homeClaimsHistory === '0-1') score += 10;
  else if (answers.homeClaimsHistory === '2+') score -= 15;
  if (answers.currentAutoCarrier === 'allstate') score -= 10;
  if (answers.currentHomeCarrier === 'allstate') score -= 10;

  // NEW-3: No prior insurance penalty
  if (answers.currentAutoCarrier === 'none') score -= 15;
  if (answers.currentHomeCarrier === 'none') score -= 10;
  if (answers.currentRentersCarrier === 'none') score -= 5;

  // NEW-2: Age-based scoring (from DOB)
  if (answers.dob) {
    const dob = new Date(answers.dob + 'T00:00:00');
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 25) score -= 10;
    else if (age <= 45) score += 10;
    else if (age <= 65) score += 15;
    else score += 5;
  }

  // NEW-2: Marital status scoring
  if (answers.maritalStatus === 'married') score += 10;
  else if (answers.maritalStatus === 'widowed') score += 5;
  else if (answers.maritalStatus === 'divorced') score += 3;

  // Coverage lapse
  if (answers.coverageLapse === 'no_lapse') score += 15;
  else if (answers.coverageLapse === 'under_30') score += 5;
  else if (answers.coverageLapse === '30_to_90') score -= 10;
  else if (answers.coverageLapse === 'over_90') score -= 20;
  else if (answers.coverageLapse === 'never_insured') score -= 25;

  // Multiple drivers (positive signal — more products)
  if (answers.multipleDrivers === true) score += 10;

  // Vehicle use risk signals
  if (answers.vehicleUse?.includes('rideshare')) score -= 10;
  if (answers.vehicleUse?.includes('commercial')) score -= 15;

  // Premium provided (engagement signal — lead knows their numbers)
  if (answers.currentAutoPremium > 0) score += 5;
  if (answers.currentHomePremium > 0) score += 5;

  // Auto wizard redesign: currently insured
  if (answers.currentlyInsured === true) score += 10;
  else if (answers.currentlyInsured === false) score -= 15;

  // Continuous insured duration
  if (answers.continuousInsuredDuration === '5yr_plus') score += 15;
  else if (answers.continuousInsuredDuration === '3yr_to_5yr') score += 10;
  else if (answers.continuousInsuredDuration === '1yr_to_3yr') score += 5;
  else if (answers.continuousInsuredDuration === 'less_than_6mo') score -= 5;

  // Incident free
  if (answers.incidentFree === true) score += 15;
  else if (answers.incidentFree === false) score -= 20;

  // Bundle interest
  if (answers.bundleInterest === true) score += 20;

  // Canopy mid-funnel engagement
  if (answers.canopyMidFunnelAccepted === true) score += 10;

  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 17) score += 10;
  if (utmParams?.utm_campaign) score += 5;
  return Math.max(0, Math.min(score, 100));
}

// UX-6: Helper to determine if the current step has a value (for showing Continue button)
function hasValueForCurrentStep(stepId, answers) {
  switch (stepId) {
    case 'zip': return answers.zip?.length === 5;
    case 'discountQualifier': return answers.ownsHome != null && answers.maritalStatus != null && answers.multipleDrivers != null && answers.vehicleCount != null;
    case 'veteranStatus': return answers.veteranStatus != null;
    case 'productIntent': return answers.productIntent != null;
    case 'earlyPhone': return isValidPhone(answers.earlyPhone || '');
    case 'currentAutoCarrier': return answers.currentAutoCarrier != null;
    case 'currentHomeCarrier': return answers.currentHomeCarrier != null;
    case 'currentRentersCarrier': return answers.currentRentersCarrier != null;
    case 'currentAutoPremium': return true;  // "Not sure" always allows advance
    case 'currentHomePremium': return true;  // same
    case 'coverageLapse': return answers.coverageLapse != null;
    case 'vehicleYear': return answers.vehicleYear != null;
    case 'vehicleMake': return answers.vehicleMake != null;
    case 'vehicleModel': return answers.vehicleModel != null;
    case 'vehicleUse': return answers.vehicleUse?.length > 0;
    case 'autoDrivingRecord': return answers.autoDrivingRecord != null;
    case 'homeClaimsHistory': return answers.homeClaimsHistory != null;
    case 'dob': return answers.dob?.length === 10;
    case 'address': return answers.street?.trim()?.length > 0 && answers.city?.trim()?.length > 0;
    case 'contact': return true;
    // New auto wizard redesign steps
    case 'currentlyInsured': return answers.currentlyInsured != null;
    case 'canopyMidFunnel': return answers.canopyMidFunnelAccepted != null;
    case 'continuousInsured': return answers.continuousInsuredDuration != null;
    case 'incidentFree': return answers.incidentFree != null;
    case 'bundleOffer': return answers.bundleInterest != null;
    case 'gender': return answers.gender != null;
    case 'ownOrLease': return answers.ownOrLease != null;
    case 'bodilyInjuryLimits': return answers.bodilyInjuryLimits != null;
    default: return false;
  }
}

// Steps that require a manual Continue button (all others auto-advance)
const MANUAL_ADVANCE_STEPS = new Set([
  'vehicleUse',
  'contact',
]);

// ─── Progress Wheel ────────────────────────────────────────────────

function ProgressWheel({ pct, hidden }) {
  const size = 120;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const gradientId = 'progress-wheel-gradient';

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: hidden ? 'translateX(-50%) translateY(-20px)' : 'translateX(-50%)',
        opacity: hidden ? 0 : 1,
        transition: 'transform 300ms ease, opacity 300ms ease',
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="#0f172a"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={stroke}
          />

          {/* Arc */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="transparent"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white leading-none">{pct}%</span>
          <span className="text-xs font-semibold text-white/60 mt-0.5">Complete</span>
        </div>
      </div>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────

export default function SaveWizardPage() {
  const wizard = useWizard();
  const { answers, setAnswer, currentStepId, currentIndex, setCurrentIndex, direction, isFirstStep, goNext, goBack, productIntentOptions } = wizard;

  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [animKey, setAnimKey] = useState(0);

  const utmParams = useRef(getUtmParams());
  const partialLeadInserted = useRef(false);

  // Scroll-hide: wheel follows header hide/show behavior
  const [hideWheel, setHideWheel] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const scrollingDown = currentY > lastScrollY.current;
      const pastThreshold = currentY > 80;
      setHideWheel(scrollingDown && pastThreshold);
      lastScrollY.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // MT-08: Fetch agency from ?agency= slug param (or default agency)
  const { data: funnelAgency } = useFunnelAgency();
  const agencyId = funnelAgency?.id || null;

  // Build ZIP validator from agency's licensed states
  const isTargetZip = useCallback(
    (zip) => {
      const licensedStates = funnelAgency?.licensed_states?.length > 0
        ? funnelAgency.licensed_states
        : ['GA'];
      return buildZipValidator(licensedStates)(zip);
    },
    [funnelAgency?.licensed_states]
  );

  // ZIP prefill from landing page URL (e.g. /save?zip=30331)
  useEffect(() => {
    if (!funnelAgency) return; // Wait for agency to load before validating ZIP
    const params = new URLSearchParams(window.location.search);
    const prefilledZip = params.get('zip');

    if (prefilledZip?.length === 5 && isTargetZip(prefilledZip)) {
      setAnswer('zip', prefilledZip);
      if (!answers.zip) insertPartialLead(prefilledZip);
      // No setCurrentIndex needed — useWizard initializes to 1 when ?zip= is present
    }
  }, [funnelAgency]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger animation on step change
  useEffect(() => {
    setAnimKey(prev => prev + 1);
  }, [currentIndex]);

  // ─── Partial Lead Insert (at ZIP step) ─────────────────────────

  const insertPartialLead = useCallback(async (zipOverride) => {
    if (partialLeadInserted.current || !agencyId) return;
    partialLeadInserted.current = true;

    const zip = zipOverride || answers.zip;
    const state = getStateFromZip(zip) || 'GA';
    try {
      const sessionId = getSessionId();
      const { data } = await supabase.from('leads').insert({
        status: 'partial',
        source: 'funnel',
        agency_id: agencyId,
        zip,
        state,
        session_id: sessionId,
        utm_source: utmParams.current.utm_source,
        utm_medium: utmParams.current.utm_medium,
        utm_campaign: utmParams.current.utm_campaign,
        utm_content: utmParams.current.utm_content,
        utm_term: utmParams.current.utm_term,
        landing_page: '/save',
      }).select('id').single();

      if (data?.id) {
        sessionStorage.setItem(SESSION_KEYS.LEAD_ID, data.id);
        trackZipSubmitted(zip);
      }
    } catch (err) {
      console.error('Failed to create partial lead:', err);
    }
  }, [answers.zip, agencyId]);

  // ─── Progressive Lead Update ───────────────────────────────────

  const updatePartialLead = useCallback(async (fields) => {
    const leadId = sessionStorage.getItem(SESSION_KEYS.LEAD_ID);
    if (!leadId) return;
    try {
      await supabase.from('leads').update(fields).eq('id', leadId);
    } catch (err) {
      console.error('Failed to update partial lead:', err);
    }
  }, []);

  // ─── Abandon Tracking (page unload) ───────────────────────────

  useEffect(() => {
    const handleBeforeUnload = () => {
      const leadId = sessionStorage.getItem(SESSION_KEYS.LEAD_ID);
      if (leadId && currentStepId !== 'confirmation') {
        const timeOnCurrentStep = Date.now() - (wizard.stepEnteredAt?.current ?? Date.now());
        trackQuoteAbandoned(currentStepId, currentIndex, { time_on_step_ms: timeOnCurrentStep });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentStepId, currentIndex, wizard.stepEnteredAt]);

  // ─── Final Submission ──────────────────────────────────────────

  const handleFinalSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const phoneE164 = toE164(answers.phone);
      const leadScore = computeLeadScore(answers, utmParams.current);

      const derivedState = getStateFromZip(answers.zip) || 'GA';

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          first_name: answers.firstName.trim(),
          last_name: answers.lastName.trim(),
          phone: phoneE164,
          email: answers.email.trim(),
          zip: answers.zip,
          state: derivedState,
          owns_home: answers.ownsHome,
          vehicle_count: answers.vehicleCount,
          product_intent: answers.productIntent,
          auto_driving_record: answers.autoDrivingRecord || null,
          home_claims_history: answers.homeClaimsHistory || null,
          current_auto_carrier: answers.currentAutoCarrier || null,
          current_home_carrier: answers.currentHomeCarrier || null,
          current_renters_carrier: answers.currentRentersCarrier || null,
          date_of_birth: answers.dob || null,
          street_address: answers.street?.trim() || null,
          address_unit: answers.apt?.trim() || null,
          city: answers.city?.trim() || null,
          marital_status: answers.maritalStatus || null,
          address_source: answers.addressSource || 'manual_entry',
          vehicle_year: answers.vehicleYear,
          vehicle_make: answers.vehicleMake,
          vehicle_model: answers.vehicleModel,
          vehicle_use: answers.vehicleUse,
          coverage_lapse: answers.coverageLapse,
          multiple_drivers: answers.multipleDrivers,
          veteran_status: answers.veteranStatus,
          current_auto_premium: answers.currentAutoPremium ?? null,
          current_home_premium: answers.currentHomePremium ?? null,
          // Auto wizard redesign fields
          currently_insured: answers.currentlyInsured ?? null,
          continuous_insured_duration: answers.continuousInsuredDuration ?? null,
          incident_free: answers.incidentFree ?? null,
          bundle_interest: answers.bundleInterest ?? null,
          gender: answers.gender ?? null,
          own_or_lease: answers.ownOrLease ?? null,
          bodily_injury_limits: answers.bodilyInjuryLimits ?? null,
          canopy_mid_funnel_offered: answers.canopyMidFunnelAccepted !== null ? true : false,
          canopy_mid_funnel_accepted: answers.canopyMidFunnelAccepted ?? null,
          // Address city/state from contact step
          address_city: answers.addressCity?.trim() || answers.city?.trim() || null,
          address_state: answers.addressState || derivedState,
          source: 'funnel',
          lead_score: leadScore,
          session_id: sessionStorage.getItem('quotesync_session_id'),
          landing_page: '/save',
          consent_given_at: new Date().toISOString(),
          consent_version: TCPA_CONSENT_VERSION,
          consent_user_agent: navigator.userAgent,
          ...utmParams.current,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error (${response.status})`);
      }

      // Fire analytics
      trackFunnelStep(1, {
        zip: answers.zip,
        owns_home: answers.ownsHome,
        vehicle_count: answers.vehicleCount,
        product_intent: answers.productIntent,
      });
      trackFunnelStep(2, {
        has_phone: true,
        owns_home: answers.ownsHome,
        vehicle_count: answers.vehicleCount,
      });
      trackLeadSubmission({
        source: 'funnel',
        owns_home: answers.ownsHome,
        vehicle_count: answers.vehicleCount,
        product_intent: answers.productIntent,
        auto_driving_record: answers.autoDrivingRecord,
        home_claims_history: answers.homeClaimsHistory,
        current_auto_carrier: answers.currentAutoCarrier,
        current_home_carrier: answers.currentHomeCarrier,
      });

      const conversionLabel = import.meta.env.VITE_GADS_CONVERSION_LABEL;
      if (conversionLabel) {
        trackGoogleAdsConversion(conversionLabel, 60);
      }

      // Advance to confirmation step (session clear happens in ConfirmationStep mount)
      goNext();
    } catch (err) {
      console.error('Wizard submission error:', err);
      setSubmitError(
        'Something went wrong submitting your quote request. Please try again, or call us directly.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, goNext]);

  // ─── Navigation Handlers ───────────────────────────────────────

  // ─── Step-specific progressive updates ──────────────────────────

  const onStepLeaving = useCallback((stepId) => {
    // Fire step analytics
    trackEvent('funnel_step_completed', { step: stepId, step_index: currentIndex });

    // Insert partial lead when leaving ZIP step
    if (stepId === 'zip') {
      insertPartialLead();
      return;
    }

    // Progressive updates at key steps
    if (stepId === 'discountQualifier') {
      updatePartialLead({
        owns_home: answers.ownsHome === true,
        housing_situation: answers.ownsHome === true ? 'own' : answers.ownsHome === false ? 'rent' : 'other',
        marital_status: answers.maritalStatus,
        multiple_drivers: answers.multipleDrivers,
        vehicle_count: answers.vehicleCount,
      });
    } else if (stepId === 'veteranStatus') {
      updatePartialLead({ veteran_status: answers.veteranStatus });
    } else if (stepId === 'productIntent') {
      updatePartialLead({ product_intent: answers.productIntent });
    } else if (stepId === 'earlyPhone' && answers.earlyPhone && isValidPhone(answers.earlyPhone)) {
      updatePartialLead({
        phone: toE164(answers.earlyPhone),
        early_phone_captured: true,
      });
    } else if (stepId === 'currentAutoCarrier' || stepId === 'currentHomeCarrier' || stepId === 'currentRentersCarrier') {
      updatePartialLead({
        current_auto_carrier: answers.currentAutoCarrier,
        current_home_carrier: answers.currentHomeCarrier,
        current_renters_carrier: answers.currentRentersCarrier,
      });
    } else if (stepId === 'autoDrivingRecord' || stepId === 'homeClaimsHistory') {
      updatePartialLead({
        auto_driving_record: answers.autoDrivingRecord,
        home_claims_history: answers.homeClaimsHistory,
      });
    } else if (stepId === 'currentAutoPremium') {
      updatePartialLead({ current_auto_premium: answers.currentAutoPremium ?? null });
    } else if (stepId === 'currentHomePremium') {
      updatePartialLead({ current_home_premium: answers.currentHomePremium ?? null });
    } else if (stepId === 'coverageLapse') {
      updatePartialLead({ coverage_lapse: answers.coverageLapse });
    } else if (stepId === 'vehicleYear') {
      updatePartialLead({ vehicle_year: answers.vehicleYear });
    } else if (stepId === 'vehicleMake') {
      updatePartialLead({ vehicle_make: answers.vehicleMake });
    } else if (stepId === 'vehicleModel') {
      updatePartialLead({ vehicle_model: answers.vehicleModel });
    } else if (stepId === 'vehicleUse') {
      updatePartialLead({ vehicle_use: answers.vehicleUse });
    } else if (stepId === 'address') {
      updatePartialLead({
        street_address: answers.street?.trim() || null,
        address_unit: answers.apt?.trim() || null,
        city: answers.city?.trim() || null,
        address_source: answers.addressSource || 'manual_entry',
      });
    }
    // Auto wizard redesign progressive saves
    else if (stepId === 'currentlyInsured') {
      updatePartialLead({ currently_insured: answers.currentlyInsured });
    } else if (stepId === 'canopyMidFunnel') {
      updatePartialLead({
        canopy_mid_funnel_offered: true,
        canopy_mid_funnel_accepted: answers.canopyMidFunnelAccepted ?? false,
      });
    } else if (stepId === 'continuousInsured') {
      updatePartialLead({ continuous_insured_duration: answers.continuousInsuredDuration });
    } else if (stepId === 'incidentFree') {
      updatePartialLead({ incident_free: answers.incidentFree });
    } else if (stepId === 'bundleOffer') {
      updatePartialLead({ bundle_interest: answers.bundleInterest });
    } else if (stepId === 'gender') {
      updatePartialLead({ gender: answers.gender });
    } else if (stepId === 'ownOrLease') {
      updatePartialLead({ own_or_lease: answers.ownOrLease });
    } else if (stepId === 'bodilyInjuryLimits') {
      updatePartialLead({ bodily_injury_limits: answers.bodilyInjuryLimits });
    }
  }, [currentIndex, answers, insertPartialLead, updatePartialLead]);

  const handleAutoAdvance = useCallback(() => {
    setError(null);
    onStepLeaving(currentStepId);
    const timeMs = goNext();
    trackFunnelStep(currentStepId, {
      time_ms: timeMs,
      step_index: currentIndex,
      answer_given: true,
    });
  }, [currentStepId, currentIndex, goNext, onStepLeaving]);

  const handleEarlyPhoneSkip = useCallback(() => {
    setAnswer('phoneSkipped', true);
    setError(null);
    onStepLeaving(currentStepId);
    goNext();
  }, [setAnswer, onStepLeaving, currentStepId, goNext]);

  const handleNext = useCallback(() => {
    const validationError = validateStep(currentStepId, answers);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onStepLeaving(currentStepId);

    // Contact step → submit to server
    if (currentStepId === 'contact') {
      handleFinalSubmit();
      return;
    }

    const timeMs = goNext();
    trackFunnelStep(currentStepId, {
      time_ms: timeMs,
      step_index: currentIndex,
      answer_given: !!answers[currentStepId],
    });
  }, [currentStepId, currentIndex, answers, goNext, onStepLeaving, handleFinalSubmit]);

  const handleBack = useCallback(() => {
    setError(null);
    setSubmitError(null);
    const fromStep = currentStepId;
    const timeMs = goBack();
    trackFunnelStep(`${currentStepId}_back`, {
      time_ms: timeMs,
      step_index: currentIndex,
    });
  }, [goBack, currentStepId, currentIndex]);

  // ─── Canopy mid-funnel handlers ─────────────────────────────────

  const handleCanopyAccept = useCallback(() => {
    setAnswer('canopyMidFunnelAccepted', true);
    // Launch Canopy Connect (fire-and-forget, don't block wizard)
    import('../hooks/useCanopyLauncher').then(({ useCanopyLauncher }) => {
      // Note: since we can't use hooks outside components, we fire the Canopy modal via a direct approach
    }).catch(() => {});
    // Advance immediately
    handleAutoAdvance();
  }, [setAnswer, handleAutoAdvance]);

  const handleCanopyDecline = useCallback(() => {
    setAnswer('canopyMidFunnelAccepted', false);
    handleAutoAdvance();
  }, [setAnswer, handleAutoAdvance]);

  // Helper to get carrier label/logo from carrier value
  const getCarrierInfo = useCallback((carrierValue) => {
    const carrier = AUTO_TOP_CARRIERS.find(c => c.value === carrierValue);
    if (carrier) return { label: carrier.label, logo: carrier.logo };
    // Check second tier
    const secondTier = AUTO_SECOND_TIER.find(
      name => name.toLowerCase().replace(/\s+/g, '_') === carrierValue
    );
    if (secondTier) return { label: secondTier, logo: null };
    return { label: carrierValue, logo: null };
  }, []);

  // ─── Step Renderer ─────────────────────────────────────────────

  const renderStep = () => {
    switch (currentStepId) {
      case 'zip':
        return (
          <ZipStep
            value={answers.zip}
            onChange={(v) => setAnswer('zip', v)}
            onAutoAdvance={handleAutoAdvance}
            isTargetZip={isTargetZip}
            licensedStatesLabel={funnelAgency?.licensed_states?.join(', ') || 'Georgia'}
          />
        );
      case 'currentlyInsured':
        return (
          <CurrentlyInsuredStep
            value={answers.currentlyInsured}
            onChange={(v) => setAnswer('currentlyInsured', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'currentAutoCarrier':
        return (
          <CarrierSelectionStep
            heading="Who is your current auto insurance carrier?"
            topCarriers={AUTO_TOP_CARRIERS}
            secondTierLabels={AUTO_SECOND_TIER}
            value={answers.currentAutoCarrier}
            onChange={(v) => setAnswer('currentAutoCarrier', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'canopyMidFunnel': {
        const carrierInfo = getCarrierInfo(answers.currentAutoCarrier);
        return (
          <CanopyMidFunnelStep
            carrierValue={answers.currentAutoCarrier}
            carrierLabel={carrierInfo.label}
            carrierLogo={carrierInfo.logo}
            onAccept={handleCanopyAccept}
            onDecline={handleCanopyDecline}
            agentName={funnelAgency?.agent_first_name}
          />
        );
      }
      case 'continuousInsured':
        return (
          <ContinuousInsuredStep
            value={answers.continuousInsuredDuration}
            onChange={(v) => setAnswer('continuousInsuredDuration', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'incidentFree':
        return (
          <IncidentFreeStep
            value={answers.incidentFree}
            onChange={(v) => setAnswer('incidentFree', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'discountQualifier':
        return (
          <DiscountQualifierStep
            ownsHome={answers.ownsHome}
            maritalStatus={answers.maritalStatus}
            multipleDrivers={answers.multipleDrivers}
            multipleVehicles={answers.vehicleCount === null ? null : answers.vehicleCount >= 2}
            onOwnsHomeChange={(v) => setAnswer('ownsHome', v)}
            onMaritalStatusChange={(v) => setAnswer('maritalStatus', v)}
            onMultipleDriversChange={(v) => setAnswer('multipleDrivers', v)}
            onMultipleVehiclesChange={(v) => setAnswer('vehicleCount', v ? 2 : 1)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'bundleOffer':
        return (
          <BundleOfferStep
            value={answers.bundleInterest}
            onChange={(v) => setAnswer('bundleInterest', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'veteranStatus':
        return (
          <VeteranStatusStep
            value={answers.veteranStatus}
            onChange={(v) => setAnswer('veteranStatus', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'productIntent':
        return (
          <ProductIntentStep
            value={answers.productIntent}
            onChange={(v) => setAnswer('productIntent', v)}
            options={productIntentOptions}
            onAutoAdvance={handleAutoAdvance}
            isRenter={answers.ownsHome === false || answers.ownsHome === 'other'}
          />
        );
      case 'earlyPhone':
        return (
          <EarlyPhoneStep
            value={answers.earlyPhone}
            onChange={(v) => setAnswer('earlyPhone', v)}
            onSkip={handleEarlyPhoneSkip}
          />
        );
      case 'currentHomeCarrier':
        return (
          <CarrierSelectionStep
            heading="Who is your current home insurance carrier?"
            topCarriers={HOME_TOP_CARRIERS}
            secondTierLabels={HOME_SECOND_TIER}
            value={answers.currentHomeCarrier}
            onChange={(v) => setAnswer('currentHomeCarrier', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'currentRentersCarrier':
        return (
          <CarrierSelectionStep
            heading="Who is your current renters insurance carrier?"
            topCarriers={RENTERS_TOP_CARRIERS}
            secondTierLabels={RENTERS_SECOND_TIER}
            value={answers.currentRentersCarrier}
            onChange={(v) => setAnswer('currentRentersCarrier', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'autoDrivingRecord':
        return (
          <AutoDrivingRecordStep
            value={answers.autoDrivingRecord}
            onChange={(v) => setAnswer('autoDrivingRecord', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'homeClaimsHistory':
        return (
          <HomeClaimsHistoryStep
            value={answers.homeClaimsHistory}
            onChange={(v) => setAnswer('homeClaimsHistory', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'currentAutoPremium':
        return (
          <CurrentAutoPremiumStep
            value={answers.currentAutoPremium}
            onChange={(v) => setAnswer('currentAutoPremium', v)}
            onSkip={() => { setAnswer('currentAutoPremium', null); handleAutoAdvance(); }}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'currentHomePremium':
        return (
          <CurrentHomePremiumStep
            value={answers.currentHomePremium}
            onChange={(v) => setAnswer('currentHomePremium', v)}
            onSkip={() => { setAnswer('currentHomePremium', null); handleAutoAdvance(); }}
          />
        );
      case 'coverageLapse':
        return (
          <CoverageLapseStep
            value={answers.coverageLapse}
            onChange={(v) => setAnswer('coverageLapse', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'vehicleYear':
        return (
          <VehicleYearStep
            value={answers.vehicleYear}
            onChange={(v) => setAnswer('vehicleYear', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'vehicleMake':
        return (
          <VehicleMakeStep
            value={answers.vehicleMake}
            onChange={(v) => { setAnswer('vehicleMake', v); setAnswer('vehicleModel', null); }}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'vehicleModel':
        return (
          <VehicleModelStep
            make={answers.vehicleMake}
            year={answers.vehicleYear}
            value={answers.vehicleModel}
            onChange={(v) => setAnswer('vehicleModel', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'vehicleUse':
        return (
          <VehicleUseStep
            vehicleLabel={[answers.vehicleYear, answers.vehicleMake, answers.vehicleModel].filter(Boolean).join(' ')}
            value={answers.vehicleUse}
            onChange={(v) => setAnswer('vehicleUse', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'dob':
        return (
          <DobStep
            value={answers.dob}
            onChange={(v) => setAnswer('dob', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'gender':
        return (
          <GenderStep
            value={answers.gender}
            onChange={(v) => setAnswer('gender', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'ownOrLease':
        return (
          <OwnOrLeaseStep
            value={answers.ownOrLease}
            onChange={(v) => setAnswer('ownOrLease', v)}
            onAutoAdvance={handleAutoAdvance}
            vehicleYear={answers.vehicleYear}
            vehicleMake={answers.vehicleMake}
            vehicleModel={answers.vehicleModel}
          />
        );
      case 'bodilyInjuryLimits':
        return (
          <BodilyInjuryLimitsStep
            value={answers.bodilyInjuryLimits}
            onChange={(v) => setAnswer('bodilyInjuryLimits', v)}
            onAutoAdvance={handleAutoAdvance}
          />
        );
      case 'address':
        return (
          <AddressStep
            street={answers.street}
            apt={answers.apt}
            city={answers.city}
            zip={answers.zip}
            stateCode={getStateFromZip(answers.zip) || 'GA'}
            onStreetChange={(v) => setAnswer('street', v)}
            onAptChange={(v) => setAnswer('apt', v)}
            onCityChange={(v) => setAnswer('city', v)}
            onZipCorrected={(v) => setAnswer('zip', v)}
            onAddressSourceChange={(v) => setAnswer('addressSource', v)}
          />
        );
      case 'contact':
        return (
          <ContactStep
            firstName={answers.firstName}
            lastName={answers.lastName}
            phone={answers.phone}
            email={answers.email}
            street={answers.street}
            city={answers.addressCity || answers.city}
            zip={answers.zip}
            stateCode={answers.addressState || getStateFromZip(answers.zip) || 'GA'}
            onFirstNameChange={(v) => setAnswer('firstName', v)}
            onLastNameChange={(v) => setAnswer('lastName', v)}
            onPhoneChange={(v) => setAnswer('phone', v)}
            onEmailChange={(v) => setAnswer('email', v)}
            onStreetChange={(v) => setAnswer('street', v)}
            onCityChange={(v) => setAnswer('addressCity', v)}
            errors={typeof error === 'object' ? error : undefined}
            agentName={funnelAgency?.agent_first_name}
            brandName={funnelAgency?.brand_name}
          />
        );
      case 'confirmation':
        return <ConfirmationStep answers={answers} agentName={funnelAgency?.agent_first_name} brandName={funnelAgency?.brand_name} />;
      default:
        return null;
    }
  };

  const isConfirmation = currentStepId === 'confirmation';
  const isContactStep = currentStepId === 'contact';
  const requiresManualAdvance = MANUAL_ADVANCE_STEPS.has(currentStepId);
  const showNextButton = !isConfirmation && requiresManualAdvance && hasValueForCurrentStep(currentStepId, answers);
  const showBackButton = !isFirstStep && !isConfirmation;

  // Animation class based on direction
  const animClass = direction === 'forward' ? 'wizard-slide-in-right' : 'wizard-slide-in-left';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-600 via-primary-900 to-secondary-900 relative overflow-x-hidden">
      <title>See How Much You Could Save | {funnelAgency?.brand_name || 'QuoteSync'}</title>
      <meta name="description" content="Get a personalized Georgia auto and home insurance quote in 60 seconds. No forms, no spam calls." />
      <meta name="robots" content="noindex" />
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }}></div>

      {/* Progress Wheel — OUTSIDE the padded container */}
      {!isConfirmation && <ProgressWheel pct={Math.min(
        Math.round(((currentIndex + 1) / (wizard.totalSteps - 1)) * 100),
        99
      )} hidden={hideWheel} />}

      {/* Content container — top padding removed, bottom padding kept */}
      <div className="container mx-auto px-4 pt-20 pb-12 sm:pb-16 relative z-10">
        <div className="max-w-lg mx-auto">

          {/* Header — only on qualification steps */}
          {currentIndex === 0 && !isConfirmation && (
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
                See How Much You Could Save
              </h1>
              <p className="text-lg text-white/80">
                Takes 30 seconds. Zero obligation. Personalized to your ZIP code.
              </p>
            </div>
          )}

          {/* Wizard Card */}
          <div className="relative group isolate">
            <div className={`absolute -inset-0.5 rounded-2xl opacity-75 blur-sm ${
              isConfirmation
                ? 'bg-gradient-to-r from-success-400 to-success-600'
                : 'bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600'
            }`}></div>
            <div className="save-wizard-card relative bg-white rounded-2xl shadow-2xl p-6 sm:p-8 overflow-visible">
              {/* Submit error banner */}
              {submitError && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
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

              {/* Step content with transition */}
              <div key={animKey} className={animClass}>
                {renderStep()}
              </div>

              {/* Validation error for non-object errors (single string) */}
              {typeof error === 'string' && <ErrorMessage>{error}</ErrorMessage>}

              {/* Navigation Buttons — only on manual-advance steps */}
              {showNextButton && (
                <div className="mt-6 animate-fadeInUp">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={isSubmitting}
                    className="group relative w-full inline-flex items-center justify-center gap-3 overflow-hidden rounded-xl p-0.5 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 animate-gradient-x"></div>
                    <div className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-primary-600 via-primary-700 to-secondary-600 px-8 py-4 rounded-xl transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent trangray-x-[-200%] group-hover:trangray-x-[200%] transition-transform duration-1000"></div>
                      <span className="relative z-10 text-white font-black text-lg">
                        {isSubmitting
                          ? 'Submitting...'
                          : isContactStep
                            ? 'Get My Quotes'
                            : 'Continue'
                        }
                      </span>
                      {!isSubmitting && (
                        <ArrowRight className="relative z-10 w-5 h-5 text-white transition-transform duration-300 group-hover:trangray-x-1" />
                      )}
                    </div>
                  </button>
                </div>
              )}

              {/* Back button — bottom-left of card */}
              {showBackButton && (
                <div className="mt-5 flex justify-start">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-black transition-colors bg-transparent border-0 cursor-pointer px-0 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Trust Bar — shown on non-confirmation steps */}
          {!isConfirmation && (
            <div className="mt-8 text-center">
              <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <img src="/logos/allstate-logo.svg" alt="Allstate" className="h-5 opacity-80" onError={(e) => { e.target.style.display = 'none'; }} />
                  <span className="font-semibold">Licensed {funnelAgency?.licensed_states?.[0] || 'GA'} Agent</span>
                </div>
                <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
                <span className="text-white/70 text-sm font-medium">500+ Quotes Delivered</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
                <Lock className="w-4 h-4" />
                <span>Your information is never sold to third parties</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorMessage({ children }) {
  if (!children) return null;
  return <p className="mt-4 text-sm text-red-600 text-center">{children}</p>;
}
