// src/pages/FunnelDashboardPage.jsx
// Funnel Performance Dashboard — main page component

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, List, AlertCircle, Users } from 'lucide-react';
import { useCurrentAgency } from '../hooks/useAgencyLeads';
import { useFunnelMetrics } from '../hooks/useFunnelMetrics';
import { useActiveEmployees } from '../hooks/useEmployees';
import KPICards from './components/dashboard/KPICards';
import FunnelDropoff from './components/dashboard/FunnelDropoff';
import LeadQuality from './components/dashboard/LeadQuality';
import PartialRecovery from './components/dashboard/PartialRecovery';
import PageSpinner from '../components/PageSpinner';

// ─── Time Range Filter ────────────────────────────────────────────────────────

const TIME_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

// ─── Page Component ───────────────────────────────────────────────────────────

const FunnelDashboardPage = () => {
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;

  const [timeRange, setTimeRange] = useState('30d');
  const { data: activeEmployees = [] } = useActiveEmployees(agencyId);

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading, error } = useFunnelMetrics(agencyId, timeRange);

  // Loading state
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
        <div className="dark-header rounded-xl mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-primary-600" />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}>Funnel Dashboard</h1>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <p style={{ color: 'var(--qs-dim)' }}>{currentAgency.agencies?.name || 'Agency'}</p>
              <Link
                to="/agency/leads"
                className="text-sm text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"
              >
                <List className="w-4 h-4" />
                View Lead Pipeline
              </Link>
            </div>
          </div>

          {/* Time Range Filter */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--qs-border)', background: 'var(--qs-card)' }}>
            {TIME_RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  timeRange === key
                    ? 'bg-primary-600 text-white'
                    : ''
                }`}
                style={timeRange !== key ? { color: 'var(--qs-dim)' } : undefined}
                onMouseEnter={(e) => { if (timeRange !== key) e.currentTarget.style.background = 'var(--qs-elevated)'; }}
                onMouseLeave={(e) => { if (timeRange !== key) e.currentTarget.style.background = ''; }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading / Error */}
        {metricsLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
            <p style={{ color: 'var(--qs-subtle)' }}>Loading dashboard metrics...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg p-4 mb-6" style={{ background: 'var(--qs-danger-subtle)', border: '1px solid var(--qs-danger-border)' }}>
            <p className="text-sm" style={{ color: 'var(--qs-danger)' }}>Error loading metrics. Please try refreshing the page.</p>
          </div>
        )}

        {metrics && (
          <div className="space-y-8">
            {/* Section 1: KPI Cards */}
            <KPICards kpis={metrics.kpis} priorPeriod={metrics.priorPeriod} />

            {/* Section 2: Funnel Drop-off */}
            <FunnelDropoff funnel={metrics.funnel} />

            {/* Section 3: Lead Quality & Scoring */}
            <LeadQuality quality={metrics.quality} channels={metrics.channels} />

            {/* Staffing Summary — links to CS Performance > Capacity tab */}
            {(() => {
              const quotableLeads = Math.round((metrics.totalLeads || 0) * 0.65);
              const quotesPerProducerMonth = 141;
              const producersNeeded = Math.ceil(quotableLeads / quotesPerProducerMonth);
              const currentProducers = activeEmployees.filter(
                e => e.roles?.includes('sales')
              ).length;

              return (
                <div className="dark-card flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary-50 rounded-lg">
                      <Users className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>Staffing Capacity</p>
                      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
                        {producersNeeded} producer{producersNeeded !== 1 ? 's' : ''} needed
                        {' '}&middot; {currentProducers} active
                        {producersNeeded > currentProducers
                          ? <span className="text-red-600 font-medium"> &middot; Gap: -{producersNeeded - currentProducers}</span>
                          : <span className="text-green-600 font-medium"> &middot; Comfortable</span>
                        }
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/admin/staff-performance?tab=capacity"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    View Capacity &rarr;
                  </Link>
                </div>
              );
            })()}

            {/* Section 4: Partial Lead Recovery */}
            <PartialRecovery partials={metrics.partials} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FunnelDashboardPage;
