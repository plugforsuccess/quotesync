// src/utils/cacheVersion.js
// Cache version management to prevent stale data issues

// Update this version whenever you make breaking changes to:
// - API structure
// - localStorage schema
// - IndexedDB schema
// - Data models
const CACHE_VERSION = '1.2.0'; // MT-08: multi-tenancy storage key rename
const BUILD_TIMESTAMP = new Date().toISOString();

// Get build info (git SHA will be injected at build time via env var)
const BUILD_SHA = import.meta.env.VITE_GIT_SHA || 'dev';

const CACHE_VERSION_KEY = 'quotesync_cache_version';
const APP_DATA_KEYS = [
  'quotesync_draft_',     // Draft storage fallback prefix
  'qs_validated_zip',            // ZIP validation
  'insuredbycam_validated_zip',  // Legacy key cleanup
  // Add more app-specific keys here as needed
];

/**
 * Check if the cache version matches and clear if needed
 * Call this on app startup
 */
export const validateCacheVersion = () => {
  try {
    const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);

    if (storedVersion !== CACHE_VERSION) {
      console.warn(`[Cache] Version mismatch: stored=${storedVersion}, current=${CACHE_VERSION}`);
      console.warn('[Cache] Clearing app-specific localStorage keys...');

      // Clear only app-specific keys, not all localStorage
      APP_DATA_KEYS.forEach(keyPrefix => {
        // Find all keys that match this prefix
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(keyPrefix)) {
            console.log(`[Cache] Removing: ${key}`);
            localStorage.removeItem(key);
          }
        });
      });

      // Remove exact match keys
      APP_DATA_KEYS.forEach(exactKey => {
        if (localStorage.getItem(exactKey)) {
          console.log(`[Cache] Removing: ${exactKey}`);
          localStorage.removeItem(exactKey);
        }
      });

      // Update to current version
      localStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);

      console.log(`[Cache] Updated to version ${CACHE_VERSION}`);
      return true; // Cache was invalidated
    }

    return false; // Cache is valid
  } catch (error) {
    console.error('[Cache] Error validating cache version:', error);
    return false;
  }
};

/**
 * Force clear all app data (for admin "Reset App" button)
 */
export const clearAllAppData = async () => {
  try {
    console.log('[Cache] Force clearing all app data...');

    // Clear localStorage
    APP_DATA_KEYS.forEach(keyPrefix => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(keyPrefix)) {
          localStorage.removeItem(key);
        }
      });
    });

    // Clear IndexedDB (QuoteSyncDrafts)
    if ('indexedDB' in window) {
      const dbs = await window.indexedDB.databases?.() || [];
      for (const db of dbs) {
        if (db.name === 'QuoteSyncDrafts') {
          console.log('[Cache] Deleting IndexedDB: QuoteSyncDrafts');
          window.indexedDB.deleteDatabase('QuoteSyncDrafts');
        }
      }
    }

    // Clear sessionStorage
    const analyticsSessionKey = 'newsroom_session_id';
    sessionStorage.removeItem(analyticsSessionKey);

    console.log('[Cache] All app data cleared');
    return true;
  } catch (error) {
    console.error('[Cache] Error clearing app data:', error);
    throw error;
  }
};

/**
 * Get build info for debugging
 */
export const getBuildInfo = () => ({
  version: CACHE_VERSION,
  sha: BUILD_SHA,
  timestamp: BUILD_TIMESTAMP
});

/**
 * Get formatted build string for display
 */
export const getBuildString = () => {
  const info = getBuildInfo();
  if (info.sha === 'dev') {
    return `v${info.version} (dev)`;
  }
  return `v${info.version} (${info.sha.substring(0, 7)})`;
};
