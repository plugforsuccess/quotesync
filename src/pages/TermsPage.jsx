// src/pages/TermsPage.jsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-600">Last Updated: November 18, 2025</p>
        </div>

        {/* Content */}
        <div className="prose prose-blue max-w-none">
          
          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Agreement to Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Welcome to insuredbycam.com ("Website"), operated by Cameron, an exclusive Allstate Insurance agent ("we," "us," or "our"). These Terms of Service ("Terms") govern your access to and use of our Website and services.
            </p>
            <p className="text-gray-700 leading-relaxed">
              By accessing or using our Website, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our services.
            </p>
          </section>

          {/* Service Description */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Description of Services</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              insuredbycam provides the following services:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Insurance Quote Comparison:</strong> We help you compare your current auto insurance policy with Allstate insurance quotes</li>
              <li><strong>Policy Syncing:</strong> Through our partnership with Canopy Connect, we securely retrieve your current insurance information</li>
              <li><strong>Personalized Quote Service:</strong> Cameron personally reviews your information and provides custom insurance quotes within 24 hours</li>
              <li><strong>Driver Education Services:</strong> We provide information and access to defensive driving and Joshua's Law courses</li>
            </ul>
          </section>

          {/* Eligibility */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Eligibility</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To use our services, you must:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Be at least 18 years of age</li>
              <li>Have the legal capacity to enter into a binding contract</li>
              <li>Currently have active auto insurance coverage</li>
              <li>Reside in the state of Georgia (for insurance quotes)</li>
              <li>Provide accurate and complete information</li>
            </ul>
          </section>

          {/* User Responsibilities */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">User Responsibilities</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              When using our services, you agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Provide Accurate Information:</strong> Supply truthful, accurate, and complete information when requesting quotes</li>
              <li><strong>Maintain Security:</strong> Keep your login credentials secure and confidential</li>
              <li><strong>Lawful Use:</strong> Use our services only for lawful purposes and in accordance with these Terms</li>
              <li><strong>Prohibited Activities:</strong> Not engage in any activity that could harm, disable, or impair our services</li>
              <li><strong>Respect Intellectual Property:</strong> Not copy, modify, or distribute our content without permission</li>
            </ul>
          </section>

          {/* Quote Process */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Insurance Quote Process</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-3">How It Works</h3>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li>You sync your current insurance policy using Canopy Connect (60 seconds)</li>
              <li>Cameron personally reviews your information</li>
              <li>You receive a personalized Allstate quote within 24 hours</li>
              <li>You decide whether to switch (no obligation)</li>
            </ol>

            <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">Important Disclaimers</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>No Guarantee of Savings:</strong> While we strive to find competitive rates, we cannot guarantee that you will save money by switching to Allstate</li>
              <li><strong>Quote Accuracy:</strong> Quotes are based on the information you provide. Inaccurate information may result in different final rates</li>
              <li><strong>Quote Validity:</strong> Quotes are typically valid for 30 days but may vary based on market conditions</li>
              <li><strong>No Obligation:</strong> Receiving a quote does not obligate you to purchase insurance</li>
              <li><strong>Binding Coverage:</strong> Insurance coverage only becomes effective when you complete the application process and pay the premium</li>
            </ul>
          </section>

          {/* Canopy Connect */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Use of Canopy Connect</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our service uses Canopy Connect, a third-party service, to securely retrieve your insurance information. By using our service, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Canopy Connect's terms of service and privacy policy apply to their services</li>
              <li>You are responsible for the accuracy of the login credentials you provide</li>
              <li>We are not responsible for issues arising from Canopy Connect's service</li>
              <li>Your credentials are encrypted and never stored by us</li>
            </ul>
          </section>

          {/* Geographic Limitations */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Geographic Limitations</h2>
            <p className="text-gray-700 leading-relaxed">
              Our insurance quote services are currently available <strong>only to residents of Georgia</strong>. We reserve the right to verify your location and decline service if you are located outside our service area.
            </p>
          </section>

          {/* Intellectual Property */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Intellectual Property Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              All content on this Website, including but not limited to text, graphics, logos, images, and software, is the property of insuredbycam or its licensors and is protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-gray-700 leading-relaxed">
              You may not reproduce, distribute, modify, or create derivative works from our content without express written permission.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To the fullest extent permitted by law:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>No Warranty:</strong> Our services are provided "as is" without warranties of any kind, either express or implied</li>
              <li><strong>Service Availability:</strong> We do not guarantee that our services will be uninterrupted, secure, or error-free</li>
              <li><strong>Information Accuracy:</strong> We strive for accuracy but do not warrant that information on our Website is complete or current</li>
              <li><strong>Third-Party Services:</strong> We are not responsible for the actions, content, or services of third parties (including Canopy Connect)</li>
              <li><strong>Damages:</strong> We shall not be liable for any indirect, incidental, special, consequential, or punitive damages</li>
              <li><strong>Maximum Liability:</strong> Our total liability shall not exceed the amount you paid for our services (if any)</li>
            </ul>
          </section>

          {/* Indemnification */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Indemnification</h2>
            <p className="text-gray-700 leading-relaxed">
              You agree to indemnify, defend, and hold harmless insuredbycam, Cameron, and our affiliates from any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or related to your use of our services, violation of these Terms, or infringement of any rights of another party.
            </p>
          </section>

          {/* Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Your use of our services is also governed by our <Link to="/privacy" className="text-blue-600 hover:text-blue-700 font-semibold">Privacy Policy</Link>. Please review our Privacy Policy to understand our practices regarding the collection, use, and disclosure of your personal information.
            </p>
          </section>

          {/* Termination */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Termination</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Refuse service to anyone for any reason at any time</li>
              <li>Terminate or suspend your access to our services immediately, without prior notice, for any breach of these Terms</li>
              <li>Remove or disable any content that violates these Terms</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              You may discontinue use of our services at any time.
            </p>
          </section>

          {/* Governing Law */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Governing Law and Jurisdiction</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Georgia, United States, without regard to its conflict of law provisions. Any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located in Georgia, and you hereby consent to personal jurisdiction and venue therein.
            </p>
          </section>

          {/* Dispute Resolution */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Dispute Resolution</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              In the event of any dispute arising from these Terms or your use of our services:
            </p>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Informal Resolution:</strong> We encourage you to contact us first to attempt to resolve the dispute informally</li>
              <li><strong>Mediation:</strong> If informal resolution fails, the parties agree to attempt mediation before pursuing litigation</li>
              <li><strong>Arbitration:</strong> Any unresolved disputes may be subject to binding arbitration in Georgia</li>
            </ol>
          </section>

          {/* Changes to Terms */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to These Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the new Terms on this page and updating the "Last Updated" date. Your continued use of our services after such changes constitutes your acceptance of the new Terms.
            </p>
          </section>

          {/* Severability */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Severability</h2>
            <p className="text-gray-700 leading-relaxed">
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          {/* Entire Agreement */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Entire Agreement</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and insuredbycam regarding the use of our services and supersede all prior agreements and understandings.
            </p>
          </section>

          {/* Contact Information */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
              <p className="text-gray-900 font-semibold mb-2">insuredbycam</p>
              <p className="text-gray-700">Email: cameron@insuredbycam.com</p>
              <p className="text-gray-700">Instagram: @insuredbycam</p>
              <p className="text-gray-700">Website: insuredbycam.com</p>
              <p className="text-gray-700">Location: Georgia, United States</p>
            </div>
          </section>

          {/* Acknowledgment */}
          <section className="mb-8">
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-r-lg">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Acknowledgment</h3>
              <p className="text-gray-700 leading-relaxed">
                By using insuredbycam.com, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
            </div>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/" className="text-blue-600 hover:text-blue-700 font-semibold">
              Home
            </Link>
            <span className="text-gray-400">•</span>
            <Link to="/privacy" className="text-blue-600 hover:text-blue-700 font-semibold">
              Privacy Policy
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