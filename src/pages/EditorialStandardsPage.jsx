// src/pages/EditorialStandardsPage.jsx
import { T } from '../components/SiteCopy';
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
            <T k="pages.editorialstandardspage.15827e">← Back to Newsroom</T>
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2"><T k="pages.editorialstandardspage.d115a2">Editorial Standards</T></h1>
          <p className="text-gray-600"><T k="pages.editorialstandardspage.3871e6">Guidelines for InsuredByCam Newsroom Contributors</T></p>
        </div>

        {/* Content */}
        <div className="prose prose-blue max-w-none">

          {/* Mission Statement */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.e36a91">Our Mission</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.2583ca">The InsuredByCam Newsroom exists to educate and empower consumers with accurate, timely, and actionable information about insurance, financial protection, and safe driving. We aim to demystify insurance topics and help readers make informed decisions.</T>
            </p>
            <div className="bg-primary-50 border-l-4 border-primary-500 p-4 rounded-r-lg">
              <p className="text-gray-700 italic">
                <T k="pages.editorialstandardspage.f39a89">"Our goal is to be the trusted voice that simplifies insurance for everyday people."</T>
              </p>
            </div>
          </section>

          {/* Core Principles */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.04c76d">Core Principles</T></h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.ecf764">1. Accuracy</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.998bf5">Verify all facts before publication</T></li>
              <li><T k="pages.editorialstandardspage.256c34">Use primary sources whenever possible</T></li>
              <li><T k="pages.editorialstandardspage.b4cbf6">Double-check statistics, quotes, and data points</T></li>
              <li><T k="pages.editorialstandardspage.1271c1">Correct errors promptly and transparently</T></li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.2285c4">2. Clarity</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.b4e53b">Write in plain language accessible to general audiences</T></li>
              <li><T k="pages.editorialstandardspage.92e76c">Avoid unnecessary jargon; define technical terms when used</T></li>
              <li><T k="pages.editorialstandardspage.5a331d">Structure content with clear headings and logical flow</T></li>
              <li><T k="pages.editorialstandardspage.5f7bec">Use examples to illustrate complex concepts</T></li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.e2b71b">3. Objectivity</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.8d6c00">Present information fairly and without bias</T></li>
              <li><T k="pages.editorialstandardspage.ee9468">Distinguish clearly between news/information and opinion</T></li>
              <li><T k="pages.editorialstandardspage.00c464">Acknowledge when topics have multiple valid perspectives</T></li>
              <li><T k="pages.editorialstandardspage.da4308">Avoid sensationalism or clickbait headlines</T></li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.fb0d37">4. Transparency</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.0aae72">Disclose any potential conflicts of interest</T></li>
              <li><T k="pages.editorialstandardspage.0ecc4f">Clearly label sponsored or promotional content</T></li>
              <li><T k="pages.editorialstandardspage.c14659">Cite sources and link to references when appropriate</T></li>
              <li><T k="pages.editorialstandardspage.4be58a">Be upfront about what we know and don't know</T></li>
            </ul>
          </section>

          {/* Content Categories */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.ca7bce">Content Categories</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.c23863">Our newsroom covers the following topics:</T>
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2"><T k="pages.editorialstandardspage.1becf3">Insurance Education</T></h4>
                <p className="text-gray-600 text-sm"><T k="pages.editorialstandardspage.689c6b">Coverage types, policy explanations, how-to guides</T></p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2"><T k="pages.editorialstandardspage.d1d881">Industry News</T></h4>
                <p className="text-gray-600 text-sm"><T k="pages.editorialstandardspage.c434d5">Rate changes, regulatory updates, market trends</T></p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2"><T k="pages.editorialstandardspage.9520fe">Safety & Prevention</T></h4>
                <p className="text-gray-600 text-sm"><T k="pages.editorialstandardspage.fbe34d">Driving tips, risk reduction, accident prevention</T></p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2"><T k="pages.editorialstandardspage.a56250">Consumer Tips</T></h4>
                <p className="text-gray-600 text-sm"><T k="pages.editorialstandardspage.3dab9e">Saving money, claims process, coverage decisions</T></p>
              </div>
            </div>
          </section>

          {/* Writing Standards */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.0e3d51">Writing Standards</T></h2>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.de30ed">Headlines</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.a1b3bc">Be accurate and reflect the content of the story</T></li>
              <li><T k="pages.editorialstandardspage.b4ca7e">Use active voice when possible</T></li>
              <li><T k="pages.editorialstandardspage.d7ec6c">Avoid clickbait or misleading phrasing</T></li>
              <li><T k="pages.editorialstandardspage.c42274">Keep headlines concise (under 70 characters ideal)</T></li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.cc61ff">Body Content</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.3f0908">Lead with the most important information</T></li>
              <li><T k="pages.editorialstandardspage.ecf6ff">Use short paragraphs (2-4 sentences)</T></li>
              <li><T k="pages.editorialstandardspage.815b69">Include subheadings for longer pieces</T></li>
              <li><T k="pages.editorialstandardspage.7a9471">Aim for 8th-grade reading level for accessibility</T></li>
              <li><T k="pages.editorialstandardspage.68d87b">Minimum 300 words for standard articles</T></li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-3"><T k="pages.editorialstandardspage.9cc4fb">SEO Best Practices</T></h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.0ca267">Include relevant keywords naturally</T></li>
              <li><T k="pages.editorialstandardspage.0088bb">Write compelling meta descriptions (150-160 characters)</T></li>
              <li><T k="pages.editorialstandardspage.f5b73d">Use descriptive, keyword-rich URLs</T></li>
              <li><T k="pages.editorialstandardspage.3491e9">Add alt text to all images</T></li>
            </ul>
          </section>

          {/* Source Guidelines */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.5ee124">Source Guidelines</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.89803e">Credible sourcing is essential to our reputation. Prioritize these source types:</T>
            </p>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong><T k="pages.editorialstandardspage.5cb840">Official Sources:</T></strong> <T k="pages.editorialstandardspage.fb7dd2">State insurance departments, NAIC, NHTSA, CDC</T></li>
              <li><strong><T k="pages.editorialstandardspage.18e3c6">Industry Organizations:</T></strong> <T k="pages.editorialstandardspage.662129">Insurance Information Institute, IIHS</T></li>
              <li><strong><T k="pages.editorialstandardspage.98898b">Academic Research:</T></strong> <T k="pages.editorialstandardspage.3c4e16">Peer-reviewed studies and university research</T></li>
              <li><strong><T k="pages.editorialstandardspage.1fbf9b">Reputable News:</T></strong> <T k="pages.editorialstandardspage.0fc5e8">Established news organizations with editorial standards</T></li>
              <li><strong><T k="pages.editorialstandardspage.2cc40b">Expert Interviews:</T></strong> <T k="pages.editorialstandardspage.851764">Licensed professionals with relevant credentials</T></li>
            </ol>
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <strong><T k="pages.editorialstandardspage.bc5522">Avoid:</T></strong> <T k="pages.editorialstandardspage.1d326f">Anonymous sources, social media posts without verification, press releases without independent confirmation, and sources with undisclosed conflicts of interest.</T>
              </p>
            </div>
          </section>

          {/* Review Process */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.f2cf1e">Review Process</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.b6ffd6">All content goes through our editorial workflow:</T>
            </p>
            <ol className="list-decimal pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong><T k="pages.editorialstandardspage.017464">Draft:</T></strong> <T k="pages.editorialstandardspage.80aede">Writer creates initial content</T></li>
              <li><strong><T k="pages.editorialstandardspage.f84fca">Self-Review:</T></strong> <T k="pages.editorialstandardspage.65549c">Writer checks for accuracy, grammar, and style</T></li>
              <li><strong><T k="pages.editorialstandardspage.52b54a">Submit for Review:</T></strong> <T k="pages.editorialstandardspage.34e105">Content is submitted for editorial review</T></li>
              <li><strong><T k="pages.editorialstandardspage.8862f5">Editorial Review:</T></strong> <T k="pages.editorialstandardspage.3c8d5a">Editor verifies facts, checks sources, reviews quality</T></li>
              <li><strong><T k="pages.editorialstandardspage.d2f8a3">Publication:</T></strong> <T k="pages.editorialstandardspage.0f8407">Approved content is published</T></li>
              <li><strong><T k="pages.editorialstandardspage.666877">Post-Publication:</T></strong> <T k="pages.editorialstandardspage.482285">Monitor for needed corrections or updates</T></li>
            </ol>
          </section>

          {/* Corrections Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.0f02a0">Corrections Policy</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.417c6b">We take errors seriously and correct them promptly:</T>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong><T k="pages.editorialstandardspage.17a1ff">Minor Errors:</T></strong> <T k="pages.editorialstandardspage.20b63b">Typos and grammatical errors are corrected silently</T></li>
              <li><strong><T k="pages.editorialstandardspage.a01dbc">Factual Errors:</T></strong> <T k="pages.editorialstandardspage.97ed90">Corrected with a note at the bottom of the article</T></li>
              <li><strong><T k="pages.editorialstandardspage.b42cb9">Significant Errors:</T></strong> <T k="pages.editorialstandardspage.85fe64">Corrected with a prominent correction notice</T></li>
              <li><strong><T k="pages.editorialstandardspage.d29c9e">Retractions:</T></strong> <T k="pages.editorialstandardspage.79e4d1">If content is fundamentally flawed, we will retract and explain</T></li>
            </ul>
          </section>

          {/* Prohibited Content */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.61d8c1">Prohibited Content</T></h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              <T k="pages.editorialstandardspage.08532e">The following content is not permitted:</T>
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><T k="pages.editorialstandardspage.3dd18f">False or misleading information</T></li>
              <li><T k="pages.editorialstandardspage.e55d08">Plagiarized content</T></li>
              <li><T k="pages.editorialstandardspage.74a1ba">Content that violates copyright or trademark</T></li>
              <li><T k="pages.editorialstandardspage.eba4f2">Discriminatory or offensive material</T></li>
              <li><T k="pages.editorialstandardspage.0687cb">Advice that could cause financial or physical harm</T></li>
              <li><T k="pages.editorialstandardspage.faf55d">Undisclosed promotional content</T></li>
              <li><T k="pages.editorialstandardspage.9f8610">Content encouraging insurance fraud or illegal activities</T></li>
            </ul>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4"><T k="pages.editorialstandardspage.1ec704">Questions?</T></h2>
            <p className="text-gray-700 leading-relaxed">
              <T k="pages.editorialstandardspage.08f5e9">If you have questions about these editorial standards or need guidance on a specific piece of content, please reach out to your editor or contact the editorial team at</T>{' '}
              <a href="mailto:cameron@insuredbycam.com" className="text-primary-600 hover:text-primary-700 font-semibold">
                <T k="pages.editorialstandardspage.3c4d7c">cameron@insuredbycam.com</T>
              </a>
            </p>
          </section>

        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/news/dashboard" className="text-primary-600 hover:text-primary-700 font-semibold">
              <T k="pages.editorialstandardspage.442398">Newsroom Dashboard</T>
            </Link>
            <span className="text-gray-400">|</span>
            <Link to="/news" className="text-primary-600 hover:text-primary-700 font-semibold">
              <T k="pages.editorialstandardspage.8d27a9">Public Newsroom</T>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
