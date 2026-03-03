// src/components/newsroom/UserMenu.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const UserMenu = ({ activePlane, onTogglePlane }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, profile, isPlatformUser, signOut } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

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
    await signOut();
    navigate('/admin-access-8by2X');
  };

  if (!user) {
    return null;
  }

  // Display name: use full_name if available, otherwise fall back to email
  const displayName = profile?.full_name || user?.email || 'User';

  const isAdminView = activePlane === 'platform';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
      >
        <User className="w-4 h-4 text-gray-300" />
        <div className="text-left">
          <div className="text-sm font-medium text-white">
            {displayName}
          </div>
          <div className="text-xs text-gray-400 capitalize">{role}</div>
        </div>
      </button>

      {showDropdown && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-56 bg-[#1a1d28] rounded-lg shadow-lg border border-white/10 py-1 z-50"
        >
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
                {isAdminView ? 'Switch to Consumer View' : 'Switch to Admin View'}
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
