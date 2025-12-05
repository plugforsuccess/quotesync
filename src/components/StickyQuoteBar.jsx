// src/components/StickyQuoteBar.jsx
import { useState, useEffect } from 'react';
import { ArrowRight, Shield } from 'lucide-react';

const StickyQuoteBar = ({ onGetQuote }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasScrolledPast, setHasScrolledPast] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;

      // Get the QuoteHero section height (approximate)
      // The hero section is roughly 600-700px tall
      const heroSectionHeight = 650;

      // Show the sticky bar when scrolled past the hero section
      // Hide it when scrolling back up to the hero section
      if (scrollPosition > heroSectionHeight) {
        setHasScrolledPast(true);
        setIsVisible(true);
      } else {
        setHasScrolledPast(false);
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial scroll position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`fixed left-0 right-0 z-40 transition-all duration-500 ${
        isVisible
          ? 'top-[73px] sm:top-[81px] opacity-100 translate-y-0'
          : 'top-0 opacity-0 -translate-y-full pointer-events-none'
      }`}
    >
      {/* Secondary Sticky Bar */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 backdrop-blur-xl shadow-2xl border-b border-white/20">
        {/* Animated gradient line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 animate-gradient-x"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Message */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 flex-shrink-0" />
              <div>
                <p className="text-white font-bold text-sm sm:text-base leading-tight">
                  Save Up to $647 on Insurance
                </p>
                <p className="text-white/80 text-xs sm:text-sm hidden sm:block">
                  Free quote • No obligation • Fast and easy
                </p>
              </div>
            </div>

            {/* Right: CTA Button */}
            <button
              onClick={onGetQuote}
              className="group relative px-4 sm:px-6 py-2 sm:py-2.5 bg-white hover:bg-gray-50 text-blue-600 font-bold text-sm sm:text-base rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap overflow-hidden flex-shrink-0"
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-100/50 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>

              <span className="relative z-10">Get Quote</span>
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 relative z-10 group-hover:translate-x-1 transition-transform duration-300" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s ease infinite;
        }
      `}</style>
    </div>
  );
};

export default StickyQuoteBar;
