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
    navigate('/admin-access-8by2X');
  };

  if (!user) {
    return null; // Don't show login button to public users
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
          {(role === 'admin' || role === 'editor') && (
            <button
              onClick={() => {
                navigate('/news/dashboard');
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Dashboard
            </button>
          )}
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
