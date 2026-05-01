// src/components/newsroom/UserMenu.jsx
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { roleDisplayNames } from '../../config/navConfig';

function initialsFor(name) {
  if (!name) return '?';
  const cleaned = name.includes('@') ? name.split('@')[0] : name;
  const parts = cleaned.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const UserMenu = ({ activePlane, onTogglePlane }) => {
  const location = useLocation();
  const {
    user, role, profile, isPlatformUser, signOut,
    currentAgencyRole, platformRole, currentAgencyId,
  } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Prefer the employee record's preferred_name so the top-nav button matches
  // what the EmployeeLayout sidebar shows (e.g. "Cam Wiley") instead of the
  // legal name on the auth profile ("Cameron Wiley").
  const { data: employeeName } = useQuery({
    queryKey: ['user_menu_employee_name', currentAgencyId, user?.id],
    queryFn: async () => {
      if (!user?.id || !currentAgencyId) return null;
      const { data } = await supabase
        .from('employees')
        .select('preferred_name, first_name, last_name')
        .eq('org_id', currentAgencyId)
        .eq('auth_user_id', user.id)
        .eq('employment_status', 'active')
        .maybeSingle();
      if (!data) return null;
      return `${data.preferred_name || data.first_name || ''} ${data.last_name || ''}`.trim();
    },
    enabled: !!user?.id && !!currentAgencyId,
    staleTime: 10 * 60 * 1000,
  });

  // Close on route change
  useEffect(() => {
    setShowDropdown(false);
  }, [location]);

  // Close on click outside
  useEffect(() => {
    if (!showDropdown) return;

    function handleClickOutside(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleLogout = async (e) => {
    e.stopPropagation();
    setShowDropdown(false);
    try {
      // Race signOut against a 3s timeout — prevents hanging if auth lock is held.
      await Promise.race([
        signOut(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    } catch (err) {
      console.warn('[logout] signOut error (non-fatal):', err);
    }
    // Hard redirect to destroy all React state and force clean re-init.
    // Using navigate() here caused a race: if signOut hadn't cleared the user
    // state yet, LoginPage's useEffect would see the user still authenticated
    // and immediately redirect back to the admin dashboard.
    window.location.href = '/admin-access-8by2X';
  };

  if (!user) {
    return null;
  }

  // Display name priority: employees.preferred_name (matches the sidebar) →
  // profile.full_name (legal name fallback) → email.
  const displayName = employeeName || profile?.full_name || user?.email || 'User';

  // Plane-aware role label: in the agency plane, prefer the agency role
  // (so a principal isn't mislabeled "Editor" from the legacy profiles.role
  // column). In the platform plane, prefer the platform role. Fall back to
  // the legacy role only as a last resort (consumer plane).
  const roleText = (() => {
    if (activePlane === 'agency' && currentAgencyRole) {
      return roleDisplayNames[currentAgencyRole] || currentAgencyRole;
    }
    if (platformRole) {
      return roleDisplayNames[platformRole] || platformRole;
    }
    if (currentAgencyRole) {
      return roleDisplayNames[currentAgencyRole] || currentAgencyRole;
    }
    return roleDisplayNames[role] || role || 'User';
  })();

  const isAdminView = activePlane === 'platform';

  const initials = initialsFor(displayName);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowDropdown(!showDropdown)}
        title={`${displayName} · ${roleText}`}
        aria-label={`${displayName}, ${roleText}. Open user menu.`}
        className="flex items-center gap-2 pl-1 pr-3 py-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors max-w-[200px]"
      >
        <span
          className="flex items-center justify-center rounded-full text-xs font-bold text-blue-400 flex-shrink-0"
          style={{
            width: 28, height: 28,
            background: 'rgba(59,130,246,0.2)',
            border: '1px solid rgba(59,130,246,0.3)',
          }}
        >
          {initials}
        </span>
        <span className="text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
          {displayName}
        </span>
      </button>

      {showDropdown && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-64 bg-[#1a1d28] rounded-lg shadow-lg border border-white/10 py-1 z-50"
        >
          {/* Identity header — name + role live here so the top-nav button
              can stay tight (avatar + single-line name only). */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold text-white truncate">
              {displayName}
            </div>
            <div className="text-xs text-gray-400 capitalize truncate">
              {roleText}
            </div>
          </div>

          {/* Plane Switch — only for platform users */}
          {isPlatformUser && onTogglePlane && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlane();
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                {isAdminView ? 'Switch to Consumer' : 'Switch to Admin'}
              </button>
              <div className="mx-3 my-1 border-t border-white/10"></div>
            </>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
