// src/pages/AdminAgenciesPage.jsx
// Admin panel for managing agency applications and statuses

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Clock, CheckCircle, XCircle, Ban, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencies } from '../hooks/useAgencies';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'green', bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'red', bg: 'bg-red-100', text: 'text-red-700' },
  suspended: { label: 'Suspended', icon: Ban, color: 'gray', bg: 'bg-gray-100', text: 'text-gray-700' }
};

const AdminAgenciesPage = () => {
  const navigate = useNavigate();
  const { role: userRole } = useAuth();
  const [filter, setFilter] = useState('all');

  const { data: agencies = [], isLoading, error, refetch } = useAgencies(filter);

  // Redirect if not admin
  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // Stats
  const stats = {
    total: agencies.length,
    pending: agencies.filter(a => a.status === 'pending').length,
    approved: agencies.filter(a => a.status === 'approved').length,
    rejected: agencies.filter(a => a.status === 'rejected').length,
    suspended: agencies.filter(a => a.status === 'suspended').length
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading agencies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Agency Management</h1>
                <p className="text-gray-600 text-sm">Review applications and manage agency partners</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
              <div className="text-sm text-yellow-600">Pending</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
              <div className="text-sm text-green-600">Approved</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-700">{stats.rejected}</div>
              <div className="text-sm text-red-600">Rejected</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-700">{stats.suspended}</div>
              <div className="text-sm text-gray-600">Suspended</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'pending', 'approved', 'rejected', 'suspended'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Agency List */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {agencies.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No agencies found</h2>
            <p className="text-gray-600">
              {filter === 'all'
                ? 'No agencies have applied yet.'
                : `No agencies with status "${filter}"`}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Agency
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      States
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Applied
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {agencies.map((agency) => {
                    const statusConfig = STATUS_CONFIG[agency.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr key={agency.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-semibold text-gray-900">{agency.name}</div>
                            {agency.brand_name && (
                              <div className="text-sm text-gray-500">{agency.brand_name}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {agency.primary_contact_name || '-'}
                            </div>
                            <div className="text-gray-500">{agency.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600">
                            {agency.state_licenses?.length > 0
                              ? agency.state_licenses.slice(0, 3).join(', ') +
                                (agency.state_licenses.length > 3 ? ` +${agency.state_licenses.length - 3}` : '')
                              : '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(agency.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/admin/agencies/${agency.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgenciesPage;
