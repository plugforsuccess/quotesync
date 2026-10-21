// src/pages/RateCheckPrivacyPage.jsx
// Short privacy notice for the public Rate Check page (/ratecheck-privacy).

/* COPY REVIEW: submit this page to Allstate marketing compliance before paid traffic */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RateCheckFooter } from './RateCheckPage';

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

        <h2 className="mt-6 font-semibold text-gray-900">What we store</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Your first name, mobile number, and ZIP code.</li>
          <li>The photo or PDF of the declarations page you upload.</li>
          <li>
            Policy details we read from it: carrier, policy type, premium and term, dates, coverages, vehicles
            (year/make/model and the last 4 of the VIN), and the last 4 of the policy number.
          </li>
          <li>Your consent to be contacted, with the time, your IP address, and your browser.</li>
        </ul>

        <h2 className="mt-6 font-semibold text-gray-900">How we use it</h2>
        <p className="mt-2 text-sm">
          Only to compare your current policy with an Allstate quote and to contact you about it. We use an AI
          service to read the document. We don&apos;t sell your information.
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
