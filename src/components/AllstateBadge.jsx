// src/components/insurance-quotes/AllstateBadge.jsx
import { T } from './SiteCopy';
import React from 'react';

/**
 * Allstate branding badge component
 * Use this to add credibility throughout the insurance quotes page
 */

export const AllstateBadge = ({ variant = 'default' }) => {
  const variants = {
    // Small inline badge
    default: (
      <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/20">
        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
          <span className="text-[#0033A0] font-black text-xs">A</span>
        </div>
        <span className="text-white text-sm font-semibold"><T k="components.allstatebadge.659afa">Exclusive Allstate Agent</T></span>
      </div>
    ),

    // Hero badge - larger, more prominent
    hero: (
      <div className="inline-flex items-center gap-3 bg-white/95 backdrop-blur-md px-5 py-3 rounded-2xl shadow-lg border border-primary-200">
        <div className="w-10 h-10 bg-gradient-to-br from-[#0033A0] to-[#0047AB] rounded-xl flex items-center justify-center shadow-md">
          <span className="text-white font-black text-lg">A</span>
        </div>
        <div className="text-left">
          <div className="text-[#0033A0] font-black text-sm"><T k="components.allstatebadge.3886b1">ALLSTATE</T></div>
          <div className="text-gray-600 text-xs font-medium"><T k="components.allstatebadge.f1f4cf">Exclusive Agent</T></div>
        </div>
      </div>
    ),

    // Compact badge for cards
    compact: (
      <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0033A0] to-[#0047AB] px-3 py-1.5 rounded-full shadow-sm">
        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
          <span className="text-[#0033A0] font-black text-[10px]">A</span>
        </div>
        <span className="text-white text-xs font-bold"><T k="components.allstatebadge.b11b4c">Allstate Agent</T></span>
      </div>
    ),

    // Trust badge - emphasis on credibility
    trust: (
      <div className="bg-gradient-to-br from-primary-50 to-indigo-50 border-2 border-[#0033A0] rounded-xl p-4 inline-block">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#0033A0] to-[#0047AB] rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-xl">A</span>
          </div>
          <div className="text-left">
            <div className="text-[#0033A0] font-black text-base"><T k="components.allstatebadge.735843">Licensed Allstate Agent</T></div>
            <div className="text-gray-600 text-sm"><T k="components.allstatebadge.041a64">Georgia · Since 2024</T></div>
          </div>
        </div>
      </div>
    ),

    // Text only - subtle branding
    text: (
      <span className="text-white font-semibold">
        <T k="components.allstatebadge.68976b">Powered by</T> <span className="text-primary-300"><T k="components.allstatebadge.921d57">Allstate</T></span>
      </span>
    ),
  };

  return variants[variant] || variants.default;
};

export default AllstateBadge;