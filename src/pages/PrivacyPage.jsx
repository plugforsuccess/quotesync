// src/pages/PrivacyPage.jsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-600">Last Updated: November 18, 2025</p>
        </div>

        {/* Content */}
        <div className="prose prose-blue max-w-none">
          
          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Introduction</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Welcome to insuredbycam ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website insuredbycam.com and use our services.
            </p>
            <p className="text-gray-700 leading-relaxed">
              By using our website and services, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree with our policies and practices, please do not use our services.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Personal Information You Provide</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We collect personal information that you voluntarily provide to us when you:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Request an insurance quote</li>
              <li>Sync your current insurance policy using Canopy Connect</li>
              <li>Contact us via email or social media</li>
              <li>Sign up for driver education courses</li>
            </ul>
            
            <p className="text-gray-700 leading-relaxed mb-4">
              The personal information we collect may include:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Contact Information:</strong> Name, email address, phone number, mailing address</li>
              <li><strong>Location Information:</strong> ZIP code, city, state</li>
              <li><strong>Insurance Information:</strong> Current insurance provider, policy details, coverage information, vehicle information, driver information</li>
              <li><strong>Demographic Information:</strong> Age, date of birth, gender (as required for insurance quotes)</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Automatically Collected Information</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you visit our website, we automatically collect certain information about your device, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Pages visited and time spent on pages</li>
              <li>Referring website</li>
              <li>Date and time of visit</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use your personal information for the following purposes:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Provide Insurance Quotes:</strong> To generate personalized auto insurance quotes from Allstate</li>
              <li><strong>Communication:</strong> To contact you regarding your quote, answer questions, and provide customer service</li>
              <li><strong>Service Improvement:</strong> To improve our website, services, and user experience</li>
              <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
              <li><strong>Fraud Prevention:</strong> To detect, prevent, and address fraud and other illegal activities</li>
              <li><strong>Marketing:</strong> To send you promotional materials about our services (you can opt out at any time)</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Third-Party Services & Data Sharing</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Canopy Connect</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use Canopy Connect, a secure third-party service, to retrieve your current insurance policy information. When you use Canopy Connect:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Your login credentials are encrypted using 256-bit bank-level encryption</li>
              <li>Your credentials are never stored on our servers</li>
              <li>Canopy Connect's privacy policy applies to their data handling practices</li>
              <li>You can review Canopy Connect's privacy policy at usecanopy.com/privacy</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Allstate Insurance</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We share your information with Allstate Insurance Company for the purpose of generating insurance quotes. Cameron operates as an exclusive Allstate agent.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Other Third Parties</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may share your information with:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Service Providers:</strong> Companies that help us operate our website and deliver services (hosting, email delivery, analytics)</li>
              <li><strong>Driver Education Partners:</strong> If you sign up for driver education courses</li>
              <li><strong>Legal Authorities:</strong> When required by law or to protect our rights</li>
            </ul>
            
            <p className="text-gray-700 leading-relaxed">
              <strong>We do NOT sell your personal information to third parties.</strong>
            </p>
          </section>

          {/* Data Security */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Security</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information, including:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>SSL/TLS encryption for all data transmission</li>
              <li>Secure hosting infrastructure provided by Vercel</li>
              <li>Regular security audits and updates</li>
              <li>Access controls limiting who can access your data</li>
              <li>Data minimization - we only collect what's necessary</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee its absolute security.
            </p>
          </section>

          {/* Data Retention */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Data Retention</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law. Specifically:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Quote Information:</strong> Retained for up to 2 years to allow for follow-up and service</li>
              <li><strong>ZIP Code Validation:</strong> Stored locally in your browser for 24 hours only</li>
              <li><strong>Email Communications:</strong> Retained as long as you remain a customer or prospect</li>
              <li><strong>Legal Requirements:</strong> Some information may be retained longer to comply with legal obligations</li>
            </ul>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Privacy Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time</li>
              <li><strong>Data Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Object:</strong> Object to processing of your information in certain circumstances</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              To exercise any of these rights, please contact us at cameron@insuredbycam.com or via Instagram @insuredbycam.
            </p>
          </section>

          {/* Cookies */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Cookies and Tracking</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to improve your experience on our website:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for basic website functionality</li>
              <li><strong>Performance Cookies:</strong> Help us understand how visitors interact with our site</li>
              <li><strong>Functional Cookies:</strong> Remember your preferences (like ZIP code validation)</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You can control cookies through your browser settings. Note that disabling cookies may limit your ability to use certain features of our website.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately, and we will delete such information.
            </p>
          </section>

          {/* California Privacy Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">California Privacy Rights (CCPA)</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Right to know what personal information we collect, use, and disclose</li>
              <li>Right to request deletion of your personal information</li>
              <li>Right to opt-out of the sale of personal information (we do not sell your information)</li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
            </ul>
          </section>

          {/* Changes to Privacy Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to This Privacy Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. We encourage you to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          {/* Contact Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
              <p className="text-gray-900 font-semibold mb-2">insuredbycam</p>
              <p className="text-gray-700">Email: cameron@insuredbycam.com</p>
              <p className="text-gray-700">Instagram: @insuredbycam</p>
              <p className="text-gray-700">Website: insuredbycam.com</p>
              <p className="text-gray-700">Location: Georgia, United States</p>
            </div>
          </section>

          {/* Consent */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Consent</h2>
            <p className="text-gray-700 leading-relaxed">
              By using our website and services, you consent to our Privacy Policy and agree to its terms.
            </p>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/" className="text-blue-600 hover:text-blue-700 font-semibold">
              Home
            </Link>
            <span className="text-gray-400">•</span>
            <Link to="/terms" className="text-blue-600 hover:text-blue-700 font-semibold">
              Terms of Service
            </Link>
            <span className="text-gray-400">•</span>
            <a href="mailto:cameron@insuredbycam.com" className="text-blue-600 hover:text-blue-700 font-semibold">
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}