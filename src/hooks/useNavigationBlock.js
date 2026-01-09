import { useEffect, useCallback } from 'react';

/**
 * Navigation Block Hook
 * Prevents users from accidentally leaving the page with unsaved changes
 *
 * Note: useBlocker requires data router (createBrowserRouter), not BrowserRouter
 * Currently only blocking browser navigation via beforeunload
 *
 * @param {boolean} shouldBlock - Whether to block navigation (e.g., isDirty)
 * @param {string} message - Custom warning message
 * @returns {object} Blocker state and controls
 */
export function useNavigationBlock(shouldBlock, message = 'You have unsaved changes. Are you sure you want to leave?') {
  /**
   * Block browser navigation (beforeunload)
   * Note: Modern browsers ignore custom messages for security reasons
   */
  useEffect(() => {
    if (!shouldBlock) return;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      // Modern browsers require returnValue to be set
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlock, message]);

  // Return stub functions for compatibility
  const proceed = useCallback(() => {
    // No-op: would proceed with blocked navigation if useBlocker was active
  }, []);

  const reset = useCallback(() => {
    // No-op: would reset blocked navigation if useBlocker was active
  }, []);

  return {
    blocker: { state: 'unblocked' },
    proceed,
    reset,
    isBlocked: false,
  };
}

export default useNavigationBlock;
