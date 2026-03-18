// src/hooks/useWizard.js — Wizard state + conditional branching for /save funnel v2
import { useState, useCallback, useMemo, useRef } from 'react';

export const SESSION_KEYS = {
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
  CURRENT_RENTERS_CARRIER: 'qs_funnel_current_renters_carrier',
  FIRST_NAME: 'qs_funnel_first_name',
  LAST_NAME: 'qs_funnel_last_name',
  PHONE: 'qs_funnel_phone',
  EMAIL: 'qs_funnel_email',
  DOB: 'qs_funnel_dob',
  STREET: 'qs_funnel_street',
  APT: 'qs_funnel_unit',
  CITY: 'qs_funnel_city',
  MARITAL_STATUS: 'qs_funnel_marital_status',
  ADDRESS_SOURCE: 'qs_funnel_address_source',
  EARLY_PHONE: 'qs_funnel_early_phone',
  PHONE_SKIPPED: 'qs_funnel_phone_skipped',
  CURRENT_STEP: 'qs_funnel_current_step',
  VEHICLE_YEAR: 'qs_funnel_vehicle_year',
  VEHICLE_MAKE: 'qs_funnel_vehicle_make',
  VEHICLE_MODEL: 'qs_funnel_vehicle_model',
  VEHICLE_USE: 'qs_funnel_vehicle_use',
  COVERAGE_LAPSE: 'qs_funnel_coverage_lapse',
  MULTIPLE_DRIVERS: 'qs_funnel_multiple_drivers',
  VETERAN_STATUS: 'qs_funnel_veteran_status',
  CURRENT_AUTO_PREMIUM: 'qs_funnel_current_auto_premium',
  CURRENT_HOME_PREMIUM: 'qs_funnel_current_home_premium',
  // Auto wizard redesign keys
  CURRENTLY_INSURED: 'qs_funnel_currently_insured',
  CANOPY_MID_FUNNEL_ACCEPTED: 'qs_funnel_canopy_mid_funnel_accepted',
  CONTINUOUS_INSURED_DURATION: 'qs_funnel_continuous_insured_duration',
  INCIDENT_FREE: 'qs_funnel_incident_free',
  BUNDLE_INTEREST: 'qs_funnel_bundle_interest',
  GENDER: 'qs_funnel_gender',
  OWN_OR_LEASE: 'qs_funnel_own_or_lease',
  BODILY_INJURY_LIMITS: 'qs_funnel_bodily_injury_limits',
  ADDRESS_CITY: 'qs_funnel_address_city',
  ADDRESS_STATE: 'qs_funnel_address_state',
};

// ─── Helpers ───────────────────────────────────────────────────────

function jp(val, fallback) {
  if (val === null) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function restore() {
  return {
    zip: sessionStorage.getItem(SESSION_KEYS.ZIP) || '',
    ownsHome: jp(sessionStorage.getItem(SESSION_KEYS.OWNS_HOME), null),
    vehicleCount: jp(sessionStorage.getItem(SESSION_KEYS.VEHICLE_COUNT), null),
    productIntent: sessionStorage.getItem(SESSION_KEYS.PRODUCT_INTENT) || null,
    autoDrivingRecord: jp(sessionStorage.getItem(SESSION_KEYS.AUTO_DRIVING_RECORD), null),
    homeClaimsHistory: jp(sessionStorage.getItem(SESSION_KEYS.HOME_CLAIMS_HISTORY), null),
    currentAutoCarrier: jp(sessionStorage.getItem(SESSION_KEYS.CURRENT_AUTO_CARRIER), null),
    currentHomeCarrier: jp(sessionStorage.getItem(SESSION_KEYS.CURRENT_HOME_CARRIER), null),
    currentRentersCarrier: jp(sessionStorage.getItem(SESSION_KEYS.CURRENT_RENTERS_CARRIER), null),
    dob: sessionStorage.getItem(SESSION_KEYS.DOB) || '',
    street: sessionStorage.getItem(SESSION_KEYS.STREET) || '',
    apt: sessionStorage.getItem(SESSION_KEYS.APT) || '',
    city: sessionStorage.getItem(SESSION_KEYS.CITY) || '',
    firstName: sessionStorage.getItem(SESSION_KEYS.FIRST_NAME) || '',
    lastName: sessionStorage.getItem(SESSION_KEYS.LAST_NAME) || '',
    phone: sessionStorage.getItem(SESSION_KEYS.PHONE) || '',
    email: sessionStorage.getItem(SESSION_KEYS.EMAIL) || '',
    maritalStatus: sessionStorage.getItem(SESSION_KEYS.MARITAL_STATUS) || null,
    addressSource: sessionStorage.getItem(SESSION_KEYS.ADDRESS_SOURCE) || null,
    earlyPhone: sessionStorage.getItem(SESSION_KEYS.EARLY_PHONE) || '',
    phoneSkipped: jp(sessionStorage.getItem(SESSION_KEYS.PHONE_SKIPPED), false),
    vehicleYear: jp(sessionStorage.getItem(SESSION_KEYS.VEHICLE_YEAR), null),
    vehicleMake: sessionStorage.getItem(SESSION_KEYS.VEHICLE_MAKE) || null,
    vehicleModel: sessionStorage.getItem(SESSION_KEYS.VEHICLE_MODEL) || null,
    vehicleUse: jp(sessionStorage.getItem(SESSION_KEYS.VEHICLE_USE), []),
    coverageLapse: sessionStorage.getItem(SESSION_KEYS.COVERAGE_LAPSE) || null,
    multipleDrivers: jp(sessionStorage.getItem(SESSION_KEYS.MULTIPLE_DRIVERS), null),
    veteranStatus: sessionStorage.getItem(SESSION_KEYS.VETERAN_STATUS) || null,
    currentAutoPremium: jp(sessionStorage.getItem(SESSION_KEYS.CURRENT_AUTO_PREMIUM), null),
    currentHomePremium: jp(sessionStorage.getItem(SESSION_KEYS.CURRENT_HOME_PREMIUM), null),
    // Auto wizard redesign fields
    currentlyInsured: jp(sessionStorage.getItem(SESSION_KEYS.CURRENTLY_INSURED), null),
    canopyMidFunnelAccepted: jp(sessionStorage.getItem(SESSION_KEYS.CANOPY_MID_FUNNEL_ACCEPTED), null),
    continuousInsuredDuration: sessionStorage.getItem(SESSION_KEYS.CONTINUOUS_INSURED_DURATION) || null,
    incidentFree: jp(sessionStorage.getItem(SESSION_KEYS.INCIDENT_FREE), null),
    bundleInterest: jp(sessionStorage.getItem(SESSION_KEYS.BUNDLE_INTEREST), null),
    gender: sessionStorage.getItem(SESSION_KEYS.GENDER) || null,
    ownOrLease: sessionStorage.getItem(SESSION_KEYS.OWN_OR_LEASE) || null,
    bodilyInjuryLimits: sessionStorage.getItem(SESSION_KEYS.BODILY_INJURY_LIMITS) || null,
    addressCity: sessionStorage.getItem(SESSION_KEYS.ADDRESS_CITY) || '',
    addressState: sessionStorage.getItem(SESSION_KEYS.ADDRESS_STATE) || '',
  };
}

// H-5: persistToSession must clear null/empty values
function persistToSession(a) {
  const pairs = [
    [SESSION_KEYS.ZIP, a.zip],
    [SESSION_KEYS.OWNS_HOME, a.ownsHome !== null ? JSON.stringify(a.ownsHome) : null],
    [SESSION_KEYS.VEHICLE_COUNT, a.vehicleCount !== null ? String(a.vehicleCount) : null],
    [SESSION_KEYS.PRODUCT_INTENT, a.productIntent],
    [SESSION_KEYS.AUTO_DRIVING_RECORD, a.autoDrivingRecord !== null ? JSON.stringify(a.autoDrivingRecord) : null],
    [SESSION_KEYS.HOME_CLAIMS_HISTORY, a.homeClaimsHistory !== null ? JSON.stringify(a.homeClaimsHistory) : null],
    [SESSION_KEYS.CURRENT_AUTO_CARRIER, a.currentAutoCarrier !== null ? JSON.stringify(a.currentAutoCarrier) : null],
    [SESSION_KEYS.CURRENT_HOME_CARRIER, a.currentHomeCarrier !== null ? JSON.stringify(a.currentHomeCarrier) : null],
    [SESSION_KEYS.CURRENT_RENTERS_CARRIER, a.currentRentersCarrier !== null ? JSON.stringify(a.currentRentersCarrier) : null],
    [SESSION_KEYS.DOB, a.dob],
    [SESSION_KEYS.STREET, a.street],
    [SESSION_KEYS.APT, a.apt],
    [SESSION_KEYS.CITY, a.city],
    [SESSION_KEYS.FIRST_NAME, a.firstName],
    [SESSION_KEYS.LAST_NAME, a.lastName],
    [SESSION_KEYS.PHONE, a.phone],
    [SESSION_KEYS.EMAIL, a.email],
    [SESSION_KEYS.MARITAL_STATUS, a.maritalStatus],
    [SESSION_KEYS.ADDRESS_SOURCE, a.addressSource],
    [SESSION_KEYS.EARLY_PHONE, a.earlyPhone],
    [SESSION_KEYS.PHONE_SKIPPED, a.phoneSkipped ? 'true' : null],
    [SESSION_KEYS.VEHICLE_YEAR, a.vehicleYear !== null ? String(a.vehicleYear) : null],
    [SESSION_KEYS.VEHICLE_MAKE, a.vehicleMake],
    [SESSION_KEYS.VEHICLE_MODEL, a.vehicleModel],
    [SESSION_KEYS.VEHICLE_USE, a.vehicleUse?.length ? JSON.stringify(a.vehicleUse) : null],
    [SESSION_KEYS.COVERAGE_LAPSE, a.coverageLapse],
    [SESSION_KEYS.MULTIPLE_DRIVERS, a.multipleDrivers !== null ? JSON.stringify(a.multipleDrivers) : null],
    [SESSION_KEYS.VETERAN_STATUS, a.veteranStatus],
    [SESSION_KEYS.CURRENT_AUTO_PREMIUM, a.currentAutoPremium !== null ? String(a.currentAutoPremium) : null],
    [SESSION_KEYS.CURRENT_HOME_PREMIUM, a.currentHomePremium !== null ? String(a.currentHomePremium) : null],
    // Auto wizard redesign fields
    [SESSION_KEYS.CURRENTLY_INSURED, a.currentlyInsured !== null ? JSON.stringify(a.currentlyInsured) : null],
    [SESSION_KEYS.CANOPY_MID_FUNNEL_ACCEPTED, a.canopyMidFunnelAccepted !== null ? JSON.stringify(a.canopyMidFunnelAccepted) : null],
    [SESSION_KEYS.CONTINUOUS_INSURED_DURATION, a.continuousInsuredDuration],
    [SESSION_KEYS.INCIDENT_FREE, a.incidentFree !== null ? JSON.stringify(a.incidentFree) : null],
    [SESSION_KEYS.BUNDLE_INTEREST, a.bundleInterest !== null ? JSON.stringify(a.bundleInterest) : null],
    [SESSION_KEYS.GENDER, a.gender],
    [SESSION_KEYS.OWN_OR_LEASE, a.ownOrLease],
    [SESSION_KEYS.BODILY_INJURY_LIMITS, a.bodilyInjuryLimits],
    [SESSION_KEYS.ADDRESS_CITY, a.addressCity],
    [SESSION_KEYS.ADDRESS_STATE, a.addressState],
  ];
  pairs.forEach(([k, v]) => {
    if (v != null && v !== '') {
      sessionStorage.setItem(k, v);
    } else {
      sessionStorage.removeItem(k);
    }
  });
}

// ─── Conditional Step Sequence ─────────────────────────────────────

/**
 * Compute the dynamic step sequence for the auto insurance wizard.
 * Redesigned: auto-only flow with conditional skipping.
 */
export function computeStepSequence(answers) {
  const steps = [
    'zip',
    'currentlyInsured',
    'currentAutoCarrier',
  ];

  // Canopy mid-funnel: show only if insured, has a carrier, and not yet answered
  const hasPolicy = answers.currentlyInsured !== false &&
                    answers.currentAutoCarrier &&
                    answers.currentAutoCarrier !== 'none';
  const canopyNotYetShown = answers.canopyMidFunnelAccepted === null ||
                            answers.canopyMidFunnelAccepted === undefined;
  if (hasPolicy && canopyNotYetShown) {
    steps.push('canopyMidFunnel');
  }

  // Skip duration + incident-free if not currently insured
  if (answers.currentlyInsured !== false) {
    steps.push('continuousInsured', 'incidentFree');
  }

  steps.push(
    'discountQualifier',
    'bundleOffer',
    'currentAutoPremium',
    'dob',
    'gender',
    'vehicleYear',
    'vehicleMake',
    'vehicleModel',
    'vehicleUse',
    'ownOrLease',
    'bodilyInjuryLimits',
    'contact',
    'confirmation',
  );

  return steps;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useWizard() {
  const [answers, setAnswers] = useState(() => {
    // Session cleanup on new ZIP — clear all wizard keys when ?zip= param is present
    const params = new URLSearchParams(window.location.search);
    const zipParam = params.get('zip');
    if (zipParam?.length === 5) {
      Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
    }
    return restore();
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    // If a valid ?zip= param is present, start at step 1 (skip ZIP step)
    const params = new URLSearchParams(window.location.search);
    const zip = params.get('zip');
    if (zip?.length === 5) return 1;
    // Otherwise restore from session or default to 0
    const saved = parseInt(sessionStorage.getItem(SESSION_KEYS.CURRENT_STEP) || '0', 10);
    return saved > 0 ? saved : 0;
  });
  const [direction, setDirection] = useState('forward');
  const stepEnteredAt = useRef(Date.now());

  const stepSequence = useMemo(() => computeStepSequence(answers), [answers]);
  const currentStepId = stepSequence[currentIndex] || 'zip';
  const totalSteps = stepSequence.length;
  const progress = totalSteps > 1 ? (currentIndex + 1) / totalSteps : 0;
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex >= stepSequence.length - 1;



  const setAnswer = useCallback((field, value) => {
    setAnswers(prev => {
      const next = { ...prev, [field]: value };

      // Currently insured = false → set continuousInsuredDuration to 'never' and clear incidentFree
      if (field === 'currentlyInsured' && value === false) {
        next.continuousInsuredDuration = 'never';
        next.incidentFree = null;
      }

      // Renter or Other → clear home-specific data, reset invalid product intent
      if (field === 'ownsHome' && (value === false || value === 'other')) {
        if (prev.productIntent === 'home' || prev.productIntent === 'bundle') {
          next.productIntent = null;
        }
        next.currentHomeCarrier = null;
        next.homeClaimsHistory = null;
      }
      // Owner → clear renters carrier if switching from renter/other
      if (field === 'ownsHome' && value === true) {
        // 'renters' is legacy pre-v2.1 — kept for in-flight sessions
        if (prev.productIntent === 'renters' || prev.productIntent === 'auto_renters') {
          next.productIntent = null;
        }
        next.currentRentersCarrier = null;
      }

      // Product intent change → clear irrelevant downstream answers
      if (field === 'productIntent') {
        if (value !== 'auto' && value !== 'bundle' && value !== 'auto_renters') {
          next.currentAutoCarrier = null;
          next.currentAutoPremium = null;
          next.autoDrivingRecord = null;
          next.coverageLapse = null;
          next.vehicleYear = null;
          next.vehicleMake = null;
          next.vehicleModel = null;
          next.vehicleUse = [];
        }
        if (value !== 'home' && value !== 'bundle') {
          next.currentHomeCarrier = null;
          next.currentHomePremium = null;
          next.homeClaimsHistory = null;
        }
        if (value !== 'auto_renters') {
          next.currentRentersCarrier = null;
        }
      }

      // Early phone → sync to contact phone field for pre-fill
      if (field === 'earlyPhone' && value) {
        next.phone = value;
      }

      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    const timeMs = Date.now() - stepEnteredAt.current;
    stepEnteredAt.current = Date.now();
    setDirection('forward');
    setAnswers(prev => { persistToSession(prev); return prev; });
    setCurrentIndex(prev => {
      const next = Math.min(prev + 1, stepSequence.length - 1);
      sessionStorage.setItem(SESSION_KEYS.CURRENT_STEP, String(next));
      return next;
    });
    return timeMs;
  }, [stepSequence.length]);

  const goBack = useCallback(() => {
    const timeMs = Date.now() - stepEnteredAt.current;
    stepEnteredAt.current = Date.now();
    setDirection('back');
    setCurrentIndex(prev => {
      const next = Math.max(prev - 1, 0);
      sessionStorage.setItem(SESSION_KEYS.CURRENT_STEP, String(next));
      return next;
    });
    return timeMs;
  }, []);

  const persistAll = useCallback(() => persistToSession(answers), [answers]);

  // UX-4: Updated renter product intent options
  const productIntentOptions = useMemo(() => {
    if (answers.ownsHome === false || answers.ownsHome === 'other') {
      return [
        { label: 'Auto Only', value: 'auto', emoji: '🚗' },
        { label: 'Auto + Renters', value: 'auto_renters', emoji: '🚗🏠' },
      ];
    }
    return [
      { label: 'Auto Only', value: 'auto', emoji: '🚗' },
      { label: 'Home Only', value: 'home', emoji: '🏠' },
      { label: 'Bundle', value: 'bundle', emoji: '🚗🏠' },
      { label: 'Not Sure', value: 'unsure', emoji: '🤔' },
    ];
  }, [answers.ownsHome]);

  return {
    answers,
    setAnswer,
    currentStepId,
    currentIndex,
    setCurrentIndex,  // needed for ZIP prefill skip
    totalSteps,
    progress,
    isFirstStep,
    isLastStep,
    direction,
    goNext,
    goBack,
    persistAll,
    stepSequence,
    productIntentOptions,
    stepEnteredAt,
  };
}
