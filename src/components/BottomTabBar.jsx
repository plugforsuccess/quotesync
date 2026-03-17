// src/components/BottomTabBar.jsx
// Mobile-only bottom tab bar for primary navigation (hidden on md: and above)

import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, BarChart2, DollarSign, Grid } from 'lucide-react';

const tabs = [
  { to: '/agency/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agency/leads', label: 'Leads', icon: ClipboardList },
  { to: '/admin/staff-performance', label: 'Performance', icon: BarChart2 },
  { to: '/admin/revenue-projections', label: 'Revenue', icon: DollarSign },
];

function BottomTabBar({ onMorePress, moreActive }) {
  const location = useLocation();

  const isTabActive = (to) =>
    location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/10 bg-[#0f172a]/95 backdrop-blur-xl"
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
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" />
              )}
              <div
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-emerald-500/15'
                    : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors duration-200 ${
                    active ? 'text-emerald-400' : 'text-white/60'
                  }`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className={`text-[10px] leading-tight font-medium truncate max-w-[64px] transition-colors duration-200 ${
                    active ? 'text-emerald-400' : 'text-white/60'
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
          {moreActive && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" />
          )}
          <div
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
              moreActive ? 'bg-emerald-500/15' : ''
            }`}
          >
            <Grid
              className={`w-5 h-5 transition-colors duration-200 ${
                moreActive ? 'text-emerald-400' : 'text-white/60'
              }`}
              strokeWidth={moreActive ? 2.2 : 1.8}
            />
            <span
              className={`text-[10px] leading-tight font-medium transition-colors duration-200 ${
                moreActive ? 'text-emerald-400' : 'text-white/60'
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
