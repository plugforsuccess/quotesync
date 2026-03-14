// src/pages/EditorialStandardsPage.jsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function EditorialStandardsPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-8 md:p-12">
        {/* Header */}
        <div className="mb-8">
          <Link to="/news/dashboard" className="text-primary-600 hover:text-primary-700 font-semibold mb-4 inline-block">
            &larr; Back to Newsroom
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Editorial Standards</h1>
          <p className="text-gray-600">Guidelines for InsuredByCam Newsroom Contributors</p>
        </div>

        {/* Content */}
        <div className="prose prose-blue max-w-none">

          {/* Mission Statement */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The InsuredByCam Newsroom exists to educate and empower consumers with accurate, timely, and actionable information about insurance, financial protection, and safe driving. We aim to demystify insurance topics and help readers make informed decisions.
            </p>
            <div className="bg-primary-50 border-l-4 border-primary-500 p-4 rounded-r-lg">
              <p className="text-gray-700 italic">
                "Our goal is to be the trusted voice that simplifies insurance for everyday people."
              </p>
            </div>
          </section>

          {/* Core Principles */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Core Principles</h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">1. Accuracy</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Verify all facts before publication</li>
              <li>Use primary sources whenever possible</li>
              <li>Double-check statistics, quotes, and data points</li>
              <li>Correct errors promptly and transparently</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">2. Clarity</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Write in plain language accessible to general audiences</li>
              <li>Avoid unnecessary jargon; define technical terms when used</li>
              <li>Structure content with clear headings and logical flow</li>
              <li>Use examples to illustrate complex concepts</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">3. Objectivity</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Present information fairly and without bias</li>
              <li>Distinguish clearly between news/information and opinion</li>
              <li>Acknowledge when topics have multiple valid perspectives</li>
              <li>Avoid sensationalism or clickbait headlines</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">4. Transparency</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Disclose any potential conflicts of interest</li>
              <li>Clearly label sponsored or promotional content</li>
              <li>Cite sources and link to references when appropriate</li>
              <li>Be upfront about what we know and don't know</li>
            </ul>
          </section>

          {/* Content Categories */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Content Categories</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our newsroom covers the following topics:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Insurance Education</h4>
                <p className="text-gray-600 text-sm">Coverage types, policy explanations, how-to guides</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Industry News</h4>
                <p className="text-gray-600 text-sm">Rate changes, regulatory updates, market trends</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Safety & Prevention</h4>
                <p className="text-gray-600 text-sm">Driving tips, risk reduction, accident prevention</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Consumer Tips</h4>
                <p className="text-gray-600 text-sm">Saving money, claims process, coverage decisions</p>
              </div>
            </div>
          </section>

          {/* Writing Standards */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Writing Standards</h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">Headlines</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Be accurate and reflect the content of the story</li>
              <li>Use active voice when possible</li>
              <li>Avoid clickbait or misleading phrasing</li>
              <li>Keep headlines concise (under 70 characters ideal)</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">Body Content</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Lead with the most important information</li>
              <li>Use short paragraphs (2-4 sentences)</li>
              <li>Include subheadings for longer pieces</li>
              <li>Aim for 8th-grade reading level for accessibility</li>
              <li>Minimum 300 words for standard articles</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3">SEO Best Practices</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Include relevant keywords naturally</li>
              <li>Write compelling meta descriptions (150-160 characters)</li>
              <li>Use descriptive, keyword-rich URLs</li>
              <li>Add alt text to all images</li>
            </ul>
          </section>

          {/* Source Guidelines */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Source Guidelines</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Credible sourcing is essential to our reputation. Prioritize these source types:
            </p>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Official Sources:</strong> State insurance departments, NAIC, NHTSA, CDC</li>
              <li><strong>Industry Organizations:</strong> Insurance Information Institute, IIHS</li>
              <li><strong>Academic Research:</strong> Peer-reviewed studies and university research</li>
              <li><strong>Reputable News:</strong> Established news organizations with editorial standards</li>
              <li><strong>Expert Interviews:</strong> Licensed professionals with relevant credentials</li>
            </ol>
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <strong>Avoid:</strong> Anonymous sources, social media posts without verification, press releases without independent confirmation, and sources with undisclosed conflicts of interest.
              </p>
            </div>
          </section>

          {/* Review Process */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Review Process</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              All content goes through our editorial workflow:
            </p>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Draft:</strong> Writer creates initial content</li>
              <li><strong>Self-Review:</strong> Writer checks for accuracy, grammar, and style</li>
              <li><strong>Submit for Review:</strong> Content is submitted for editorial review</li>
              <li><strong>Editorial Review:</strong> Editor verifies facts, checks sources, reviews quality</li>
              <li><strong>Publication:</strong> Approved content is published</li>
              <li><strong>Post-Publication:</strong> Monitor for needed corrections or updates</li>
            </ol>
          </section>

          {/* Corrections Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Corrections Policy</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We take errors seriously and correct them promptly:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Minor Errors:</strong> Typos and grammatical errors are corrected silently</li>
              <li><strong>Factual Errors:</strong> Corrected with a note at the bottom of the article</li>
              <li><strong>Significant Errors:</strong> Corrected with a prominent correction notice</li>
              <li><strong>Retractions:</strong> If content is fundamentally flawed, we will retract and explain</li>
            </ul>
          </section>

          {/* Prohibited Content */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Prohibited Content</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The following content is not permitted:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>False or misleading information</li>
              <li>Plagiarized content</li>
              <li>Content that violates copyright or trademark</li>
              <li>Discriminatory or offensive material</li>
              <li>Advice that could cause financial or physical harm</li>
              <li>Undisclosed promotional content</li>
              <li>Content encouraging insurance fraud or illegal activities</li>
            </ul>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions?</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about these editorial standards or need guidance on a specific piece of content, please reach out to your editor or contact the editorial team at{' '}
              <a href="mailto:cameron@insuredbycam.com" className="text-primary-600 hover:text-primary-700 font-semibold">
                cameron@insuredbycam.com
              </a>
            </p>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/news/dashboard" className="text-primary-600 hover:text-primary-700 font-semibold">
              Newsroom Dashboard
            </Link>
            <span className="text-gray-400">|</span>
            <Link to="/news" className="text-primary-600 hover:text-primary-700 font-semibold">
              Public Newsroom
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
