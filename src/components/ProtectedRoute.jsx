// src/components/ProtectedRoute.jsx
// Route protection component for admin/editor pages

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../lib/supabase';

const ProtectedRoute = ({ children, requiredRole = 'editor' }) => {
  const { user, role, loading } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated or insufficient permissions
  if (!user || !hasPermission(role, requiredRole)) {
    return <Navigate to="/admin-access-8by2X" replace />;
  }

  // Render protected content
  return children;
};

export default ProtectedRoute;
