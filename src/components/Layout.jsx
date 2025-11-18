// components/Layout.jsx - ULTRA ADVANCED VERSION
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Menu, X, Sparkles } from 'lucide-react';
import Footer from './Footer';

function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Handle scroll for nav blur effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Advanced Header with Glassmorphism */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#0f172a]/80 backdrop-blur-2xl shadow-2xl border-b border-white/10'
            : 'bg-[#0f172a]/50 backdrop-blur-xl border-b border-white/5'
        }`}
      >
        {/* Animated gradient line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 animate-gradient-x"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            {/* Brand with Advanced Styling */}
            <NavLink to="/" className="flex items-center gap-2 sm:gap-3 group">
              {/* Animated Logo */}
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-lg opacity-75 group-hover:opacity-100 blur transition duration-300 animate-pulse"></div>
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              {/* Brand Text with Gradient */}
              <div>
                <div className="font-black text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent group-hover:from-emerald-400 group-hover:via-teal-400 group-hover:to-cyan-400 transition-all duration-300">
                  insuredbycam
                </div>
                <div className="text-xs sm:text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  Insurance shopping, simplified
                </div>
              </div>
            </NavLink>

            {/* Desktop Navigation with Advanced Effects */}
            <nav className="hidden md:flex items-center gap-2">
              <TabLink to="/quotes" end label="Insurance Quotes" scrollToQuote />
              <TabLink to="/courses" label="Drivers Ed Courses" />
              <TabLink to="/store" label="Online Store" />
            </nav>

            {/* Mobile Menu Button with Animation */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300 relative group"
              aria-label="Toggle menu"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-xl opacity-0 group-hover:opacity-20 blur transition duration-300"></div>
              <div className="relative">
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 transition-transform duration-300 rotate-90" />
                ) : (
                  <Menu className="w-6 h-6 transition-transform duration-300" />
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu with Advanced Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-indigo-900/90 to-purple-900/95 backdrop-blur-2xl animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Floating gradient orbs */}
          <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full blur-3xl animate-float"></div>
          <div className="absolute bottom-20 left-20 w-64 h-64 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl animate-float-delayed"></div>

          {/* Menu Content */}
          <nav className="relative h-full flex flex-col items-center justify-center gap-4 p-8 animate-slideUp">
            <MobileTabLink to="/quotes" end label="Insurance Quotes" icon="📊" scrollToQuote />
            <MobileTabLink to="/drivers-ed" label="Drivers Ed Courses" icon="🚗" />
            <MobileTabLink to="/store" label="Online Store" icon="🛍️" />

            {/* Decorative element */}
            <div className="mt-8 flex items-center gap-2 text-sm text-white/50">
              <Sparkles className="w-4 h-4" />
              <span>Choose your path</span>
            </div>
          </nav>
        </div>
      )}

      {/* Spacer for fixed header */}
      <div className="h-[73px] sm:h-[81px]"></div>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ADD FOOTER HERE - Replace the old footer with the new Footer component */}
      <Footer />

      {/* Global Styles */}
      <style>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(20px, -20px) rotate(5deg); }
          66% { transform: translate(-20px, 20px) rotate(-5deg); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-gradient-x { background-size: 200% 200%; animation: gradient-x 3s ease infinite; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.4s ease-out; }
        .animate-float { animation: float 8s ease-in-out infinite; }
        .animate-float-delayed { animation: float 10s ease-in-out infinite; animation-delay: -5s; }
        .animate-shimmer { animation: shimmer 8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function TabLink({ to, label, end, scrollToQuote }) {
  const handleClick = (e) => {
    if (scrollToQuote && to === '/quotes') {
      // Small delay to allow navigation to complete
      setTimeout(() => {
        const quoteButton = document.querySelector('.canopy-connect-embed');
        if (quoteButton) {
          quoteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  return (
    <NavLink
      to={to}
      end={end}
      onClick={handleClick}
      className={({ isActive }) => {
        return [
          'relative px-4 lg:px-6 py-2.5 rounded-full font-semibold transition-all text-sm lg:text-base whitespace-nowrap group overflow-hidden',
          isActive ? 'text-slate-900' : 'text-gray-300 hover:text-white',
        ].join(' ');
      }}
    >
      {({ isActive }) => (
        <>
          {/* Animated Background */}
          <div
            className={`absolute inset-0 transition-all duration-500 ${
              isActive
                ? 'bg-white shadow-lg scale-100'
                : 'bg-white/0 group-hover:bg-white/10 scale-95 group-hover:scale-100'
            } rounded-full`}
          ></div>

          {/* Gradient Border on Active */}
          {isActive && (
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 rounded-full opacity-50 blur-sm animate-pulse"></div>
          )}

          {/* Shine Effect on Hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 rounded-full"></div>

          {/* Text */}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileTabLink({ to, label, end, icon, scrollToQuote }) {
  const handleClick = (e) => {
    if (scrollToQuote && to === '/quotes') {
      // Small delay to allow navigation and menu close
      setTimeout(() => {
        const quoteButton = document.querySelector('.canopy-connect-embed');
        if (quoteButton) {
          quoteButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  };

  return (
    <NavLink
      to={to}
      end={end}
      onClick={handleClick}
      className="relative w-full max-w-sm group overflow-hidden"
    >
      {({ isActive }) => (
        <div className="relative">
          {/* Glow effect on active */}
          {isActive && (
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 rounded-2xl opacity-50 blur-lg animate-pulse"></div>
          )}

          {/* Card */}
          <div
            className={`relative px-8 py-5 rounded-2xl font-bold text-lg text-left transition-all duration-300 flex items-center gap-4 ${
              isActive
                ? 'bg-white text-slate-900 shadow-2xl scale-105'
                : 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:scale-105 border border-white/10'
            }`}
          >
            {/* Icon */}
            <span className="text-3xl">{icon}</span>

            {/* Label */}
            <span className="flex-1">{label}</span>

            {/* Arrow indicator */}
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${
                isActive ? 'translate-x-0' : 'translate-x-[-10px] group-hover:translate-x-0'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>

            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
          </div>
        </div>
      )}
    </NavLink>
  );
}

export default Layout;