// src/components/BottomTabBar.jsx
// Mobile-only bottom tab bar for primary navigation (hidden on md: and above)

import { NavLink, useLocation } from 'react-router-dom';
import { Camera, RotateCcw, Shield, Grid } from 'lucide-react';

// Leads is hidden while the agency focuses on Rate Check partner referrals (the page still works by URL).
const TABS = [
  { to: '/agency/leads/rate-checks', label: 'Rate Checks', icon: Camera },
  { to: '/agency/winbacks', label: 'Winbacks', icon: RotateCcw },
  { to: '/agency/retention', label: 'Retention', icon: Shield, principalOnly: true },
];

function BottomTabBar({ onMorePress, moreActive, drawerOpen = false, agencyRole = null }) {
  const location = useLocation();
  // Retention is principal-only; producers would hit /unauthorized.
  const tabs = TABS.filter(t => !t.principalOnly || !agencyRole || agencyRole === 'principal');

  const matches = (to) => location.pathname === to || location.pathname.startsWith(to + '/');
  // The most specific tab wins: /agency/leads/rate-checks lights Rate Checks, not Leads.
  const best = tabs.filter(t => matches(t.to)).sort((a, b) => b.to.length - a.to.length)[0]?.to;
  const onTab = (to) => to === best;
  // Exactly one tab is active: an open More drawer wins; otherwise a tab whose path
  // matches wins over More (Rate Checks is under /agency/leads but also in the drawer).
  const anyTab = tabs.some(t => onTab(t.to));
  const isTabActive = (to) => !drawerOpen && onTab(to);
  const moreOn = drawerOpen || (moreActive && !anyTab);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-[#D8E1F0] bg-white/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const active = isTabActive(tab.to);
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="flex flex-col items-center justify-center flex-1 h-full relative group"
            >
              {/* Active pill highlight */}
              {active && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-[#1D4ED8]" />
              )}
              <div
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-blue-50'
                    : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    active ? 'text-[#1D4ED8]' : 'text-[#546280]'
                  }`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className={`text-[10px] leading-tight font-medium truncate max-w-[64px] transition-colors duration-200 ${
                    active ? 'text-[#1D4ED8]' : 'text-[#546280]'
                  }`}
                >
                  {tab.label}
                </span>
              </div>
            </NavLink>
          );
        })}

        {/* More tab */}
        <button
          onClick={onMorePress}
          className="flex flex-col items-center justify-center flex-1 h-full relative"
        >
          {moreOn && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-[#1D4ED8]" />
          )}
          <div
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
              moreOn ? 'bg-blue-50' : ''
            }`}
          >
            <Grid
              className={`w-5 h-5 transition-colors duration-200 ${
                moreOn ? 'text-[#1D4ED8]' : 'text-[#546280]'
              }`}
              strokeWidth={moreOn ? 2.2 : 1.8}
            />
            <span
              className={`text-[10px] leading-tight font-medium transition-colors duration-200 ${
                moreOn ? 'text-[#1D4ED8]' : 'text-[#546280]'
              }`}
            >
              More
            </span>
          </div>
        </button>
      </nav>
    </div>
  );
}

export default BottomTabBar;
