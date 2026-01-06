// src/components/QuoteHero.jsx
import React from 'react';

const QuoteHero = ({ isVisible }) => {
  return (
    <div className="container mx-auto px-4 py-16 relative z-10">
      <div
        className={`text-center mb-12 max-w-4xl mx-auto transition-all duration-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
        }`}
      >
        <h1 className="text-6xl md:text-7xl font-black text-white mb-12 leading-tight">
          Save Up to
          <br />
          <span
            className="bg-gradient-to-r from-accent via-accent to-accent bg-clip-text text-transparent inline-block"
            style={{ animation: 'wiggle 1s ease-in-out infinite' }}
          >
            $647
          </span>
          <br /> by Switching
        </h1>

        <p className="text-xl md:text-2xl text-white/90 mb-4 font-light">
          Connect your current insurance policy and see if Allstate can beat your rate
        </p>
        <p className="text-white/70 text-lg">Free comparison. No spam calls.</p>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
        <div className="relative">
          <div className="w-36 h-36 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl ring-4 ring-brand/20">
            <img
              src="/logos/A64C36F2-FC89-49D4-8C28-83161625C91C.jpeg"
              alt="Cameron Wiley"
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 30%' }}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-brand text-white rounded-full p-2 shadow-lg">
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
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2">I'm Cameron</h1>
          <p className="text-xl text-white mb-4">Allstate Agency Owner in Georgia</p>
          <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-gray-500">
            <span className="px-3 py-1 bg-brand-weak text-brand-dark rounded-full font-semibold">
              Licensed Agent
            </span>
            <span className="px-3 py-1 bg-success-weak text-gray-900 rounded-full font-semibold">
              Low Rates
            </span>
            <span className="px-3 py-1 bg-brand2-weak text-gray-900 rounded-full font-semibold">
              Great Service
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteHero;
