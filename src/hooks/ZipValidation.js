// src/hooks/zipValidation.js
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'insuredbycam_validated_zip';
const EXPIRY_HOURS = 24;

export const useZipValidation = () => {
  const [validatedZip, setValidatedZip] = useState(null);
  const [showValidator, setShowValidator] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { zip, timestamp } = JSON.parse(stored);
        const hoursElapsed = (Date.now() - timestamp) / (1000 * 60 * 60);
        
        if (hoursElapsed < EXPIRY_HOURS) {
          setValidatedZip(zip);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const handleValidZip = (zip) => {
    const data = { zip, timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setValidatedZip(zip);
    setShowValidator(false);
  };

  const requestCanopyConnect = (onProceed) => {
    if (validatedZip) {
      onProceed();
    } else {
      setShowValidator(true);
      window.__canopyConnectCallback = onProceed;
    }
  };

  const handleValidatorSuccess = (zip) => {
    handleValidZip(zip);
    if (window.__canopyConnectCallback) {
      window.__canopyConnectCallback();
      window.__canopyConnectCallback = null;
    }
  };

  const closeValidator = () => {
    setShowValidator(false);
    window.__canopyConnectCallback = null;
  };

  return {
    validatedZip,
    showValidator,
    requestCanopyConnect,
    handleValidatorSuccess,
    closeValidator
  };
};