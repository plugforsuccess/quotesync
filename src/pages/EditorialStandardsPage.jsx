// src/pages/EditorialStandardsPage.jsx
// Static editorial standards page for the Newsroom

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EditorialStandardsPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Editorial Standards | Insurance Newsroom';
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            to="/news"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Newsroom
          </Link>
        </div>
      </div>

      {/* Content */}
      <article className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3 leading-tight">
          Editorial Standards
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Guidelines for the Newsroom Contributors
        </p>

        {/* Our Mission */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            The Newsroom exists to educate and empower consumers with accurate, timely, and actionable information about insurance, financial protection, and safe driving. We aim to demystify insurance topics and help readers make informed decisions.
          </p>
          <blockquote className="bg-blue-50 border-l-4 border-blue-500 p-6 my-6">
            <p className="text-blue-900 italic text-lg">
              "Our goal is to be the trusted voice that simplifies insurance for everyday people."
            </p>
          </blockquote>
        </section>

        {/* Core Principles */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Core Principles</h2>

          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">1. Accuracy</h3>
              <p className="text-gray-700 leading-relaxed">
                Every fact, statistic, and claim must be verified before publication. We cite credible sources and correct errors promptly when they occur. Accuracy is the foundation of reader trust.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">2. Clarity</h3>
              <p className="text-gray-700 leading-relaxed">
                Insurance can be complex. Our job is to make it understandable. We avoid jargon, explain technical terms, and write for a general audience without oversimplifying important details.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">3. Timeliness</h3>
              <p className="text-gray-700 leading-relaxed">
                We report on developments as they happen. Our readers depend on us to keep them informed about changes that affect their coverage, rates, and rights as policyholders.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">4. Independence</h3>
              <p className="text-gray-700 leading-relaxed">
                Editorial decisions are made independently of advertising and business considerations. We clearly label sponsored content and never let commercial interests influence our reporting.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">5. Fairness</h3>
              <p className="text-gray-700 leading-relaxed">
                We present multiple perspectives on controversial issues. We give subjects of critical coverage an opportunity to respond before publication. We distinguish between news reporting and opinion.
              </p>
            </div>
          </div>
        </section>

        {/* Content Categories */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Content Categories</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Our coverage spans several key areas:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li><strong>Policy & Regulation:</strong> Insurance policy updates, regulatory changes, and government oversight</li>
            <li><strong>Litigation & Legal:</strong> Lawsuits, court decisions, and legal precedents affecting insurance</li>
            <li><strong>Accidents & Claims:</strong> Accident trends, claims data, and safety statistics</li>
            <li><strong>Insurance Markets:</strong> Market trends, rate changes, and industry movements</li>
            <li><strong>Data & Research:</strong> Data-driven insights, studies, and analytical reports</li>
            <li><strong>Consumer Guidance:</strong> Tips, advice, and educational content for policyholders</li>
          </ul>
        </section>

        {/* Corrections Policy */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Corrections Policy</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            When we make mistakes, we correct them promptly and transparently:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Minor corrections (typos, formatting) are made silently</li>
            <li>Factual corrections are noted at the bottom of the article</li>
            <li>Significant corrections warrant an editor's note at the top of the article</li>
            <li>We never delete articles without explanation</li>
          </ul>
        </section>

        {/* Contact */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
          <p className="text-gray-700 leading-relaxed">
            Questions about our editorial standards? Feedback on our coverage? Please reach out to us at{' '}
            <a href="mailto:contact@insuredbycam.com" className="text-blue-600 hover:text-blue-700 font-medium">
              contact@insuredbycam.com
            </a>
          </p>
        </section>

        {/* CTA */}
        <div className="bg-gray-50 rounded-lg p-8 border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Stay Informed
          </h3>
          <p className="text-gray-600 mb-6">
            Get the latest insurance news and updates delivered to your feed.
          </p>
          <Link
            to="/news"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Browse the Newsroom
          </Link>
        </div>
      </article>
    </div>
  );
};

export default EditorialStandardsPage;
