// src/components/PhoneCapture.jsx
// Optional phone capture shown between ZIP and ownsHome steps.
// NOT a wizard step — dismissable inline card for early SMS follow-up.
import React, { useState, useCallback } from 'react';
import { toE164 } from '../utils/phoneFormat';
import { formatPhoneInput } from '../utils/phoneFormat';

const PhoneCapture = ({ onSave, onSkip }) => {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleChange = useCallback((e) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhone(formatted);
    if (error) setError('');
  }, [error]);

  const handleSave = useCallback(() => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    const e164 = toE164(phone);
    if (!e164) {
      setError('Please enter a valid phone number');
      return;
    }
    onSave(e164);
  }, [phone, onSave]);

  return (
    <div className="text-center mt-4 p-4 bg-primary-50 rounded-xl border border-primary-200">
      <p className="text-sm font-medium text-gray-700 mb-2">
        Enter your phone to save your progress
      </p>
      <div className="flex flex-col sm:flex-row gap-2 max-w-xs mx-auto">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={handleChange}
          placeholder="(404) 555-0100"
          className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-300 outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={phone.replace(/\D/g, '').length !== 10}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save &amp; Continue
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-gray-400 mt-2 bg-transparent border-0 cursor-pointer hover:text-gray-600"
      >
        Skip
      </button>
    </div>
  );
};

export default PhoneCapture;
