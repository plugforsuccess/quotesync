// src/components/ZipHeroInput.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';

const isGeorgiaZip = (zipCode) => {
  const zip = parseInt(zipCode);
  return (zip >= 30000 && zip <= 31999) || (zip >= 39800 && zip <= 39901);
};

const ZipHeroInput = ({ onValidZip, onInvalidZip }) => {
  const [zip, setZip] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // autoFocus on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
    setZip(value);
    if (error) setError('');

    // Auto-advance at 5 valid digits
    if (value.length === 5) {
      if (isGeorgiaZip(value)) {
        onValidZip(value);
      } else {
        const msg = 'We currently serve Georgia homeowners only.';
        setError(msg);
        if (onInvalidZip) onInvalidZip(msg);
      }
    }
  }, [error, onValidZip, onInvalidZip]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!zip || zip.length !== 5) {
      setError('Please enter a valid 5-digit ZIP code');
      return;
    }
    if (!isGeorgiaZip(zip)) {
      const msg = 'We currently serve Georgia homeowners only.';
      setError(msg);
      if (onInvalidZip) onInvalidZip(msg);
      return;
    }
    onValidZip(zip);
  }, [zip, onValidZip, onInvalidZip]);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={zip}
          onChange={handleChange}
          placeholder="Enter your ZIP code"
          className="flex-1 px-5 py-4 text-xl text-center text-gray-900 bg-white border-2 border-white/80 rounded-xl focus:border-accent-400 focus:ring-2 focus:ring-accent-300 outline-none transition-all shadow-lg"
          style={{ minHeight: '56px', fontSize: '20px' }}
          autoComplete="postal-code"
        />
        <button
          type="submit"
          disabled={zip.length !== 5}
          className="px-6 py-4 bg-gradient-to-r from-accent-500 to-accent-600 text-white font-bold text-lg rounded-xl hover:from-accent-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl whitespace-nowrap"
          style={{ minHeight: '56px' }}
        >
          Check My Eligibility
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-200 text-center font-medium">
          {error}
        </p>
      )}
    </form>
  );
};

export default ZipHeroInput;
