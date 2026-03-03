// src/components/VerificationBanner.jsx
// Yellow banner shown at the top of every admin page when employee
// verifications are overdue (90+ days since last_verified_at).

import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useVerificationDue } from '../hooks/useEmployees';

export default function VerificationBanner() {
  const { currentAgencyId, isPlatformUser, hasPlatformRole } = useAuth();

  // Only show to admin users
  const isAdmin = isPlatformUser && hasPlatformRole('platform_admin');

  const { data: overdue = [] } = useVerificationDue(isAdmin ? currentAgencyId : null);

  if (!isAdmin || overdue.length === 0) return null;

  const message =
    overdue.length === 1
      ? (() => {
          const emp = overdue[0];
          const name = `${emp.first_name} ${emp.last_name}`;
          const days = emp.last_verified_at
            ? Math.floor((Date.now() - new Date(emp.last_verified_at).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return days !== null
            ? `Employee verification overdue — ${name} hasn't been verified in ${days} days.`
            : `Employee verification overdue — ${name} has never been verified.`;
        })()
      : `${overdue.length} employee records are overdue for verification.`;

  return (
    <div className="bg-yellow-50 border-b border-yellow-200">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-yellow-800">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
          <span>{message}</span>
        </div>
        <Link
          to="/admin/agency/employees"
          className="text-sm font-medium text-yellow-700 hover:text-yellow-900 whitespace-nowrap"
        >
          Review Now &rarr;
        </Link>
      </div>
    </div>
  );
}
