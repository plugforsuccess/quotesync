// components/Layout.jsx - ULTRA ADVANCED VERSION
// Updated: Primary/secondary nav split with hamburger menu for secondary pages
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Menu, X, Sparkles, RefreshCw } from 'lucide-react';
import Footer from './Footer';
import UserMenu from './newsroom/UserMenu';
import HamburgerMenu from './HamburgerMenu';
import NavBadge from './layout/NavBadge';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useUnresolvedAlertCount } from '../hooks/useAlertCount';
import { PLANES, getNavItems, roleDisplayNames } from '../config/nav.config';

function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const scrollTimeoutRef = useRef(null);

  // Two-Plane RBAC: Get user context and determine active plane
  const {
    user, profile, isPlatformUser, platformRole,
    activePlane: authPlane, currentAgencyRole, agencyMemberships
  } = useAuth();

  // Nav badge: unresolved alert count (admin only, scoped to org)
  const { platform } = usePermissions();
  const { data: alertCount } = useUnresolvedAlertCount(platform.isAdmin, user?.id);

  // Platform users can toggle between platform and consumer views
  // Agency users see agency plane, everyone else sees consumer
  const [planeOverride, setPlaneOverride] = useState(null);
  const activePlane = planeOverride || authPlane;

  // Reset override when auth state changes
  useEffect(() => {
    setPlaneOverride(null);
  }, [authPlane]);

  // Get navigation items based on active plane and role
  // Now returns { primary: [...], secondary: [...] }
  const { primary: primaryNav, secondary: secondaryNav } = getNavItems(activePlane, platformRole, currentAgencyRole);
  const roleLabel = platformRole
    ? roleDisplayNames[platformRole]
    : currentAgencyRole
    ? roleDisplayNames[currentAgencyRole]
    : null;

  // Agency brand name for header (when in agency plane)
  const agencyBrandName = activePlane === PLANES.AGENCY
    ? agencyMemberships.find(m => m.status === 'active')?.agencies?.brand_name
      || agencyMemberships.find(m => m.status === 'active')?.agencies?.name
      || null
    : null;

  // Handle scroll for nav blur effect with throttling
  useEffect(() => {
    const handleScroll = () => {
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Throttle scroll updates to every 100ms
      scrollTimeoutRef.current = setTimeout(() => {
        setScrolled(window.scrollY > 10);
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
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

  // All nav items combined for mobile menu
  const allNavItems = [...primaryNav, ...secondaryNav];

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
                  {agencyBrandName || 'Insurance shopping, simplified'}
                </div>
              </div>
            </NavLink>

            {/* Desktop Navigation with Advanced Effects */}
            <nav className="hidden md:flex items-center gap-3">
              {/* Plane Switcher for Platform Users */}
              {isPlatformUser && (
                <button
                  onClick={() => setPlaneOverride(p => {
                    const current = p || authPlane;
                    return current === PLANES.PLATFORM ? PLANES.CONSUMER : PLANES.PLATFORM;
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-white/10 hover:bg-white/20 text-gray-300 transition-all"
                  title="Switch view"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{activePlane === PLANES.PLATFORM ? 'Admin' : 'Consumer'}</span>
                </button>
              )}

              {/* Primary nav items — always visible */}
              {primaryNav.map((item, idx) => (
                <TabLink
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  isPrimary={item.isPrimary && idx === 0}
                  scrollToQuote={item.scrollToQuote}
                  badge={item.to === '/admin/cs-performance' ? alertCount : undefined}
                />
              ))}

              {/* Hamburger menu for secondary nav items */}
              {secondaryNav.length > 0 && (
                <HamburgerMenu items={secondaryNav} />
              )}

              <UserMenu />
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
            className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-primary-900/90 to-secondary-900/95 backdrop-blur-2xl animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Floating gradient orbs */}
          <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full blur-3xl animate-float"></div>
          <div className="absolute bottom-20 left-20 w-64 h-64 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl animate-float-delayed"></div>

          {/* Menu Content */}
          <nav className="relative h-full flex flex-col items-center justify-center gap-4 p-8 animate-slideUp overflow-y-auto">
            {/* Plane Switcher for Mobile */}
            {isPlatformUser && (
              <button
                onClick={() => setPlaneOverride(p => {
                  const current = p || authPlane;
                  return current === PLANES.PLATFORM ? PLANES.CONSUMER : PLANES.PLATFORM;
                })}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-white/10 hover:bg-white/20 text-gray-300 transition-all mb-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Viewing: {activePlane === PLANES.PLATFORM ? 'Platform Admin' : 'Consumer Site'}</span>
              </button>
            )}

            {/* Primary nav items */}
            {primaryNav.map((item, idx) => (
              <MobileTabLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                isPrimary={item.isPrimary && idx === 0}
                scrollToQuote={item.scrollToQuote}
                badge={item.to === '/admin/cs-performance' ? alertCount : undefined}
              />
            ))}

            {/* Separator between primary and secondary (if both exist) */}
            {primaryNav.length > 0 && secondaryNav.length > 0 && (
              <div className="w-full max-w-sm flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/20"></div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-medium">More</span>
                <div className="flex-1 h-px bg-white/20"></div>
              </div>
            )}

            {/* Secondary nav items */}
            {secondaryNav.map((item) => (
              <MobileTabLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
              />
            ))}

            {/* User Menu for Mobile */}
            <div className="mt-4">
              <UserMenu />
            </div>

            {/* Decorative element */}
            <div className="mt-8 flex items-center gap-2 text-sm text-white/50">
              <Sparkles className="w-4 h-4" />
              <span>{activePlane === PLANES.PLATFORM ? 'Admin Tools' : activePlane === PLANES.AGENCY ? 'Agency Portal' : 'Choose your path'}</span>
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
    </div>
  );
}

function TabLink({ to, label, end, scrollToQuote, isPrimary, badge }) {
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
          isPrimary
            ? isActive
              ? 'text-white'
              : 'text-white hover:text-white'
            : isActive
            ? 'text-slate-900'
            : 'text-gray-300 hover:text-white',
        ].join(' ');
      }}
    >
      {({ isActive }) => (
        <>
          {/* Animated Background */}
          <div
            className={`absolute inset-0 transition-all duration-500 ${
              isPrimary
                ? isActive
                  ? 'bg-gradient-to-r from-primary-600 to-secondary-600 shadow-xl scale-100'
                  : 'bg-gradient-to-r from-primary-600 to-secondary-600 opacity-90 group-hover:opacity-100 scale-100'
                : isActive
                ? 'bg-white shadow-lg scale-100'
                : 'bg-white/0 group-hover:bg-white/10 scale-95 group-hover:scale-100'
            } rounded-full`}
          ></div>

          {/* Gradient Border on Active */}
          {isActive && !isPrimary && (
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 rounded-full opacity-50 blur-sm animate-pulse"></div>
          )}

          {/* Shine Effect on Hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 rounded-full"></div>

          {/* Text + Badge */}
          <span className="relative z-10">
            {label}
            {badge > 0 && <NavBadge count={badge} />}
          </span>
        </>
      )}
    </NavLink>
  );
}

function MobileTabLink({ to, label, end, icon, scrollToQuote, isPrimary, badge }) {
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
            <div className={`absolute -inset-1 ${
              isPrimary
                ? 'bg-gradient-to-r from-primary-500 to-secondary-500'
                : 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500'
            } rounded-2xl opacity-50 blur-lg animate-pulse`}></div>
          )}

          {/* Card */}
          <div
            className={`relative px-8 py-5 rounded-2xl font-bold text-lg text-left transition-all duration-300 flex items-center gap-4 ${
              isPrimary
                ? isActive
                  ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-2xl scale-105'
                  : 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white backdrop-blur-sm hover:scale-105 opacity-90 hover:opacity-100'
                : isActive
                ? 'bg-white text-slate-900 shadow-2xl scale-105'
                : 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:scale-105 border border-white/10'
            }`}
          >
            {/* Icon */}
            <span className="text-3xl">{icon}</span>

            {/* Label + Badge */}
            <span className="flex-1 relative">
              {label}
              {badge > 0 && <NavBadge count={badge} />}
            </span>

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
