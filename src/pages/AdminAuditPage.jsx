// src/pages/AdminAuditPage.jsx
// Admin panel for viewing audit logs

import { useState, useEffect } from 'react';
import { FileSearch, RefreshCw, AlertCircle, Filter, Calendar, User, Building2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/auth-context';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../lib/supabase';

const EVENT_TYPE_CONFIG = {
  LEAD_CREATED: { label: 'Lead Created', color: 'green', bg: 'bg-green-100', text: 'text-green-700' },
  ROUTED: { label: 'Lead Routed', color: 'blue', bg: 'bg-blue-100', text: 'text-blue-700' },
  NOTIFIED: { label: 'Notification Sent', color: 'purple', bg: 'bg-purple-100', text: 'text-purple-700' },
  ROUTING_FALLBACK: { label: 'Routing Fallback', color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  STATUS_CHANGED: { label: 'Status Changed', color: 'orange', bg: 'bg-orange-100', text: 'text-orange-700' },
  ASSIGNED: { label: 'Lead Assigned', color: 'cyan', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  ADMIN_VIEW_LEAD: { label: 'Admin Viewed Lead', color: 'gray', bg: 'bg-gray-100', text: 'text-gray-700' },
  ADMIN_EXPORT_LEADS: { label: 'Leads Exported', color: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  ADMIN_REASSIGN_LEAD: { label: 'Lead Reassigned', color: 'pink', bg: 'bg-pink-100', text: 'text-pink-700' },
  ADMIN_IMPERSONATE_USER: { label: 'Impersonation Started', color: 'red', bg: 'bg-red-100', text: 'text-red-700' },
  ADMIN_END_IMPERSONATION: { label: 'Impersonation Ended', color: 'red', bg: 'bg-red-100', text: 'text-red-700' },
  ADMIN_UPDATE_AGENCY_STATUS: { label: 'Agency Status Updated', color: 'teal', bg: 'bg-teal-100', text: 'text-teal-700' },
  ADMIN_CREATE_ROUTING_RULE: { label: 'Routing Rule Created', color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  ADMIN_UPDATE_ROUTING_RULE: { label: 'Routing Rule Updated', color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  ADMIN_DELETE_ROUTING_RULE: { label: 'Routing Rule Deleted', color: 'rose', bg: 'bg-rose-100', text: 'text-rose-700' },
  LEAD_STATUS_UPDATED: { label: 'Lead Status Updated', color: 'amber', bg: 'bg-amber-100', text: 'text-amber-700' },
  LEAD_FIRST_CONTACT_SET: { label: 'First Contact Set', color: 'lime', bg: 'bg-lime-100', text: 'text-lime-700' }
};

const PAGE_SIZE = 50;

const AdminAuditPage = () => {
  const { platform } = usePermissions();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [eventTypeFilter, page]);

  // Check permissions
  if (!platform.canViewAuditLog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view audit logs.</p>
        </div>
      </div>
    );
  }

  if (isLoading && logs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading audit logs...</p>
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
            onClick={fetchLogs}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const eventTypes = ['all', ...Object.keys(EVENT_TYPE_CONFIG)];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileSearch className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
                <p className="text-gray-600 text-sm">View system activity and compliance records</p>
              </div>
            </div>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
              <div className="text-sm text-gray-600">Total Events</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-700">
                {logs.filter(l => l.event_type?.startsWith('LEAD_')).length}
              </div>
              <div className="text-sm text-blue-600">Lead Events (page)</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-700">
                {logs.filter(l => l.event_type?.startsWith('ADMIN_')).length}
              </div>
              <div className="text-sm text-purple-600">Admin Events (page)</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-700">
                {logs.filter(l => l.event_type === 'ROUTED' || l.event_type === 'ASSIGNED').length}
              </div>
              <div className="text-sm text-green-600">Routing Events (page)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Event Types</option>
              {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {logs.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <FileSearch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No audit logs found</h2>
            <p className="text-gray-600">
              {eventTypeFilter === 'all'
                ? 'No audit events have been recorded yet.'
                : `No events with type "${EVENT_TYPE_CONFIG[eventTypeFilter]?.label || eventTypeFilter}"`}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Event Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Agency
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Lead
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Actor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {logs.map((log) => {
                      const eventConfig = EVENT_TYPE_CONFIG[log.event_type] || {
                        label: log.event_type,
                        bg: 'bg-gray-100',
                        text: 'text-gray-700'
                      };

                      return (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="font-medium text-gray-900">
                                  {new Date(log.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                                <div className="text-gray-500">
                                  {new Date(log.created_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${eventConfig.bg} ${eventConfig.text}`}>
                              {eventConfig.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {log.agency_id ? (
                              <div className="flex items-center gap-2 text-sm">
                                <Building2 className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600 font-mono text-xs">
                                  {log.agency_id.substring(0, 8)}...
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {log.lead_id ? (
                              <div className="flex items-center gap-2 text-sm">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600 font-mono text-xs">
                                  {log.lead_id.substring(0, 8)}...
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {log.actor_user_id ? (
                              <div className="flex items-center gap-2 text-sm">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600 font-mono text-xs">
                                  {log.actor_user_id.substring(0, 8)}...
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">System</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {log.metadata && Object.keys(log.metadata).length > 0 ? (
                              <details className="text-sm">
                                <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                                  View details
                                </summary>
                                <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-w-xs">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} events
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="px-3 py-2 text-sm text-gray-600">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminAuditPage;
