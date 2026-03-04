// src/hooks/zipValidation.js
import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'insuredbycam_validated_zip';
const EXPIRY_HOURS = 24;

export const useZipValidation = () => {
  const [validatedZip, setValidatedZip] = useState(null);
  const [showValidator, setShowValidator] = useState(false);
  const callbackRef = useRef(null);

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
    // Store zip with state (currently GA-only)
    const data = { zip, state: 'GA', timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setValidatedZip(zip);
    setShowValidator(false);
  };

  const requestCanopyConnect = (onProceed) => {
    if (validatedZip) {
      onProceed();
    } else {
      setShowValidator(true);
      callbackRef.current = onProceed;
    }
  };

  const handleValidatorSuccess = (zip) => {
    handleValidZip(zip);
    if (callbackRef.current) {
      callbackRef.current();
      callbackRef.current = null;
    }
  };

  const closeValidator = () => {
    setShowValidator(false);
    callbackRef.current = null;
  };

  // Cleanup callback on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      callbackRef.current = null;
    };
  }, []);

  // Inline ZIP entry handler (for ZipHeroInput on landing page)
  const handleInlineZipEntry = (zip) => {
    handleValidZip(zip);
  };

  return {
    validatedZip,
    showValidator,
    requestCanopyConnect,
    handleValidatorSuccess,
    closeValidator,
    handleInlineZipEntry,
  };
};