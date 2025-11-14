// src/pages/GeorgiaDriverEducationPage.jsx
import React from "react";

const DEFENSIVE_DRIVING_LINK =
  "https://insuredbycam.nationaldrivered.com/dc/100057";
const JOSHUAS_LAW_LINK =
  "https://insuredbycam.nationaldrivered.com/dc/100038";
const RETURNING_CUSTOMER_LINK =
  "https://insuredbycam.nationaldrivered.com/login?returnUrl=/CourseInfo";

export default function GeorgiaDriverEducationPage() {
  const handleDefensiveDrivingClick = () => {
    window.open(DEFENSIVE_DRIVING_LINK, "_blank");
  };

  const handleJoshuasLawClick = () => {
    window.open(JOSHUAS_LAW_LINK, "_blank");
  };

  const handleReturningCustomerClick = () => {
    window.open(RETURNING_CUSTOMER_LINK, "_blank");
  };

  return (
    <div className="bg-slate-950 text-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-12 lg:py-16">
        {/* Returning Customer Banner */}
        <div className="mb-8 -mt-4">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-300">
              Already enrolled in a course?
            </p>
            <button
              onClick={handleReturningCustomerClick}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap"
            >
              Continue your course →
            </button>
          </div>
        </div>

        {/* Tag */}
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 mb-4">
          Driver Education · Georgia
        </p>

        {/* Hero */}
        <header className="mb-12">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
            Georgia Driver Education &amp; Insurance Discounts
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-3xl">
            Complete your driver education online—whether you're earning your license or looking to save on insurance. Both courses are 100% online and state-approved.
          </p>
        </header>

        {/* Course Cards */}
        <div className="grid gap-6 lg:grid-cols-2 mb-12">
          {/* Defensive Driving Card - Featured */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-slate-900/60 border-2 border-emerald-500/40 rounded-2xl p-6 relative overflow-hidden">
            {/* Popular badge */}
            <div className="absolute top-4 right-4 bg-emerald-400 text-slate-950 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
              Most Popular
            </div>
            
            <div className="mb-4">
              <p className="text-xs font-semibold text-emerald-300 mb-2 uppercase tracking-[0.18em]">
                Insurance Discount
              </p>
              <h2 className="text-2xl font-bold mb-2">
                Defensive Driving Course
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                Save on your insurance premium by completing this 6-hour online defensive driving course. Many Georgia insurers offer recurring discounts.
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-300 mb-6">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>6-hour online course, complete at your own pace</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Eligible for insurance discounts with most carriers</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Downloadable completion certificate</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Available for all ages 18+</span>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-xs line-through text-slate-500">$59.95</span>
              <span className="text-2xl font-bold text-emerald-300">~$24.95*</span>
            </div>

            <button
              onClick={handleDefensiveDrivingClick}
              className="w-full rounded-full py-3.5 text-sm font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 transition-all shadow-lg hover:shadow-emerald-400/20"
            >
              Start Defensive Driving Course
            </button>
          </div>

          {/* Joshua's Law Card */}
          <div className="bg-slate-900/60 border border-slate-700 hover:border-slate-600 rounded-2xl p-6 transition-all">
            <div className="mb-4">
              <p className="text-xs font-semibold text-blue-300 mb-2 uppercase tracking-[0.18em]">
                Teen Drivers (15-17)
              </p>
              <h2 className="text-2xl font-bold mb-2">
                Joshua's Law Course
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                Required for Georgia teens to get their Class D license. Complete the 30-hour course online to fulfill your driver's ed requirement.
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-300 mb-6">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span>30-hour state-approved curriculum</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span>Required for Class D license (ages 15-17)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span>Certificate sent directly to DDS</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span>Complete 100% online at your own pace</span>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-bold text-slate-50">$29.00</span>
            </div>

            <button
              onClick={handleJoshuasLawClick}
              className="w-full rounded-full py-3.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 text-slate-50 transition-all"
            >
              Start Joshua's Law Course
            </button>
          </div>
        </div>

        {/* Detailed Info Sections */}
        <div className="grid gap-8 lg:grid-cols-2 mb-12">
          {/* Defensive Driving Details */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-slate-800 pb-2">
              About Defensive Driving
            </h3>
            
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-emerald-300">How It Works</h4>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside pl-1">
                <li>Check with your insurer to confirm they accept this course</li>
                <li>Enroll and complete the 6-hour program at your own pace</li>
                <li>Download your completion certificate</li>
                <li>Submit certificate to your insurance company</li>
                <li>Enjoy your premium discount</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-emerald-300">Course Features</h4>
              <ul className="text-sm text-slate-300 space-y-2">
                <li>• Works on mobile, tablet, or desktop</li>
                <li>• Mix of text, videos, and animations</li>
                <li>• Automatic progress saving</li>
                <li>• Optional audio read-along</li>
                <li>• 30-day money-back guarantee</li>
              </ul>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-2 font-semibold">Quick Answer</p>
              <p className="text-sm text-slate-300">
                <span className="font-semibold">Will I get a discount?</span> Most Georgia insurers offer defensive driving discounts, but you should always verify with your specific carrier before enrolling.
              </p>
            </div>
          </div>

          {/* Joshua's Law Details */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold border-b border-slate-800 pb-2">
              About Joshua's Law
            </h3>
            
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-blue-300">How It Works</h4>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside pl-1">
                <li>Enroll in the 30-hour online course</li>
                <li>Complete interactive lessons and quizzes</li>
                <li>Pass the final exam</li>
                <li>Certificate automatically sent to Georgia DDS</li>
                <li>You're ready to schedule your road test</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-blue-300">Requirements</h4>
              <ul className="text-sm text-slate-300 space-y-2">
                <li>• Required for teens ages 15-17 in Georgia</li>
                <li>• Must complete before applying for Class D license</li>
                <li>• No in-person classroom attendance needed</li>
                <li>• Self-paced with 12-month access</li>
              </ul>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-2 font-semibold">Quick Answer</p>
              <p className="text-sm text-slate-300">
                <span className="font-semibold">Is this state-approved?</span> Yes, this course is fully approved by the Georgia Department of Driver Services and satisfies Joshua's Law requirements.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8">
          <h3 className="text-xl font-bold mb-6">Frequently Asked Questions</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="font-semibold text-sm mb-2">Can I take both courses?</p>
              <p className="text-sm text-slate-300">
                Absolutely! If you're a parent helping your teen, you can enroll in Defensive Driving for your own insurance discount while your teen completes Joshua's Law.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-2">How long do I have access?</p>
              <p className="text-sm text-slate-300">
                Both courses give you extended access to complete at your own pace. You can log in and out as needed, and your progress is automatically saved.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-2">Are certificates sent automatically?</p>
              <p className="text-sm text-slate-300">
                Joshua's Law certificates are sent directly to Georgia DDS. Defensive Driving certificates are downloadable for you to submit to your insurer.
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm mb-2">What if I need help during the course?</p>
              <p className="text-sm text-slate-300">
                Both course providers offer customer support via phone and email during extended business hours.
              </p>
            </div>
          </div>
        </section>

        {/* Insurance Quote CTA */}
        <section className="my-12">
          <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/30 rounded-2xl p-8 text-center">
            <h3 className="text-2xl font-bold mb-3">Need an Insurance Quote?</h3>
            <p className="text-slate-300 mb-6 max-w-2xl mx-auto">
              Skip the long forms. Compares rates in less than a minute.
            </p>
            <a
              href="/"
              className="inline-block rounded-full px-8 py-3.5 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-all shadow-lg hover:shadow-blue-500/20"
            >
              Get Started →
            </a>
          </div>
        </section>

        {/* Disclosure */}
        <section className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Some programs on this page are partner or affiliate offers. If you enroll through these links, insuredbycam.com may earn a commission at no extra cost to you. Only programs that provide real safety or savings benefits are recommended here. *Pricing shown is approximate and may vary based on active promotions—see partner site for current rates.
          </p>
        </section>
      </div>
    </div>
  );
}
