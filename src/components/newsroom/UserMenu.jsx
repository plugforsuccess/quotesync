// src/components/newsroom/UserMenu.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { supabase, getUserRole } from '../../lib/supabase';

const UserMenu = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Get current user
    const fetchUser = async () => {
      const { user: currentUser, role: currentRole } = await getUserRole();
      setUser(currentUser);
      setRole(currentRole);
    };

    fetchUser();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          const { user: currentUser, role: currentRole } = await getUserRole();
          setUser(currentUser);
          setRole(currentRole);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setRole(null);
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (!user) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
      >
        <User className="w-4 h-4" />
        Login
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <User className="w-4 h-4 text-gray-700" />
        <div className="text-left">
          <div className="text-sm font-medium text-gray-900">
            {user.email.split('@')[0]}
          </div>
          <div className="text-xs text-gray-500 capitalize">{role}</div>
        </div>
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="text-sm font-medium text-gray-900">{user.email}</div>
            <div className="text-xs text-gray-500 capitalize">Role: {role}</div>
          </div>
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
