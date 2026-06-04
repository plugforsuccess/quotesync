// components/Layout.jsx - ULTRA ADVANCED VERSION
// Updated: Primary/secondary nav split with hamburger menu for secondary pages
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, Sparkles, Clock, Shield, Building2, Users, Newspaper, Search, Settings, Phone as PhoneIcon, Bell } from 'lucide-react';
import Footer from './Footer';
import UserMenu from './newsroom/UserMenu';
import HamburgerMenu from './HamburgerMenu';
import BottomTabBar from './BottomTabBar';
import VerificationBanner from './VerificationBanner';
import ImpersonationBanner from './ImpersonationBanner';
import ThemeToggle from './ThemeToggle';
import PersonaSwitcher from './PersonaSwitcher';
import { useForceTheme } from '../contexts/ThemeContext';
import UploadChecklistModal from '../pages/components/shared/UploadChecklistModal';
import { useUploadChecklist } from '../hooks/useUploadChecklist';
import { useManagementCadence } from '../hooks/useManagementCadence';
import { useAuth } from '../contexts/AuthContext';
import { useAutoSyncPersona } from '../hooks/usePersona';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { PLANES, getNavItems, roleDisplayNames } from '../config/navConfig';

function Layout({ forcePlane = null }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hideNav, setHideNav] = useState(false);
  const location = useLocation();
  const scrollTimeoutRef = useRef(null);
  const lastScrollY = useRef(0);

  // Two-Plane RBAC: Get user context and determine active plane
  const {
    user, profile, isPlatformUser, platformRole,
    activePlane: authPlane, currentAgencyRole, currentAgencyId,
    agencyMemberships
  } = useAuth();

  // Upload/cadence checklist — principals only. useUploadChecklist already
  // includes management cadence items (category: 'management') sourced from
  // cadence_events; useManagementCadence provides the logCadenceEvent action
  // plus per-employee overdue cadences and overdue commitments for the modal.
  const [checklistOpen, setChecklistOpen] = useState(false);
  const { data: allChecklistItems = [] } = useUploadChecklist(
    currentAgencyRole === 'principal' ? currentAgencyId : null
  );
  const {
    logCadenceEvent,
    overdueCadences,
    overdueCommitments,
  } = useManagementCadence(
    currentAgencyRole === 'principal' ? currentAgencyId : null
  );

  const actionableCount = allChecklistItems.filter(
    i => i.status === 'due' || i.status === 'overdue'
  ).length + (overdueCadences?.length || 0) + (overdueCommitments?.length || 0);

  // Auto-show modal once per session if principal has actionable items
  useEffect(() => {
    const sessionKey = 'qs_checklist_shown_v2';
    if (sessionStorage.getItem(sessionKey)) return;
    if (currentAgencyRole !== 'principal') return;
    if (!currentAgencyId) return;
    if (allChecklistItems.length > 0 && actionableCount > 0) {
      setChecklistOpen(true);
      sessionStorage.setItem(sessionKey, '1');
    }
  }, [allChecklistItems.length, actionableCount, currentAgencyId, currentAgencyRole]);

  // Platform users can toggle between platform and consumer views
  // Agency users see agency plane, everyone else sees consumer
  const [planeOverride, setPlaneOverride] = useState(null);
  // forcePlane takes highest priority — used by admin routes to guarantee
  // platform nav regardless of loading state or sessionStorage cache
  const activePlane = forcePlane || planeOverride || authPlane;

  // Reset override when auth state changes
  useEffect(() => {
    setPlaneOverride(null);
  }, [authPlane]);

  // Persona is a UI lens for principals only — it reshapes the top nav so
  // Sales mode shows Sales-relevant links, Service mode shows the rep
  // workspace, etc. useAutoSyncPersona keeps the pill honest by snapping it
  // to whatever URL is being viewed. Both a principal and a dual-role
  // (sales + service) employee wear more than one hat, so both auto-sync and
  // get the hat-based nav.
  const { data: myEmployee } = useCurrentEmployee();
  const repRoles = myEmployee?.roles || [];
  const isPrincipal = currentAgencyRole === 'principal';
  const hasService = repRoles.includes('service_inbound')
    || repRoles.includes('service_outbound') || repRoles.includes('service');
  const hasSales = repRoles.includes('sales');
  const multiHat = isPrincipal || (hasSales && hasService);
  const [persona] = useAutoSyncPersona(multiHat, isPrincipal ? 'principal' : 'service');

  // Get navigation items based on active plane, role, the active persona, and
  // (for rep employees) their roles. Returns { primary: [...], secondary: [...] }.
  const { primary: primaryNav, secondary: secondaryNav } = getNavItems(
    activePlane, platformRole, currentAgencyRole, persona, repRoles,
  );
  // Plane-aware role label: when browsing the agency plane the agency role
  // takes priority (so a platform_editor like Logan with a producer
  // membership shows 'Producer' instead of 'Editor'); platform plane always
  // shows the platform role.
  const roleLabel = activePlane === PLANES.AGENCY
    ? currentAgencyRole
      ? roleDisplayNames[currentAgencyRole]
      : platformRole
      ? roleDisplayNames[platformRole]
      : null
    : platformRole
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

  // Minimal funnel nav on /save routes
  const isFunnelRoute = location.pathname === '/save' || location.pathname.startsWith('/save/');

  // Consumer-facing surfaces (public landing + funnel) are designed dark and
  // don't benefit from light/high-contrast themes — force dark for the
  // lifetime of this Layout render. Internal planes (agency / platform) keep
  // the user's chosen theme. The user preference is NOT mutated.
  const lockToDark = activePlane === PLANES.CONSUMER || isFunnelRoute;
  useForceTheme(lockToDark ? 'dark' : null);

  // Theme toggle is only meaningful on internal pages — hide it everywhere
  // the theme is locked to dark.
  const showThemeToggle = !lockToDark;

  // Throttled handler — blur effect only (non-funnel nav)
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setScrolled(window.scrollY > 10);
    }, 100);
  }, []);

  // Unthrottled handler — funnel hide/show (runs every scroll frame)
  const handleFunnelScroll = useCallback(() => {
    if (!isFunnelRoute) return;
    const currentY = window.scrollY;
    const scrollingDown = currentY > lastScrollY.current;
    setHideNav(scrollingDown && currentY > 80);
    lastScrollY.current = currentY;
  }, [isFunnelRoute]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleFunnelScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleFunnelScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, handleFunnelScroll]);

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

  // Mobile drawer state (triggered by "More" tab in bottom bar)
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [drawerOpen]);

  // Bottom tab bar routes (items shown in tab bar, excluded from drawer)
  const bottomTabRoutes = [
    '/agency/dashboard',
    '/agency/leads',
    '/admin/staff-performance',
    '/admin/revenue-projections',
  ];

  // Drawer nav items: secondary items that are NOT in the bottom tab bar, grouped
  const drawerGroups = buildDrawerGroups(primaryNav, secondaryNav, bottomTabRoutes, currentAgencyRole);

  // Check if a drawer item is currently active (to highlight "More" tab)
  const allDrawerItems = drawerGroups.flatMap(g => g.items);
  const isDrawerRouteActive = allDrawerItems.some(
    item => location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  // Show bottom tab bar only for agency/platform planes (not consumer)
  const showBottomTabs = activePlane === PLANES.AGENCY || activePlane === PLANES.PLATFORM;

  // Reset hideNav when leaving funnel route
  useEffect(() => {
    if (!isFunnelRoute) setHideNav(false);
  }, [isFunnelRoute]);

  return (
    <div className="qs-app-shell min-h-screen bg-[#0f172a] text-white flex flex-col">
      {isFunnelRoute ? (
        /* ── Minimal funnel nav — dark glass, logo + phone only ── */
        <header
          className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/80 backdrop-blur-2xl border-b border-white/10 transition-transform duration-300"
          style={{
            overflow: 'visible',
            transform: hideNav ? 'translateY(-100%)' : 'translateY(0)',
          }}
        >
          {/* Animated gradient line — identical to full nav */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 animate-gradient-x"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">

            {/* Logo — pixel-for-pixel copy of full nav logo */}
            <NavLink to="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-lg opacity-75 group-hover:opacity-100 blur transition duration-300 animate-pulse"></div>
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="font-black text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent group-hover:from-emerald-400 group-hover:via-teal-400 group-hover:to-cyan-400 transition-all duration-300">
                  insuredbycam
                </div>
                <div className="text-xs sm:text-sm text-gray-400">
                  Insurance shopping, simplified
                </div>
              </div>
            </NavLink>

            {/* Phone CTA — only rendered if env var is set */}
            {import.meta.env.VITE_BLAND_INBOUND_NUMBER && (
              <a
                href={`tel:${import.meta.env.VITE_BLAND_INBOUND_NUMBER_E164 || import.meta.env.VITE_BLAND_INBOUND_NUMBER}`}
                className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <span className="hidden sm:inline text-gray-400 font-normal">Call an agent now:</span>
                <span className="font-black text-white">
                  {import.meta.env.VITE_BLAND_INBOUND_NUMBER}
                </span>
              </a>
            )}

          </div>
        </header>
      ) : (
      /* ── Full QuoteSync nav ── */
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

            {/* Bland AI Inbound Phone CTA — "Call for a Quote" */}
            {import.meta.env.VITE_BLAND_INBOUND_NUMBER && activePlane === PLANES.CONSUMER && (
              <a
                href={`tel:${import.meta.env.VITE_BLAND_INBOUND_NUMBER_E164 || import.meta.env.VITE_BLAND_INBOUND_NUMBER}`}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all duration-300 group"
              >
                <PhoneIcon className="w-4 h-4 group-hover:animate-pulse" />
                <span className="text-sm font-semibold whitespace-nowrap">
                  {import.meta.env.VITE_BLAND_INBOUND_NUMBER}
                </span>
                <span className="hidden lg:inline text-xs text-gray-400 font-normal">Call for a Quote</span>
              </a>
            )}

            {/* Desktop Navigation with Advanced Effects */}
            <nav className="hidden md:flex items-center gap-3">
              {/* Primary nav items — always visible */}
              {primaryNav.map((item, idx) => (
                <TabLink
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  isPrimary={item.isPrimary && idx === 0}
                  scrollToQuote={item.scrollToQuote}
                />
              ))}

              {/* Hamburger menu for secondary nav items */}
              {secondaryNav.length > 0 && (
                <HamburgerMenu items={secondaryNav} />
              )}

              {/* Persona switcher — principals only, hidden if only one persona is available */}
              <PersonaSwitcher compact />

              {/* Checklist bell — principals only (desktop) */}
              {currentAgencyRole === 'principal' && (
                <ChecklistBell
                  count={actionableCount}
                  onClick={() => setChecklistOpen(true)}
                />
              )}

              {/* Theme toggle — dark / light / high contrast. Only shown on
                  internal planes (consumer/funnel stay dark) */}
              {showThemeToggle && <ThemeToggle variant="pill" />}

              <UserMenu
                activePlane={activePlane}
                onTogglePlane={() => setPlaneOverride(p => {
                  const current = p || authPlane;
                  return current === PLANES.PLATFORM ? PLANES.CONSUMER : PLANES.PLATFORM;
                })}
              />
            </nav>

            {/* Mobile checklist bell — principals only, visible on mobile */}
            {currentAgencyRole === 'principal' && (
              <div className="md:hidden flex items-center">
                <ChecklistBell
                  count={actionableCount}
                  onClick={() => setChecklistOpen(true)}
                  compact
                />
              </div>
            )}

            {/* Mobile Menu Button — only shown when bottom tab bar is NOT active (consumer plane) */}
            {!showBottomTabs && (
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
            )}
          </div>
        </div>
      </header>
      )}

      {/* Mobile Menu with Advanced Overlay — kept for consumer plane (non-tab-bar planes) */}
      {mobileMenuOpen && !showBottomTabs && !isFunnelRoute && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-primary-900/90 to-secondary-900/95 backdrop-blur-2xl animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Floating gradient orbs */}
          <div className="absolute top-20 right-20 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-full blur-3xl animate-float"></div>
          <div className="absolute bottom-20 left-20 w-64 h-64 bg-gradient-to-br from-cyan-500/20 to-primary-500/20 rounded-full blur-3xl animate-float-delayed"></div>

          {/* Menu Content */}
          <nav className="relative h-full flex flex-col items-center justify-center gap-4 p-8 animate-slideUp overflow-y-auto">
            {primaryNav.map((item, idx) => (
              <MobileTabLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                isPrimary={item.isPrimary && idx === 0}
                scrollToQuote={item.scrollToQuote}
              />
            ))}

            {primaryNav.length > 0 && secondaryNav.length > 0 && (
              <div className="w-full max-w-sm flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/20"></div>
                <span className="text-xs text-white/40 uppercase tracking-wider font-medium">More</span>
                <div className="flex-1 h-px bg-white/20"></div>
              </div>
            )}

            {secondaryNav.map((item) => (
              <MobileTabLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
              />
            ))}

            <div className="mt-4 flex flex-col items-center gap-3">
              {/* Theme toggle — mobile; hidden on consumer/funnel routes */}
              {showThemeToggle && <ThemeToggle variant="pill" />}
              <UserMenu
                activePlane={activePlane}
                onTogglePlane={() => setPlaneOverride(p => {
                  const current = p || authPlane;
                  return current === PLANES.PLATFORM ? PLANES.CONSUMER : PLANES.PLATFORM;
                })}
              />
            </div>
          </nav>
        </div>
      )}

      {/* Mobile "More" Drawer — slide-over from right, triggered by bottom tab bar */}
      {drawerOpen && !isFunnelRoute && (activePlane === PLANES.AGENCY || activePlane === PLANES.PLATFORM) && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div
            className="absolute right-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[#0f172a] border-l border-white/10 flex flex-col animate-slideInRight overflow-hidden"
            style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <span className="text-sm font-semibold text-white">More</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer nav groups */}
            <nav className="flex-1 overflow-y-auto py-2">
              {drawerGroups.map((group) => (
                <div key={group.label}>
                  {/* Section header */}
                  <div className="px-4 py-2">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-white/40">
                      {group.label}
                    </span>
                  </div>

                  {/* Section items */}
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        [
                          'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors mx-2 rounded-lg',
                          isActive
                            ? 'bg-white/10 text-emerald-400 border-l-2 border-emerald-400'
                            : 'text-gray-300 hover:bg-white/10 hover:text-white',
                        ].join(' ')
                      }
                    >
                      {item.lucideIcon && <item.lucideIcon className="w-5 h-5 flex-shrink-0" strokeWidth={1.8} />}
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            {/* User footer */}
            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Avatar initials */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {getInitials(profile?.full_name || user?.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {profile?.full_name || user?.email || 'User'}
                  </div>
                  <div className="text-xs text-gray-400 capitalize">
                    {roleLabel || 'User'}
                  </div>
                </div>
              </div>

              {/* Admin tools link — agent role only */}
              {currentAgencyRole === 'principal' && (
                <NavLink
                  to="/admin"
                  className="flex items-center gap-2 mt-3 px-2 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin Tools</span>
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed header. Sized to clear the tallest nav row, which
          is dominated by the two-line UserMenu button (name + role). The old
          81px value was right at the edge and let the nav overlap page
          headers (e.g. the "+ Upload Audit Report" button on /agency/cross-sell)
          whenever the user button rendered slightly taller than expected. */}
      <div className="h-[80px] sm:h-[96px]"></div>

      {/* Verification overdue banner — admin only */}
      {!isFunnelRoute && <VerificationBanner />}
      {/* Impersonation mode banner — shown when platform admin is viewing as an agency */}
      {!isFunnelRoute && <ImpersonationBanner />}

      {/* Main content — top padding gives breathing room below the fixed
          nav (pages were sitting flush against the border). Bottom padding
          on mobile is for bottom-tab-bar clearance. */}
      <main className={`flex-1 pt-4 sm:pt-6 ${showBottomTabs && !isFunnelRoute ? 'pb-20 md:pb-0' : ''}`}>
        <Outlet />
      </main>

      {/* Consumer-branded footer — consumer plane only. Agency and platform
          portals should not show insuredbycam.com marketing content. */}
      {!isFunnelRoute && activePlane === PLANES.CONSUMER && <Footer />}

      {/* Bottom Tab Bar — mobile only, agency/platform planes */}
      {showBottomTabs && !isFunnelRoute && (
        <BottomTabBar
          onMorePress={() => setDrawerOpen(prev => !prev)}
          moreActive={drawerOpen || isDrawerRouteActive}
        />
      )}

      {/* Upload & cadence checklist modal — principals only, accessible from bell icon */}
      {checklistOpen && currentAgencyRole === 'principal' && (
        <UploadChecklistModal
          items={allChecklistItems}
          agencyId={currentAgencyId}
          overdueCadences={overdueCadences}
          overdueCommitments={overdueCommitments}
          onDismiss={() => setChecklistOpen(false)}
          onLogCadence={logCadenceEvent}
        />
      )}
    </div>
  );
}

// ── Checklist bell icon with badge ──────────────────────────────────────────
function ChecklistBell({ count, onClick, compact = false }) {
  const badgeColor = count > 3 ? '#EF4444' : '#F59E0B';
  const iconSize = compact ? 'w-5 h-5' : 'w-5 h-5';
  const badgeDim = compact ? 14 : 16;
  const badgeFont = compact ? 8 : 9;
  return (
    <button
      onClick={onClick}
      className="relative p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
      aria-label={`Open checklist${count > 0 ? ` (${count} items due)` : ''}`}
      title="Upload & Review Checklist"
    >
      <Bell className={iconSize} />
      {count > 0 && (
        <span
          style={{
            position: 'absolute', top: 4, right: 4,
            width: badgeDim, height: badgeDim, borderRadius: '50%',
            background: badgeColor,
            color: '#fff', fontSize: badgeFont, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

function TabLink({ to, label, end, scrollToQuote, isPrimary }) {
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

          {/* Text */}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileTabLink({ to, label, end, icon, scrollToQuote, isPrimary }) {
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

// ── Drawer helpers ──────────────────────────────────────────────────────────

// Map of route patterns to Lucide icons for the drawer
const drawerIconMap = {
  '/admin/time-attendance': Clock,
  '/admin/book-health': Shield,
  '/agency/retention': Shield,
  '/admin/agencies': Building2,
  '/admin/agency/employees': Users,
  '/news': Newspaper,
  '/admin/audit': Search,
  '/agency/settings': Settings,
};

function getDrawerIcon(to) {
  for (const [pattern, icon] of Object.entries(drawerIconMap)) {
    if (to === pattern || to.startsWith(pattern + '/')) return icon;
  }
  return null;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

// Build grouped drawer items from primary + secondary nav, excluding bottom tab routes
function buildDrawerGroups(primaryNav, secondaryNav, bottomTabRoutes, agencyRole) {
  const all = [...primaryNav, ...secondaryNav];
  // Filter out items already in bottom tab bar
  const filtered = all.filter(item => !bottomTabRoutes.includes(item.to));

  // Categorize items into groups
  const agencyItems = [];
  const contentItems = [];
  const adminItems = [];

  const agencyRoutes = ['/admin/time-attendance', '/admin/book-health', '/agency/retention', '/admin/agencies', '/admin/agency/employees'];
  const contentRoutes = ['/news', '/admin/audit'];

  for (const item of filtered) {
    const enriched = { ...item, lucideIcon: getDrawerIcon(item.to) };

    if (agencyRoutes.some(r => item.to === r || item.to.startsWith(r + '/'))) {
      agencyItems.push(enriched);
    } else if (contentRoutes.some(r => item.to === r || item.to.startsWith(r + '/'))) {
      contentItems.push(enriched);
    } else if (item.to === '/agency/settings') {
      // Settings goes under agency
      agencyItems.push(enriched);
    } else {
      contentItems.push(enriched);
    }
  }

  const groups = [];
  if (agencyItems.length > 0) groups.push({ label: 'Agency', items: agencyItems });
  if (contentItems.length > 0) groups.push({ label: 'Content & Tools', items: contentItems });
  if (adminItems.length > 0) groups.push({ label: 'Admin', items: adminItems });

  return groups;
}

export default Layout;
