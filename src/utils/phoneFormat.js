// src/utils/phoneFormat.js
// Phone number formatting utilities

/**
 * Convert phone number to E.164 format for Twilio API
 * @param {string} phone - Phone number in any format
 * @returns {string|null} E.164 formatted number or null if invalid
 */
export const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

/**
 * Convert phone number to display format (XXX) XXX-XXXX
 * @param {string} phone - Phone number in any format
 * @returns {string} Display formatted phone number
 */
export const toDisplay = (phone) => {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length < 10) return phone;
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
};

/**
 * Format phone input as user types: (XXX) XXX-XXXX
 * @param {string} value - Raw input value
 * @returns {string} Formatted phone string
 */
export const formatPhoneInput = (value) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

/**
 * Validate US phone number (10 digits)
 * @param {string} phone - Phone number
 * @returns {boolean} Whether the phone number is valid
 */
export const isValidPhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
};
