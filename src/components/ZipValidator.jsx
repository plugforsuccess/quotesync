// src/components/ZipValidator.jsx
import React, { useState } from 'react';

const ZipValidator = ({ onValidZip, onClose }) => {
  const [zip, setZip] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Georgia zip code ranges (approximately)
  const isGeorgiaZip = (zipCode) => {
    const zip = parseInt(zipCode);
    return (zip >= 30000 && zip <= 31999) || (zip >= 39800 && zip <= 39901);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!zip || zip.length !== 5) {
      setError('Please enter a valid 5-digit ZIP code');
      return;
    }

    setIsValidating(true);

    // Check if it's a Georgia ZIP
    if (!isGeorgiaZip(zip)) {
      setError("Sorry, I only write policies in Georgia right now. DM me on Instagram @insuredbycam if you're interested in coverage elsewhere!");
      setIsValidating(false);
      return;
    }

    // Valid Georgia ZIP - proceed
    setTimeout(() => {
      setIsValidating(false);
      onValidZip(zip);
    }, 300);
  };

  const handleZipChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
    setZip(value);
    if (error) setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">📍</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            What's your ZIP code?
          </h2>
          <p className="text-gray-600">
            I need to make sure I can write policies in your area
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={zip}
              onChange={handleZipChange}
              placeholder="Enter ZIP code"
              className="w-full px-4 py-3 text-lg text-center text-gray-900 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 text-center">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isValidating || zip.length !== 5}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            {isValidating ? 'Checking...' : 'Continue'}
          </button>
        </form>

        {/* Info text */}
        <p className="mt-4 text-xs text-gray-500 text-center">
          Currently serving Georgia residents only
        </p>
      </div>
    </div>
  );
};

export default ZipValidator;