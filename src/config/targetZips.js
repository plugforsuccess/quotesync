// src/config/targetZips.js
// Target ZIP codes — MT-08: multi-state support via buildZipValidator

export const TARGET_ZIPS = [];

// State-to-ZIP regex map — expand as agencies expand
const STATE_ZIP_RANGES = {
  GA: /^3(0[0-9]|1[0-9]|98|99)\d{2}$/,
  TX: /^7[5-9]\d{3}$|^8[0-1]\d{3}$/,
  FL: /^3[2-4]\d{3}$/,
  AL: /^3[5-6]\d{3}$/,
  SC: /^29\d{3}$/,
  NC: /^2[7-8]\d{3}$/,
  TN: /^3[7-8]\d{3}$/,
};

/**
 * Build a ZIP validator for the given licensed states.
 * Returns a function (zip) => boolean.
 */
export function buildZipValidator(licensedStates = ['GA']) {
  return function isTargetZipForStates(zip) {
    if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return false;
    return licensedStates.some(state => STATE_ZIP_RANGES[state]?.test(zip));
  };
}

/**
 * Derive state code from ZIP prefix.
 * Returns 2-letter state code or null.
 */
export function getStateFromZip(zip) {
  if (!zip || zip.length < 3) return null;
  for (const [state, regex] of Object.entries(STATE_ZIP_RANGES)) {
    // Pad to 5 digits for regex test
    const padded = zip.length === 5 ? zip : zip.padEnd(5, '0');
    if (regex.test(padded)) return state;
  }
  return null;
}

// Default isTargetZip — Georgia only (backward compat)
export const isTargetZip = buildZipValidator(['GA']);
