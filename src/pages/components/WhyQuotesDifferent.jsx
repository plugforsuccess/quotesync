// src/components/WhyQuotesDifferent.jsx
import React from 'react';

const WhyQuotesDifferent = () => {
  return (
    <div className="relative mx-auto max-w-6xl sm:px-6 lg:px-8 my-16 pt-12 pb-24 mb-12">
      <div className="relative bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] rounded-2xl shadow-2xl p-8 sm:p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl -m-[3px] -z-10 animate-pulse" style={{ animationDuration: '3s' }}></div>

        <h2 className="text-white text-3xl md:text-4xl font-bold text-center mb-10">
          Why My Quotes Are Different
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[
            {
              title: 'I verify your actual vehicle details',
              desc: 'VIN, trim level, safety features — not what you remember',
            },
            {
              title: 'I check your real policy coverage',
              desc: 'Apples-to-apples comparison, no guessing',
            },
            {
              title: 'No surprises at sign-up',
              desc: 'The price you see is the price you pay. No time wasted.',
            },
            {
              title: 'All Allstate discounts included',
              desc: 'I catch discounts you might not even know you qualify for',
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-4 text-left bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
              <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xl">✓</span>
              </div>
              <div>
                <h3 className="text-white text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-white/85 text-base leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WhyQuotesDifferent;