// src/hooks/useWizard.js — Wizard state + conditional branching for /save funnel v2
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

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
  CURRENT_STEP: 'qs_funnel_current_step',
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
 *
 * Step 1: zip
 * Step 2: ownsHome
 * Step 3: productIntent (options differ for owner vs renter)
 * Step 4: carrier(s) — conditional, skipped for "unsure"
 * Step 5: risk — conditional, skipped for renters / unsure
 * Step 6: vehicleCount — skipped for home-only
 * Step 7: maritalStatus
 * Step 8: dob
 * Step 9: address
 * Step 10: contact
 * Step 11: confirmation
 */
export function computeStepSequence(answers) {
  const steps = ['zip', 'ownsHome', 'productIntent'];

  const intent = answers.productIntent;
  const isOwner = answers.ownsHome === true;

  // Step 4: Carriers
  if (intent === 'auto') {
    steps.push('currentAutoCarrier');
  } else if (intent === 'home' && isOwner) {
    steps.push('currentHomeCarrier');
  } else if (intent === 'auto_renters') {
    steps.push('currentAutoCarrier', 'currentRentersCarrier');
  } else if (intent === 'bundle' && isOwner) {
    steps.push('currentAutoCarrier', 'currentHomeCarrier');
  }
  // 'unsure' → skip carriers entirely

  // Step 5: Risk screening
  if (intent === 'auto' || intent === 'auto_renters') {
    steps.push('autoDrivingRecord');
  } else if (intent === 'home' && isOwner) {
    steps.push('homeClaimsHistory');
  } else if (intent === 'bundle' && isOwner) {
    steps.push('autoDrivingRecord', 'homeClaimsHistory');
  }
  // 'unsure' → skip risk

  // Step 6: Vehicle count — skip if home-only
  if (intent !== 'home') {
    steps.push('vehicleCount');
  }

  // Step 7: Marital status (NEW-1)
  steps.push('maritalStatus');

  // Steps 8-11
  steps.push('dob', 'address', 'contact', 'confirmation');

  return steps;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useWizard() {
  const [answers, setAnswers] = useState(restore);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState('forward');
  const hasRestoredStep = useRef(false);

  const stepSequence = useMemo(() => computeStepSequence(answers), [answers]);
  const currentStepId = stepSequence[currentIndex] || 'zip';
  const totalSteps = stepSequence.length;
  const progress = totalSteps > 1 ? (currentIndex + 1) / totalSteps : 0;
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex >= stepSequence.length - 1;

  // C-3: Restore step index on page refresh (one-time on mount)
  useEffect(() => {
    if (!hasRestoredStep.current) {
      hasRestoredStep.current = true;
      const saved = parseInt(sessionStorage.getItem(SESSION_KEYS.CURRENT_STEP) || '0', 10);
      if (saved > 0 && saved < stepSequence.length) {
        setCurrentIndex(saved);
      }
    }
  }, [stepSequence.length]);

  const setAnswer = useCallback((field, value) => {
    setAnswers(prev => {
      const next = { ...prev, [field]: value };

      // Renter → clear home-specific data, reset invalid product intent
      if (field === 'ownsHome' && value === false) {
        if (prev.productIntent === 'home' || prev.productIntent === 'bundle') {
          next.productIntent = null;
        }
        next.currentHomeCarrier = null;
        next.homeClaimsHistory = null;
      }
      // Owner → clear renters carrier if switching from renter
      if (field === 'ownsHome' && value === true) {
        if (prev.productIntent === 'renters' || prev.productIntent === 'auto_renters') {
          next.productIntent = null;
        }
        next.currentRentersCarrier = null;
      }

      // Product intent change → clear irrelevant downstream answers
      if (field === 'productIntent') {
        if (value !== 'auto' && value !== 'bundle' && value !== 'auto_renters') {
          next.currentAutoCarrier = null;
          next.autoDrivingRecord = null;
        }
        if (value !== 'home' && value !== 'bundle') {
          next.currentHomeCarrier = null;
          next.homeClaimsHistory = null;
        }
        if (value !== 'auto_renters') {
          next.currentRentersCarrier = null;
        }
        if (value === 'home') {
          next.vehicleCount = null;
        }
      }

      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    setDirection('forward');
    setAnswers(prev => { persistToSession(prev); return prev; });
    setCurrentIndex(prev => {
      const next = Math.min(prev + 1, stepSequence.length - 1);
      sessionStorage.setItem(SESSION_KEYS.CURRENT_STEP, String(next));
      return next;
    });
  }, [stepSequence.length]);

  const goBack = useCallback(() => {
    setDirection('back');
    setCurrentIndex(prev => {
      const next = Math.max(prev - 1, 0);
      sessionStorage.setItem(SESSION_KEYS.CURRENT_STEP, String(next));
      return next;
    });
  }, []);

  const persistAll = useCallback(() => persistToSession(answers), [answers]);

  // UX-4: Updated renter product intent options
  const productIntentOptions = useMemo(() => {
    if (answers.ownsHome === false) {
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
  };
}
