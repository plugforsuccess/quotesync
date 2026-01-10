// src/pages/AgencyApplyPage.jsx
// Public agency application form - "Easy to apply, hard to qualify"

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Building2, Send } from 'lucide-react';
import { submitAgencyApplication } from '../hooks/useAgencies';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const LINES_OF_BUSINESS = [
  { value: 'auto', label: 'Auto Insurance' },
  { value: 'home', label: 'Home Insurance' },
  { value: 'life', label: 'Life Insurance' },
  { value: 'health', label: 'Health Insurance' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' }
];

const AgencyApplyPage = () => {
  const [formData, setFormData] = useState({
    legalName: '',
    brandName: '',
    contactName: '',
    email: '',
    phone: '',
    statesLicensed: [],
    linesOfBusiness: [],
    licenseIdentifiers: '',
    desiredTerritories: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Rate limiting - simple client-side protection
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleState = (state) => {
    setFormData(prev => ({
      ...prev,
      statesLicensed: prev.statesLicensed.includes(state)
        ? prev.statesLicensed.filter(s => s !== state)
        : [...prev.statesLicensed, state]
    }));
  };

  const toggleLOB = (lob) => {
    setFormData(prev => ({
      ...prev,
      linesOfBusiness: prev.linesOfBusiness.includes(lob)
        ? prev.linesOfBusiness.filter(l => l !== lob)
        : [...prev.linesOfBusiness, lob]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Rate limit check (30 seconds between submissions)
    const now = Date.now();
    if (now - lastSubmitTime < 30000) {
      setError('Please wait before submitting again.');
      return;
    }

    // Basic validation
    if (!formData.legalName || !formData.contactName || !formData.email || !formData.phone) {
      setError('Please fill in all required fields.');
      return;
    }

    if (formData.statesLicensed.length === 0) {
      setError('Please select at least one state where you are licensed.');
      return;
    }

    if (formData.linesOfBusiness.length === 0) {
      setError('Please select at least one line of business.');
      return;
    }

    setSubmitting(true);
    setLastSubmitTime(now);

    try {
      await submitAgencyApplication(formData);
      setSubmitted(true);
    } catch (err) {
      console.error('Application submission error:', err);
      setError(err.message || 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted</h1>
          <p className="text-gray-600 mb-6">
            Thank you for your interest in partnering with us. Our team will review your
            application and contact you within 2-3 business days.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agency Partnership Application</h1>
          <p className="text-gray-600">
            Join our network of trusted insurance professionals
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Agency Info */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Agency Information</h2>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Legal Agency Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legalName"
                  value={formData.legalName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="ABC Insurance Agency, LLC"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display/Brand Name (optional)
                </label>
                <input
                  type="text"
                  name="brandName"
                  value={formData.brandName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="ABC Insurance"
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Primary Contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="john@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="(555) 123-4567"
                  required
                />
              </div>
            </div>
          </div>

          {/* States Licensed */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">States Licensed <span className="text-red-500">*</span></h2>
            <p className="text-sm text-gray-500 mb-4">Select all states where your agency holds active licenses</p>
            <div className="flex flex-wrap gap-2">
              {US_STATES.map(state => (
                <button
                  key={state}
                  type="button"
                  onClick={() => toggleState(state)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    formData.statesLicensed.includes(state)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {state}
                </button>
              ))}
            </div>
            {formData.statesLicensed.length > 0 && (
              <p className="mt-2 text-sm text-blue-600">
                Selected: {formData.statesLicensed.join(', ')}
              </p>
            )}
          </div>

          {/* Lines of Business */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Lines of Business <span className="text-red-500">*</span></h2>
            <div className="grid grid-cols-2 gap-3">
              {LINES_OF_BUSINESS.map(lob => (
                <button
                  key={lob.value}
                  type="button"
                  onClick={() => toggleLOB(lob.value)}
                  className={`p-3 rounded-lg text-sm font-medium text-left transition-colors ${
                    formData.linesOfBusiness.includes(lob.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {lob.label}
                </button>
              ))}
            </div>
          </div>

          {/* License Info */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">License Information</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                License Identifiers (NPN, State License Numbers)
              </label>
              <textarea
                name="licenseIdentifiers"
                value={formData.licenseIdentifiers}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="NPN: 12345678&#10;TX License: 1234567&#10;CA License: 0A12345"
              />
            </div>
          </div>

          {/* Desired Territories */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Territory Preferences</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desired Territories (ZIP codes, cities, or regions)
              </label>
              <textarea
                name="desiredTerritories"
                value={formData.desiredTerritories}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Dallas-Fort Worth metro area&#10;ZIP codes: 75001-75099&#10;Houston, TX"
              />
              <p className="mt-1 text-sm text-gray-500">
                This helps us understand your preferred coverage areas. Territory assignments are subject to approval.
              </p>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Submit Application
              </>
            )}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            By submitting, you agree to our{' '}
            <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default AgencyApplyPage;
