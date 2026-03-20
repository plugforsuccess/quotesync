// src/pages/AgencyLeadsPage.jsx
// Agency Pipeline Dashboard - Lead List View

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Filter, Clock, FileText, ArrowUpDown,
  ChevronRight, Users, AlertCircle, BarChart3
} from 'lucide-react';
import { useCurrentAgency, useAgencyLeads, useAgencySLAMetrics } from '../hooks/useAgencyLeads';
import { getScoreColor, RISK_FLAG_CONFIG } from '../lib/leadScoring';
import PageSpinner from '../components/PageSpinner';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'interested', label: 'Interested' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'closed_won', label: 'Converted (LM)' },
  { value: 'closed_lost', label: 'Closed' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'referral', label: 'Referral' },
  { value: 'direct', label: 'Direct' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' }
];

const DOCS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Docs Available' },
  { value: 'no', label: 'No Docs' }
];

const RISK_OPTIONS = [
  { value: 'all',    label: 'All Risk Levels' },
  { value: 'green',  label: 'Clean' },
  { value: 'yellow', label: 'Review' },
  { value: 'red',    label: 'High Risk' },
];

function formatTimeAgo(date) {
  if (!date) return '-';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return 'Just now';
}

function formatDuration(date) {
  if (!date) return '-';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h`;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  return `${diffMins}m`;
}

const AgencyLeadsPage = () => {
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;

  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    zip: '',
    source: 'all',
    hasDocuments: 'all',
    riskFlag: 'all',
    minScore: '',
    maxScore: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Build filter object for query
  const queryFilters = useMemo(() => ({
    status: filters.status,
    zip: filters.zip || undefined,
    source: filters.source,
    hasDocuments: filters.hasDocuments,
    riskFlag: filters.riskFlag,
    minScore: filters.minScore ? parseInt(filters.minScore) : undefined,
    maxScore: filters.maxScore ? parseInt(filters.maxScore) : undefined
  }), [filters]);

  const { data: leads, isLoading: leadsLoading, error } = useAgencyLeads(agencyId, queryFilters);
  const { data: slaMetrics } = useAgencySLAMetrics(agencyId);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  if (agencyLoading) {
    return <PageSpinner />;
  }

  if (!currentAgency) {
    return (
      <div className="dark-page flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--qs-bright)' }}>No Agency Access</h2>
          <p style={{ color: 'var(--qs-dim)' }}>
            You are not currently associated with an agency. Please contact support if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-page">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="dark-header rounded-xl mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>
            {currentAgency.agencies?.name || 'Agency'} Pipeline
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <p style={{ color: 'var(--qs-dim)' }}>Manage and track your leads</p>
            <Link
              to="/agency/dashboard"
              className="text-sm text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"
            >
              <BarChart3 className="w-4 h-4" />
              Funnel Dashboard
            </Link>
          </div>
        </div>

        {/* SLA Metrics Cards */}
        {slaMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="dark-card">
              <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>
                <Users className="w-4 h-4" />
                Total Leads
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>{slaMetrics.totalLeads}</div>
            </div>
            <div className="dark-card">
              <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>
                <AlertCircle className="w-4 h-4" />
                Uncontacted
              </div>
              <div className="text-2xl font-bold text-orange-600">{slaMetrics.uncontactedBacklog}</div>
            </div>
            <div className="dark-card">
              <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>
                <Clock className="w-4 h-4" />
                Avg Contact (7d)
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>
                {slaMetrics.avgTimeToContact7d !== null ? `${slaMetrics.avgTimeToContact7d}h` : '-'}
              </div>
            </div>
            <div className="dark-card">
              <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--qs-subtle)' }}>
                <Clock className="w-4 h-4" />
                Avg Contact (30d)
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>
                {slaMetrics.avgTimeToContact30d !== null ? `${slaMetrics.avgTimeToContact30d}h` : '-'}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="dark-card mb-6" style={{ padding: 0 }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--qs-border)' }}>
            <div className="flex items-center gap-4">
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="dark-select"
                style={{ width: 'auto' }}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--qs-subtle)' }} />
                <input
                  type="text"
                  placeholder="ZIP code..."
                  value={filters.zip}
                  onChange={(e) => handleFilterChange('zip', e.target.value)}
                  className="dark-input pl-10 w-32"
                />
              </div>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-sm" style={{ color: 'var(--qs-dim)' }}
            >
              <Filter className="w-4 h-4" />
              More Filters
            </button>
          </div>

          {showFilters && (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4" style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Source</label>
                <select
                  value={filters.source}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                  className="dark-select"
                >
                  {SOURCE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Documents</label>
                <select
                  value={filters.hasDocuments}
                  onChange={(e) => handleFilterChange('hasDocuments', e.target.value)}
                  className="dark-select"
                >
                  {DOCS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Risk Level</label>
                <select
                  value={filters.riskFlag}
                  onChange={(e) => handleFilterChange('riskFlag', e.target.value)}
                  className="dark-select"
                >
                  {RISK_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Min Score</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filters.minScore}
                  onChange={(e) => handleFilterChange('minScore', e.target.value)}
                  placeholder="0"
                  className="dark-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--qs-dim)' }}>Max Score</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filters.maxScore}
                  onChange={(e) => handleFilterChange('maxScore', e.target.value)}
                  placeholder="100"
                  className="dark-input"
                />
              </div>
            </div>
          )}
        </div>

        {/* Leads Table */}
        <div className="dark-card overflow-hidden" style={{ padding: 0 }}>
          {leadsLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mb-2"></div>
              <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>Loading leads...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              Error loading leads. Please try again.
            </div>
          ) : !leads || leads.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--qs-subtle)' }}>
              No leads found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ background: 'var(--qs-elevated)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      <div className="flex items-center gap-1">
                        Score <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Intent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      Docs
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--qs-subtle)' }}>
                      SLA
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const quoteData = lead.lead_quotes?.[0];
                    const hasDocuments = quoteData?.has_documents;
                    const source = lead.referral_code ? 'referral' : (lead.utm_source || 'direct');
                    const scoreColor = getScoreColor(lead.lead_score || 0);

                    return (
                      <tr key={lead.id} className={`${
                        ['closed_won', 'closed_lost'].includes(lead.status) ? 'opacity-50' : ''
                      }`} style={{ borderTop: '1px solid var(--qs-border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--qs-elevated)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-text)' }}>
                          {formatTimeAgo(lead.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${scoreColor}`}>
                            {lead.lead_score || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium
                            ${lead.status === 'new' ? 'bg-primary-100 text-primary-700' : ''}
                            ${lead.status === 'contacted' ? 'bg-green-100 text-green-700' : ''}
                            ${lead.status === 'quoted' ? 'bg-purple-100 text-purple-700' : ''}
                            ${lead.status === 'advanced' ? 'bg-indigo-100 text-indigo-700' : ''}
                            ${lead.status === 'inactive' ? 'bg-gray-100 text-gray-700' : ''}
                            ${lead.status === 'assigned' ? 'bg-yellow-100 text-yellow-700' : ''}
                            ${lead.status === 'unknown' ? 'bg-gray-100 text-gray-500' : ''}
                            ${lead.status === 'closed_won' ? 'bg-green-100 text-green-700' : ''}
                            ${lead.status === 'closed_lost' ? 'bg-gray-100 text-gray-600' : ''}
                          `}>
                            {lead.status}
                          </span>
                          {lead.bland_partial_capture && (
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: 'rgba(245,158,11,0.15)',
                              color: 'var(--qs-warning)',
                              border: '1px solid rgba(245,158,11,0.3)',
                              marginLeft: 6,
                            }}>
                              Partial
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-dim)' }}>
                          {lead.zip || '-'} / {lead.state || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-dim)' }}>
                          <span>{lead.product_intent || '-'}</span>
                          {lead.risk_flag && lead.risk_flag !== 'green' && (() => {
                            const cfg = RISK_FLAG_CONFIG[lead.risk_flag];
                            return cfg ? (
                              <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            ) : null;
                          })()}
                          {lead.allstate_conflict && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700" title="Current carrier is Allstate — cannot write">
                              🟣 Allstate
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-dim)' }}>
                          <span className={source === 'referral' ? 'text-green-600 font-medium' : ''}>
                            {source}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {hasDocuments ? (
                            <FileText className="w-4 h-4 text-green-600" />
                          ) : (
                            <span style={{ color: 'var(--qs-subtle)' }}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--qs-dim)' }}>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" style={{ color: 'var(--qs-subtle)' }} />
                            {formatDuration(lead.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <Link
                            to={`/agency/leads/${lead.id}`}
                            className="text-primary-600 hover:text-primary-800 inline-flex items-center gap-1 text-sm"
                          >
                            View <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results count */}
        {leads && leads.length > 0 && (
          <div className="mt-4 text-sm text-center" style={{ color: 'var(--qs-subtle)' }}>
            Showing {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgencyLeadsPage;
