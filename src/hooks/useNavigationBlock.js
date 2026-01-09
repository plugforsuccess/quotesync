import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Navigation Block Hook
 * Prevents users from accidentally leaving the page with unsaved changes
 *
 * @param {boolean} shouldBlock - Whether to block navigation (e.g., isDirty)
 * @param {string} message - Custom warning message
 * @returns {object} Blocker state and controls
 */
export function useNavigationBlock(shouldBlock, message = 'You have unsaved changes. Are you sure you want to leave?') {
  // Block in-app navigation (React Router)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname
  );

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

  /**
   * Programmatically proceed with blocked navigation
   */
  const proceed = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  /**
   * Cancel blocked navigation
   */
  const reset = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    blocker,
    proceed,
    reset,
    isBlocked: blocker.state === 'blocked',
  };
}

export default useNavigationBlock;
