// src/pages/DataRequestPage.jsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function DataRequestPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-12">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="text-blue-600 hover:text-blue-700 font-semibold mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Data Request</h1>
          <p className="text-gray-600">Exercise your privacy rights</p>
        </div>

        {/* Content */}
        <div className="prose prose-blue max-w-none">

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Data Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Under applicable privacy laws (including CCPA for California residents), you have the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Access</strong> - Request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong> - Request correction of inaccurate personal data</li>
              <li><strong>Deletion</strong> - Request deletion of your personal data</li>
              <li><strong>Portability</strong> - Receive your data in a portable format</li>
              <li><strong>Opt-out</strong> - Opt out of certain data processing activities</li>
            </ul>
          </section>

          {/* How to Submit */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How to Submit a Request</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To submit a data request, please email us with the following information:
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-4">
              <p className="font-semibold text-blue-900 mb-2">Email your request to:</p>
              <a href="mailto:privacy@insuredbycam.com" className="text-blue-600 hover:text-blue-700 text-lg font-medium">
                privacy@insuredbycam.com
              </a>
            </div>

            <p className="text-gray-700 leading-relaxed mb-4">
              Please include in your email:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Your full name</li>
              <li>Email address associated with your account or quote request</li>
              <li>Type of request (access, deletion, correction, or portability)</li>
              <li>Any additional details that help us locate your records</li>
            </ul>
          </section>

          {/* What to Expect */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What to Expect</h2>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>We will acknowledge your request within <strong>3 business days</strong></li>
              <li>We may need to verify your identity before processing</li>
              <li>Requests are typically completed within <strong>30 days</strong></li>
              <li>Complex requests may take up to 45 days (we will notify you)</li>
              <li>There is no fee for reasonable requests</li>
            </ul>
          </section>

          {/* Verification */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Identity Verification</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To protect your privacy, we may ask you to verify your identity before fulfilling your request.
              This typically involves confirming information you previously provided to us.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions?</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about your data rights or this process, please contact us at{' '}
              <a href="mailto:privacy@insuredbycam.com" className="text-blue-600 hover:text-blue-700">
                privacy@insuredbycam.com
              </a>{' '}
              or review our{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-700">
                Privacy Policy
              </Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
