// src/pages/RateCheckPrivacyPage.jsx
// Short privacy notice for the public Rate Check page (/ratecheck-privacy).

/* COPY REVIEW: submit this page to Allstate marketing compliance before paid traffic */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RateCheckFooter, LEGAL_OPERATOR } from './RateCheckPage';

export default function RateCheckPrivacyPage() {
  useEffect(() => {
    document.title = 'Rate Check privacy notice | insuredbycam';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-md px-4 pt-8 pb-8 text-gray-700">
        <Link to="/ratecheck" className="text-sm font-semibold text-blue-700">← Back to Rate Check</Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Rate Check privacy notice</h1>
        <p className="mt-2 text-sm">
          Rate Check is operated by {LEGAL_OPERATOR}, an Allstate agency.
        </p>

        <h2 className="mt-6 font-semibold text-gray-900">What we store</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Your first name, mobile number, and ZIP code.</li>
          <li>The photo or PDF of the declarations page you upload.</li>
          <li>
            Policy details we read from it: carrier, policy number, policy type, premium and term, dates,
            coverages, vehicles (year, make, model and VIN), and the agent or agency listed on the page.
          </li>
          <li>Whether you chose to get text messages about your quote, with the time, your IP address, and your browser.</li>
        </ul>

        <h2 className="mt-6 font-semibold text-gray-900">How we use it</h2>
        <p className="mt-2 text-sm">
          Only to compare your current policy with an Allstate quote and to contact you about it. We use an AI
          service to read the document. We don&apos;t sell your information. We also use the agent and agency
          listed on dec pages, combined across many customers, to understand our local market; we never contact
          another agent about you.
        </p>

        <h2 id="sms-terms" className="mt-6 font-semibold text-gray-900">Text messages (only if you opt in)</h2>
        <p className="mt-2 text-sm">
          If you check the optional text box when you send your policy, {LEGAL_OPERATOR} may send automated texts
          to the mobile number you gave about your quote: when it&apos;s ready, and your callback or quote-review
          appointment. Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to
          opt out or <strong>HELP</strong> for help. It&apos;s optional and not a condition of getting a quote; if
          you leave it unchecked, we&apos;ll still prepare your quote and reach you another way. We never use it
          for unrelated marketing.
        </p>

        <h2 className="mt-6 font-semibold text-gray-900">Partner referrals (only if you opt in)</h2>
        <p className="mt-2 text-sm">
          If you check the optional referral box and Allstate can&apos;t cover what you need, we may share your
          name, number and policy details with one partner agency so they can contact you about a quote. If you
          don&apos;t check it, we never share your information with anyone else. Text <strong>STOP</strong> or
          ask us at any time to withdraw it.
        </p>

        <h2 className="mt-6 font-semibold text-gray-900">How long we keep the image</h2>
        <p className="mt-2 text-sm">
          The uploaded image is deleted automatically 90 days after you send it. The policy details we read from
          it are kept with your quote record.
        </p>

        <h2 className="mt-6 font-semibold text-gray-900">Deleting your information</h2>
        <p className="mt-2 text-sm">
          Text <strong>DELETE</strong> to the number that texted you, and we&apos;ll delete your Rate Check
          record and image. Text <strong>STOP</strong> at any time to stop text messages.
        </p>

        <p className="mt-6 text-sm">
          See our full <Link to="/privacy" className="underline">privacy policy</Link> for more.
        </p>
      </main>
      <RateCheckFooter />
    </div>
  );
}
