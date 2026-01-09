/**
 * IndexedDB Draft Storage Utility
 * Provides offline-safe, instant draft persistence for the story editor
 *
 * Storage Strategy:
 * - Database: 'QuoteSyncDrafts'
 * - Store: 'story_drafts'
 * - Key: story ID or 'new-story' for unsaved stories
 * - Auto-cleanup: Drafts older than 90 days
 */

const DB_NAME = 'QuoteSyncDrafts';
const DB_VERSION = 1;
const STORE_NAME = 'story_drafts';
const NEW_STORY_KEY = 'new-story';
const MAX_DRAFT_AGE_DAYS = 90;

// Safe JSON stringify that handles circular references
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

/**
 * Initialize IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    // Check for IndexedDB support
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported, draft autosave will use fallback');
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'draftKey' });

        // Create indexes for faster queries
        objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        objectStore.createIndex('authorId', 'authorId', { unique: false });

        console.log('IndexedDB store created successfully');
      }
    };
  });
}

/**
 * Save a draft to IndexedDB
 * @param {string|null} storyId - Story ID or null for new stories
 * @param {object} draftData - Draft content
 * @param {string} authorId - Current user ID
 * @returns {Promise<void>}
 */
export async function saveDraftLocally(storyId, draftData, authorId) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const draftKey = storyId || NEW_STORY_KEY;

    const draft = {
      draftKey,
      storyId,
      authorId,
      ...draftData,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(draft);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Draft saved locally: ${draftKey}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Error saving draft locally:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB save error:', error);
    // Fallback to localStorage if IndexedDB fails
    await saveDraftToLocalStorage(storyId, draftData, authorId);
  }
}

/**
 * Retrieve a draft from IndexedDB
 * @param {string|null} storyId - Story ID or null for new stories
 * @returns {Promise<object|null>}
 */
export async function getDraftLocally(storyId) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const draftKey = storyId || NEW_STORY_KEY;
    const request = store.get(draftKey);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const draft = request.result;

        if (draft) {
          // Check if draft is too old
          const draftAge = Date.now() - new Date(draft.updatedAt).getTime();
          const maxAge = MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;

          if (draftAge > maxAge) {
            console.log('Draft too old, ignoring:', draftKey);
            resolve(null);
          } else {
            console.log(`Draft retrieved locally: ${draftKey}`);
            resolve(draft);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('Error retrieving draft locally:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB retrieve error:', error);
    // Fallback to localStorage
    return getDraftFromLocalStorage(storyId);
  }
}

/**
 * Delete a draft from IndexedDB
 * @param {string|null} storyId - Story ID or null for new stories
 * @returns {Promise<void>}
 */
export async function deleteDraftLocally(storyId) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const draftKey = storyId || NEW_STORY_KEY;
    const request = store.delete(draftKey);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Draft deleted locally: ${draftKey}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Error deleting draft locally:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB delete error:', error);
    // Fallback to localStorage
    deleteDraftFromLocalStorage(storyId);
  }
}

/**
 * Get all drafts for a specific author
 * @param {string} authorId - Author user ID
 * @returns {Promise<Array>}
 */
export async function getAllDraftsLocally(authorId) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('authorId');

    const request = index.getAll(authorId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const drafts = request.result || [];

        // Filter out old drafts
        const maxAge = MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;
        const validDrafts = drafts.filter(draft => {
          const draftAge = Date.now() - new Date(draft.updatedAt).getTime();
          return draftAge <= maxAge;
        });

        console.log(`Retrieved ${validDrafts.length} local drafts for author`);
        resolve(validDrafts);
      };

      request.onerror = () => {
        console.error('Error retrieving all drafts:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB getAll error:', error);
    return [];
  }
}

/**
 * Clean up old drafts (older than MAX_DRAFT_AGE_DAYS)
 * @returns {Promise<number>} Number of drafts deleted
 */
export async function cleanupOldDrafts() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.openCursor();
    let deletedCount = 0;
    const maxAge = MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          const draft = cursor.value;
          const draftAge = Date.now() - new Date(draft.updatedAt).getTime();

          if (draftAge > maxAge) {
            cursor.delete();
            deletedCount++;
          }

          cursor.continue();
        } else {
          // No more entries
          console.log(`Cleaned up ${deletedCount} old drafts`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('Error cleaning up drafts:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB cleanup error:', error);
    return 0;
  }
}

// ============================================
// LOCALSTORAGE FALLBACK
// (For browsers that don't support IndexedDB)
// ============================================

const LS_PREFIX = 'quotesync_draft_';

/**
 * Fallback: Save draft to localStorage
 */
async function saveDraftToLocalStorage(storyId, draftData, authorId) {
  try {
    const key = `${LS_PREFIX}${storyId || NEW_STORY_KEY}`;
    const draft = {
      storyId,
      authorId,
      ...draftData,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(key, safeStringify(draft));
    console.log(`Draft saved to localStorage: ${key}`);
  } catch (error) {
    // localStorage quota exceeded or disabled
    console.error('localStorage save error:', error);
  }
}

/**
 * Fallback: Get draft from localStorage
 */
function getDraftFromLocalStorage(storyId) {
  try {
    const key = `${LS_PREFIX}${storyId || NEW_STORY_KEY}`;
    const data = localStorage.getItem(key);

    if (!data) return null;

    const draft = JSON.parse(data);

    // Check age
    const draftAge = Date.now() - new Date(draft.updatedAt).getTime();
    const maxAge = MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (draftAge > maxAge) {
      localStorage.removeItem(key);
      return null;
    }

    console.log(`Draft retrieved from localStorage: ${key}`);
    return draft;
  } catch (error) {
    console.error('localStorage retrieve error:', error);
    return null;
  }
}

/**
 * Fallback: Delete draft from localStorage
 */
function deleteDraftFromLocalStorage(storyId) {
  try {
    const key = `${LS_PREFIX}${storyId || NEW_STORY_KEY}`;
    localStorage.removeItem(key);
    console.log(`Draft deleted from localStorage: ${key}`);
  } catch (error) {
    console.error('localStorage delete error:', error);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if there's a local draft available
 * @param {string|null} storyId - Story ID or null for new stories
 * @returns {Promise<boolean>}
 */
export async function hasDraftLocally(storyId) {
  const draft = await getDraftLocally(storyId);
  return draft !== null;
}

/**
 * Get the timestamp of the local draft
 * @param {string|null} storyId - Story ID or null for new stories
 * @returns {Promise<Date|null>}
 */
export async function getDraftTimestamp(storyId) {
  const draft = await getDraftLocally(storyId);
  return draft ? new Date(draft.updatedAt) : null;
}

/**
 * Clear all local drafts (use with caution)
 * @returns {Promise<void>}
 */
export async function clearAllDraftsLocally() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('All local drafts cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('Error clearing drafts:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('IndexedDB clear error:', error);
    // Fallback: clear localStorage drafts
    Object.keys(localStorage)
      .filter(key => key.startsWith(LS_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }
}

export default {
  saveDraftLocally,
  getDraftLocally,
  deleteDraftLocally,
  getAllDraftsLocally,
  cleanupOldDrafts,
  hasDraftLocally,
  getDraftTimestamp,
  clearAllDraftsLocally,
  NEW_STORY_KEY,
};
