// src/lib/supabase.js
// Supabase client configuration for newsroom

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials not found. Newsroom features will not work.');
  console.warn('Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'quotesync-newsroom'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

/**
 * Check if user is authenticated and get their profile (role + full_name)
 */
export const getUserRole = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, role: 'viewer', profile: null };
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', user.id)
      .single();

    return {
      user,
      role: profileData?.role || 'viewer',
      profile: profileData
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return { user: null, role: 'viewer', profile: null };
  }
};

/**
 * Check if user has permission level
 */
export const hasPermission = (userRole, requiredRole) => {
  const roleHierarchy = { viewer: 0, editor: 1, admin: 2 };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};
