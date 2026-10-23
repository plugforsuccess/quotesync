/**
 * Hook to handle Canopy Connect completion events
 * Listens for postMessage from Canopy iframe and creates lead
 */
import { useEffect, useCallback, useRef } from 'react';
import { createLeadFromCanopy, getValidatedLocation } from '../lib/leadsApi';
import { trackQuoteCompleted } from '../lib/analytics';

/**
 * Custom hook that listens for Canopy Connect completion
 * @param {Object} options
 * @param {Function} options.onSuccess - Called when lead is created successfully
 * @param {Function} options.onError - Called on error
 * @returns {Object} { triggerManualComplete }
 */
export function useCanopyComplete({ onSuccess, onError } = {}) {
  const processingRef = useRef(false);

  const handleCanopyComplete = useCallback(async (pullId, state, zip) => {
    // Prevent duplicate processing
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const result = await createLeadFromCanopy({
        pullId,
        state,
        zip,
      });

      // Track analytics
      trackQuoteCompleted();

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('Failed to create lead:', error);
      if (onError) {
        onError(error);
      }
    } finally {
      processingRef.current = false;
    }
  }, [onSuccess, onError]);

  useEffect(() => {
    const handleMessage = (event) => {
      // Validate origin (Canopy's domain)
      if (!event.origin.includes('usecanopy.com')) return;

      const data = event.data;

      // Handle Canopy completion message
      // Canopy sends various message types; we care about 'complete' or 'success'
      if (data && (data.type === 'canopy-complete' || data.event === 'complete')) {
        const pullId = data.pull_id || data.pullId;

        if (pullId) {
          // Get location from storage or from the event
          const location = getValidatedLocation();
          const state = data.state || location?.state || 'GA'; // Default to GA
          const zip = data.zip || location?.zip || '';

          if (zip) {
            handleCanopyComplete(pullId, state, zip);
          } else {
            console.warn('Canopy complete but no ZIP available');
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleCanopyComplete]);

  // Allow manual trigger for testing or alternative flows
  const triggerManualComplete = useCallback((pullId, state, zip) => {
    handleCanopyComplete(pullId, state, zip);
  }, [handleCanopyComplete]);

  return { triggerManualComplete };
}
