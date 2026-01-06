// Design Preview Banner - Shows when viewing design direction preview
import React from 'react';

const DesignPreviewBanner = () => {
  return (
    <div className="bg-brand-teal text-white py-3 px-4 text-center font-body sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 flex-wrap">
        <span className="text-2xl">🎨</span>
        <span className="font-semibold text-sm sm:text-base">
          DESIGN PREVIEW - Direction 2: Modern Professional
        </span>
        <span className="text-xs sm:text-sm opacity-90 hidden sm:inline">
          | New Colors, Typography & Components
        </span>
      </div>
    </div>
  );
};

export default DesignPreviewBanner;
