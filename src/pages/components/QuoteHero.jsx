// src/components/QuoteHero.jsx
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ZipHeroInput from '../../components/ZipHeroInput';
import { trackEvent } from '../../lib/analytics';

const STORAGE_KEY = 'qs_validated_zip';

const QuoteHero = ({ isVisible }) => {
  const navigate = useNavigate();

  const handleInlineZipEntry = useCallback((zip) => {
    // Store to localStorage (same key as ZipValidation hook)
    const data = { zip, state: 'GA', timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Fire ZipSubmitted pixel event
    trackEvent('ZipSubmitted', { zip_code: zip });
    if (window.fbq) window.fbq('trackCustom', 'ZipSubmitted', { zip_code: zip });

    // Navigate to funnel with zip param
    navigate(`/save?zip=${zip}`);
  }, [navigate]);

  return (
    <div className="container mx-auto px-4 py-16 relative z-10">
      <div
        className={`text-center mb-12 max-w-4xl mx-auto transition-all duration-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
        }`}
      >
        {/* Strong, Opinionated Value Prop */}
        <div className="inline-block mb-6 px-6 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
          <p className="text-sm md:text-base font-semibold text-white/90">
            Compare coverage, not just price
          </p>
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-tight">
          Georgia Homeowners Are Saving
          <br />
          <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-accent-500 bg-clip-text text-transparent inline-block">
            Up To $742 Per Year
          </span>
        </h1>

        <p className="text-2xl md:text-3xl text-white/90 mb-2 font-bold">
          On Home + Auto Insurance
        </p>

        <p className="text-lg md:text-xl text-white/80 mb-8 font-medium max-w-3xl mx-auto leading-relaxed">
          Check your eligibility in 30 seconds. No phone call required.
        </p>

        {/* Inline ZIP Input - Above the fold */}
        <div className="mb-6">
          <ZipHeroInput
            onValidZip={handleInlineZipEntry}
            onInvalidZip={() => {}}
          />
        </div>

        {/* Social Proof Row */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-base text-white/80 mb-8">
          <div className="flex items-center gap-1">
            <span className="text-accent-400 font-bold">4.9</span>
            <span className="text-accent-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span className="font-semibold">rating</span>
          </div>
          <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
          <span className="font-semibold">Licensed Insurance Agency</span>
          <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
          <span className="font-semibold">Serving GA Since 2015</span>
          <div className="w-px h-4 bg-white/30 hidden sm:block"></div>
          <span className="font-semibold">4,300+ Georgia families served</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-base text-white/80">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-success-400 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="font-semibold">Real coverage comparison</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-success-400 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="font-semibold">No spam calls</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-success-400 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="font-semibold">Takes 2 minutes</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
        <div className="relative">
          <div className="w-36 h-36 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-2xl ring-4 ring-primary-500/20">
            <img
              src="/logos/A64C36F2-FC89-49D4-8C28-83161625C91C.jpeg"
              alt="Cameron Wiley"
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 30%' }}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-primary-600 text-white rounded-full p-2 shadow-lg">
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
          <h2 className="text-4xl md:text-5xl font-black text-white mb-2">I'm Cameron</h2>
          <p className="text-xl text-white mb-4">Allstate Agency Owner in Georgia</p>
          <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-gray-500">
            <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full font-semibold">
              Licensed Agent
            </span>
            <span className="px-3 py-1 bg-success-100 text-success-700 rounded-full font-semibold">
              Low Rates
            </span>
            <span className="px-3 py-1 bg-secondary-100 text-secondary-700 rounded-full font-semibold">
              Great Service
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteHero;
