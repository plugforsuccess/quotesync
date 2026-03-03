// src/components/newsroom/UserMenu.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../../contexts/auth-context';

const UserMenu = () => {
  const navigate = useNavigate();
  const { user, role, profile, signOut } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = async (e) => {
    e.stopPropagation();
    await signOut();
    navigate('/admin-access-8by2X');
  };

  if (!user) {
    return null; // Don't show login button to public users
  }

  // Display name: use full_name if available, otherwise fall back to email
  const displayName = profile?.full_name || user?.email || 'User';

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <User className="w-4 h-4 text-gray-700" />
        <div className="text-left">
          <div className="text-sm font-medium text-gray-900">
            {displayName}
          </div>
          <div className="text-xs text-gray-500 capitalize">{role}</div>
        </div>
      </button>

      {showDropdown && (
        <div
          className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
