// src/hooks/useCanopyLauncher.js
// Reusable hook to launch Canopy Connect widget

import { useCallback } from 'react';
import { trackEvent } from '../lib/analytics';

export function useCanopyLauncher() {
  const launchCanopy = useCallback((source = 'unknown') => {
    trackEvent('canopy_upsell_clicked', { page: source });

    const canopyLink = document.createElement('a');
    canopyLink.className = 'canopy-connect-embed';
    canopyLink.href = 'https://app.usecanopy.com/c/insuredbycam';
    canopyLink.style.display = 'none';
    document.body.appendChild(canopyLink);
    canopyLink.click();
    setTimeout(() => document.body.removeChild(canopyLink), 100);
  }, []);

  return { launchCanopy };
}
