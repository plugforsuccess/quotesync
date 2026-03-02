/**
 * Leads API - Client-side utilities for lead creation
 */

// Edge function URL - configure in environment
const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lead`
  : '/functions/v1/create-lead';

/**
 * Generates or retrieves session ID for attribution tracking
 * @returns {string} Session ID
 */
export function getSessionId() {
  const STORAGE_KEY = 'insuredbycam_session_id';
  let sessionId = sessionStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  }

  return sessionId;
}

// F-05 fix: Sanitize UTM values — truncate to 256 chars and strip HTML tags
function sanitizeUtm(val) {
  if (!val) return null;
  return val.slice(0, 256).replace(/<[^>]*>/g, '');
}

/**
 * Extracts UTM parameters from current URL (sanitized)
 * @returns {Object} UTM parameters
 */
export function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: sanitizeUtm(params.get('utm_source')),
    utm_medium: sanitizeUtm(params.get('utm_medium')),
    utm_campaign: sanitizeUtm(params.get('utm_campaign')),
    utm_content: sanitizeUtm(params.get('utm_content')),
    utm_term: sanitizeUtm(params.get('utm_term')),
    referral_code: sanitizeUtm(params.get('ref') || params.get('referral_code')),
  };
}

/**
 * Gets the validated ZIP from localStorage
 * @returns {Object|null} { zip, state } or null
 */
export function getValidatedLocation() {
  const STORAGE_KEY = 'insuredbycam_validated_zip';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // We store zip, need to derive state (for now, return zip only)
      return { zip: data.zip, state: data.state || null };
    }
  } catch (e) {
    console.error('Failed to get validated location:', e);
  }
  return null;
}

/**
 * Creates a lead record from Canopy completion
 * @param {Object} params - Lead creation parameters
 * @param {string} params.pullId - Canopy pull ID (required)
 * @param {string} params.state - 2-letter state code (required)
 * @param {string} params.zip - ZIP code (required)
 * @param {string} [params.productIntent] - Optional product intent
 * @returns {Promise<Object>} Lead creation result
 */
export async function createLeadFromCanopy({ pullId, state, zip, productIntent }) {
  if (!pullId || !state || !zip) {
    throw new Error('pullId, state, and zip are required');
  }

  const sessionId = getSessionId();
  const utmParams = getUtmParams();

  const payload = {
    pull_id: pullId,
    state: state.toUpperCase(),
    zip,
    session_id: sessionId,
    product_intent: productIntent || null,
    landing_page: window.location.pathname,
    ...utmParams,
  };

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create lead');
  }

  return data;
}
