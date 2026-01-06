// src/components/QuoteHero.jsx - Direction 2: Modern Professional
import React from 'react';

const QuoteHero = ({ isVisible }) => {
  return (
    <div className="container mx-auto px-4 py-16 relative z-10">
      <div
        className={`text-center mb-12 max-w-4xl mx-auto transition-all duration-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
        }`}
      >
        <h1 className="text-5xl md:text-6xl font-headline font-bold text-white mb-8 leading-tight">
          Save Up to{' '}
          <span className="text-brand-teal">$647</span>
          <br />
          on Auto Insurance
        </h1>

        <p className="text-lg md:text-xl text-slate-400 mb-3 font-body">
          Connect your current insurance policy and see if Allstate can beat your rate
        </p>
        <p className="text-slate-500 text-base font-body">Free comparison. No spam calls.</p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
        <div className="relative">
          <div className="w-36 h-36 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl ring-4 ring-brand-teal/20">
            <img
              src="/logos/A64C36F2-FC89-49D4-8C28-83161625C91C.jpeg"
              alt="Cameron Wiley"
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 30%' }}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-brand-teal text-white rounded-full p-2 shadow-lg">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        <div className="text-center md:text-left">
          <h2 className="text-3xl md:text-4xl font-headline font-bold text-white mb-2">I'm Cameron</h2>
          <p className="text-lg md:text-xl text-slate-400 mb-4 font-body">Allstate Agency Owner in Georgia</p>
          <div className="flex items-center justify-center md:justify-start gap-2 text-sm flex-wrap">
            <span className="px-3 py-1 bg-brand-ocean/20 text-brand-teal rounded-modern font-semibold font-body border border-brand-teal/30">
              Licensed Agent
            </span>
            <span className="px-3 py-1 bg-brand-sage/20 text-brand-sage rounded-modern font-semibold font-body border border-brand-sage/30">
              Low Rates
            </span>
            <span className="px-3 py-1 bg-brand-teal/20 text-brand-teal rounded-modern font-semibold font-body border border-brand-teal/30">
              Great Service
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteHero;
