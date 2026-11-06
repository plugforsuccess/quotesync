// src/pages/AgencyApplyPage.jsx
// Public agency application form - "Easy to apply, hard to qualify"

import { T } from '../components/SiteCopy';
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
        <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.agencyapplypage.0a39ef">Application Submitted</T></h1>
          <p className="text-gray-600 mb-6">
            <T k="pages.agencyapplypage.926a0b">Thank you for your interest in partnering with us. Our team will review your
            application and contact you within 2-3 business days.</T>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          >
            <T k="pages.agencyapplypage.27fae2">Return Home</T>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2"><T k="pages.agencyapplypage.db2c23">Agency Partnership Application</T></h1>
          <p className="text-gray-600">
            <T k="pages.agencyapplypage.84c901">Join our network of trusted insurance professionals</T>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Agency Info */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyapplypage.b69bc5">Agency Information</T></h2>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <T k="pages.agencyapplypage.dcd946">Legal Agency Name</T> <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="legalName"
                  value={formData.legalName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="ABC Insurance Agency, LLC"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <T k="pages.agencyapplypage.d323b2">Display/Brand Name (Optional)</T>
                </label>
                <input
                  type="text"
                  name="brandName"
                  value={formData.brandName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="ABC Insurance"
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyapplypage.e020c4">Primary Contact</T></h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <T k="pages.agencyapplypage.8a42a5">Contact Name</T> <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="John Smith"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <T k="pages.agencyapplypage.84add5">Email</T> <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="john@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <T k="pages.agencyapplypage.77064d">Phone</T> <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="(555) 123-4567"
                  required
                />
              </div>
            </div>
          </div>

          {/* States Licensed */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2"><T k="pages.agencyapplypage.c79a9b">States Licensed</T> <span className="text-red-500">*</span></h2>
            <p className="text-sm text-gray-500 mb-4"><T k="pages.agencyapplypage.272a46">Select all states where your agency holds active licenses</T></p>
            <div className="flex flex-wrap gap-2">
              {US_STATES.map(state => (
                <button
                  key={state}
                  type="button"
                  onClick={() => toggleState(state)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    formData.statesLicensed.includes(state)
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {state}
                </button>
              ))}
            </div>
            {formData.statesLicensed.length > 0 && (
              <p className="mt-2 text-sm text-primary-600">
                <T k="pages.agencyapplypage.2e0844">Selected:</T> {formData.statesLicensed.join(', ')}
              </p>
            )}
          </div>

          {/* Lines of Business */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2"><T k="pages.agencyapplypage.f3f99b">Lines of Business</T> <span className="text-red-500">*</span></h2>
            <div className="grid grid-cols-2 gap-3">
              {LINES_OF_BUSINESS.map(lob => (
                <button
                  key={lob.value}
                  type="button"
                  onClick={() => toggleLOB(lob.value)}
                  className={`p-3 rounded-lg text-sm font-medium text-left transition-colors ${
                    formData.linesOfBusiness.includes(lob.value)
                      ? 'bg-primary-600 text-white'
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyapplypage.6e1e47">License Information</T></h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <T k="pages.agencyapplypage.cf8db6">License Identifiers (NPN, State License Numbers)</T>
              </label>
              <textarea
                name="licenseIdentifiers"
                value={formData.licenseIdentifiers}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="NPN: 12345678&#10;TX License: 1234567&#10;CA License: 0A12345"
              />
            </div>
          </div>

          {/* Desired Territories */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyapplypage.c26474">Territory Preferences</T></h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <T k="pages.agencyapplypage.4ce9e5">Desired Territories (ZIP Codes, Cities, or Regions)</T>
              </label>
              <textarea
                name="desiredTerritories"
                value={formData.desiredTerritories}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Dallas-Fort Worth metro area&#10;ZIP codes: 75001-75099&#10;Houston, TX"
              />
              <p className="mt-1 text-sm text-gray-500">
                <T k="pages.agencyapplypage.9faa42">This helps us understand your preferred coverage areas. Territory assignments are subject to approval.</T>
              </p>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-semibold rounded-lg transition-colors"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <T k="pages.agencyapplypage.46a1a6">Submitting...</T>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <T k="pages.agencyapplypage.f32663">Submit Application</T>
              </>
            )}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            <T k="pages.agencyapplypage.561b59">By submitting, you agree to our</T>{' '}
            <Link to="/terms" className="text-primary-600 hover:underline"><T k="pages.agencyapplypage.0c8a9a">Terms of Service</T></Link>
            {' '}<T k="pages.agencyapplypage.cffa50">and</T>{' '}
            <Link to="/privacy" className="text-primary-600 hover:underline"><T k="pages.agencyapplypage.9db108">Privacy Policy</T></Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default AgencyApplyPage;
