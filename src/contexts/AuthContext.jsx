// src/contexts/AuthContext.jsx
// Global authentication context with persistent session management

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({
  user: null,
  profile: null,
  role: 'viewer',
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {}
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(true);

  // Fetch user profile and role
  const fetchUserProfile = async (currentUser) => {
    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setRole('viewer');
      return;
    }

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', currentUser.id)
        .single();

      setUser(currentUser);
      setProfile(profileData);
      setRole(profileData?.role || 'viewer');
    } catch (error) {
      console.error('Error fetching profile:', error);
      setUser(currentUser);
      setProfile(null);
      setRole('viewer');
    }
  };

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (mounted) {
          if (session?.user) {
            await fetchUserProfile(session.user);
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AuthProvider] Auth state changed:', event, session?.user?.email);

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setLoading(true); // Set loading while fetching profile
            await fetchUserProfile(session.user);
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setRole('viewer');
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Sign out function
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setRole('viewer');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await fetchUserProfile(currentUser);
    }
  };

  const value = {
    user,
    profile,
    role,
    loading,
    signOut,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
