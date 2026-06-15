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
  HOME_INSURANCE_STATUS: 'qs_funnel_home_insurance_status',
  HOME_OCCUPANCY_TYPE: 'qs_funnel_home_occupancy_type',
  ROOF_REPLACED_RECENTLY: 'qs_funnel_roof_replaced_recently',
  YEAR_BUILT: 'qs_funnel_year_built',
  SQUARE_FOOTAGE: 'qs_funnel_square_footage',
  STORIES: 'qs_funnel_stories',
  CANOPY_HOME_SHOWN: 'qs_funnel_canopy_home_shown',
  CANOPY_HOME_SYNCED: 'qs_funnel_canopy_home_synced',
  PROPERTY_DATA_SOURCE: 'qs_funnel_property_data_source',
  INTAKE_MODE: 'qs_funnel_intake_mode',
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
    homeInsuranceStatus: sessionStorage.getItem(SESSION_KEYS.HOME_INSURANCE_STATUS) || null,
    homeOccupancyType: sessionStorage.getItem(SESSION_KEYS.HOME_OCCUPANCY_TYPE) || null,
    roofReplacedRecently: jp(sessionStorage.getItem(SESSION_KEYS.ROOF_REPLACED_RECENTLY), null),
    yearBuilt: jp(sessionStorage.getItem(SESSION_KEYS.YEAR_BUILT), null),
    squareFootage: jp(sessionStorage.getItem(SESSION_KEYS.SQUARE_FOOTAGE), null),
    stories: sessionStorage.getItem(SESSION_KEYS.STORIES) || null,
    canopyHomeSynced: jp(sessionStorage.getItem(SESSION_KEYS.CANOPY_HOME_SYNCED), false),
    propertyDataSource: sessionStorage.getItem(SESSION_KEYS.PROPERTY_DATA_SOURCE) || null,
    intakeMode: sessionStorage.getItem(SESSION_KEYS.INTAKE_MODE) || null,
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
    [SESSION_KEYS.HOME_INSURANCE_STATUS, a.homeInsuranceStatus],
    [SESSION_KEYS.HOME_OCCUPANCY_TYPE, a.homeOccupancyType],
    [SESSION_KEYS.ROOF_REPLACED_RECENTLY, a.roofReplacedRecently !== null ? JSON.stringify(a.roofReplacedRecently) : null],
    [SESSION_KEYS.YEAR_BUILT, a.yearBuilt !== null ? JSON.stringify(a.yearBuilt) : null],
    [SESSION_KEYS.SQUARE_FOOTAGE, a.squareFootage !== null ? JSON.stringify(a.squareFootage) : null],
    [SESSION_KEYS.STORIES, a.stories],
    [SESSION_KEYS.CANOPY_HOME_SYNCED, JSON.stringify(a.canopyHomeSynced)],
    [SESSION_KEYS.PROPERTY_DATA_SOURCE, a.propertyDataSource],
    [SESSION_KEYS.INTAKE_MODE, a.intakeMode],
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
 * Compute the dynamic step sequence based on current answers.
 * Enrichment v2: discountQualifier replaces ownsHome + maritalStatus + vehicleCount steps.
 * New steps: veteranStatus, premium capture, coverage lapse, vehicle details.
 */
export function computeStepSequence(answers) {
  // ZIP first (routing + eligibility + creates the partial lead), then the
  // dec-page fast-path offer.
  const steps = ['zip', 'decUpload'];

  // Fast path: if the lead uploaded their declarations page(s), skip the manual
  // questionnaire entirely — premium/coverages/vehicles/etc. are read from the
  // document, so we only still need contact info + TCPA consent.
  if (answers.intakeMode === 'upload') {
    steps.push('contact', 'confirmation');
    return steps;
  }

  steps.push('discountQualifier', 'veteranStatus', 'productIntent', 'earlyPhone');

  const intent = answers.productIntent;
  const isOwner = answers.ownsHome === true;

  if (intent === 'auto') {
    steps.push(
      'currentAutoCarrier', 'currentAutoPremium',
      'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleUse',
      'coverageLapse', 'autoDrivingRecord'
    );
  } else if (intent === 'home' && isOwner) {
    steps.push(
      'currentHomeCarrier',
      'canopyHome',
      'currentHomePremium',
      'homeInsuranceStatus',
      'homeOccupancyType',
      'roofReplacedRecently',
      'propertyDetails',
      'homeClaimsHistory'
    );
  } else if (intent === 'auto_renters') {
    steps.push(
      'currentAutoCarrier', 'currentAutoPremium',
      'currentRentersCarrier',
      'coverageLapse',
      'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleUse',
      'autoDrivingRecord'
    );
  } else if (intent === 'bundle' && isOwner) {
    steps.push(
      'currentHomeCarrier',
      'canopyHome',
      'currentHomePremium',
      'homeInsuranceStatus',
      'homeOccupancyType',
      'roofReplacedRecently',
      'propertyDetails',
      'homeClaimsHistory',
      'currentAutoCarrier', 'currentAutoPremium',
      'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleUse',
      'coverageLapse', 'autoDrivingRecord'
    );
  } else if (intent === 'landlord') {
    // Capture-only rental path: collect enough property detail for an
    // agent to work and route the lead. Dwelling fire isn't rated online.
    steps.push(
      'propertyDetails',
      'roofReplacedRecently',
      'homeClaimsHistory'
    );
  }
  // 'unsure' or null → no carrier, no premium, no vehicle steps

  steps.push('dob', 'address', 'contact', 'confirmation');
  return steps;
}

// Longest journey across all product paths. Used as a conservative denominator
// for the progress bar BEFORE a product is chosen — the eventual length is
// unknown and varies a lot (a bundle is ~25 steps, auto-only ~13), so dividing
// by the max keeps early steps from over-reporting. Computed from the step
// builder so it can't drift out of sync if steps are added.
const PATH_PROBES = [
  { productIntent: 'bundle', ownsHome: true },
  { productIntent: 'auto', ownsHome: true },
  { productIntent: 'auto_renters', ownsHome: false },
  { productIntent: 'home', ownsHome: true },
  { productIntent: 'landlord', ownsHome: true },
];
export const MAX_STEP_COUNT = Math.max(
  ...PATH_PROBES.map((p) => computeStepSequence(p).length)
);

// ─── Hook ──────────────────────────────────────────────────────────

export function useWizard() {
  const [answers, setAnswers] = useState(restore);
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

  // Progress percentage for the bar. Before a product is chosen the path length
  // is unknown and short (~9 steps), so dividing by it over-reports (e.g. the
  // discount step would show 25% of a journey that's really ~8% done for a
  // bundle). Use the longest path as the denominator until the product is known,
  // then switch to the real length so it still reaches ~100% at the end.
  const progressPct = useMemo(() => {
    // The path is "known" once the lead picks a product OR takes the upload
    // fast-path; until then, divide by the longest path so we don't over-report.
    const pathKnown = !!answers.productIntent || answers.intakeMode === 'upload';
    const effectiveTotal = pathKnown ? totalSteps : Math.max(totalSteps, MAX_STEP_COUNT);
    const denom = effectiveTotal - 1;
    if (denom <= 0) return 0;
    return Math.min(Math.round(((currentIndex + 1) / denom) * 100), 99);
  }, [answers.productIntent, answers.intakeMode, totalSteps, currentIndex]);



  const setAnswer = useCallback((field, value) => {
    setAnswers(prev => {
      const next = { ...prev, [field]: value };

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
        if (value !== 'home' && value !== 'bundle' && value !== 'landlord') {
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

      // Rental occupancy → auto-route to landlord product intent
      if (field === 'homeOccupancyType' && value === 'rental') {
        next.productIntent = 'landlord';
      }
      // Landlord intent → flag the property as a rental so it routes and
      // maps to a dwelling/landlord lead server-side.
      if (field === 'productIntent' && value === 'landlord') {
        next.homeOccupancyType = 'rental';
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
      let next = prev + 1;
      // Skip canopyHome if carrier is "none" or not set
      const nextStepId = stepSequence[next];
      if (nextStepId === 'canopyHome' &&
          (!answers.currentHomeCarrier || answers.currentHomeCarrier === 'none')) {
        next += 1;
      }
      // Skip currentHomePremium if Canopy already synced
      const nextStepId2 = stepSequence[next];
      if (nextStepId2 === 'currentHomePremium' && answers.canopyHomeSynced) {
        next += 1;
      }
      next = Math.min(next, stepSequence.length - 1);
      sessionStorage.setItem(SESSION_KEYS.CURRENT_STEP, String(next));
      return next;
    });
    return timeMs;
  }, [stepSequence, answers.currentHomeCarrier, answers.canopyHomeSynced]);

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
        { label: 'Landlord / Rental Property', value: 'landlord', emoji: '🔑' },
      ];
    }
    return [
      { label: 'Auto Only', value: 'auto', emoji: '🚗' },
      { label: 'Home Only', value: 'home', emoji: '🏠' },
      { label: 'Bundle', value: 'bundle', emoji: '🚗🏠' },
      { label: 'Landlord / Rental Property', value: 'landlord', emoji: '🔑' },
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
    progressPct,
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
