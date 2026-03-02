// src/pages/FunnelDashboardPage.jsx
// Funnel Performance Dashboard — main page component

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, List, AlertCircle } from 'lucide-react';
import { useCurrentAgency } from '../hooks/useAgencyLeads';
import { useFunnelMetrics } from '../hooks/useFunnelMetrics';
import KPICards from './components/dashboard/KPICards';
import FunnelDropoff from './components/dashboard/FunnelDropoff';
import LeadQuality from './components/dashboard/LeadQuality';
import CapacityPlanner from './components/dashboard/CapacityPlanner';
import StaffingCapacity from './components/dashboard/StaffingCapacity';
import PartialRecovery from './components/dashboard/PartialRecovery';

// ─── Time Range Filter ────────────────────────────────────────────────────────

const TIME_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

// ─── localStorage persistence for planner/staffing inputs ─────────────────────

const STORAGE_KEY = 'quotesync_dashboard_inputs';

function loadPersistedInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function persistInputs(inputs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch { /* ignore */ }
}

const DEFAULT_PLANNER = {
  targetSubmissions: 700,
  avgCPC: 7.0,
  landingPageConvRate: 20,
  closeRate: 18,
  avgPremium: 2400,
  commissionRate: 10,
};

const DEFAULT_STAFFING = {
  activeProducers: 1,
  avgQuoteTime: 45,
  workingHours: 8,
  quotingAllocation: 60,
  qualificationRate: 65,
  workingDays: 22,
};

// ─── Page Component ───────────────────────────────────────────────────────────

const FunnelDashboardPage = () => {
  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;

  const [timeRange, setTimeRange] = useState('30d');

  // Load persisted inputs or use defaults
  const [plannerInputs, setPlannerInputs] = useState(() => {
    const saved = loadPersistedInputs();
    return saved?.planner || DEFAULT_PLANNER;
  });

  const [staffingInputs, setStaffingInputs] = useState(() => {
    const saved = loadPersistedInputs();
    return saved?.staffing || DEFAULT_STAFFING;
  });

  // Persist inputs on change
  useEffect(() => {
    persistInputs({ planner: plannerInputs, staffing: staffingInputs });
  }, [plannerInputs, staffingInputs]);

  const handlePlannerChange = useCallback((key, value) => {
    setPlannerInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleStaffingChange = useCallback((key, value) => {
    setStaffingInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading, error } = useFunnelMetrics(agencyId, timeRange);

  // Loading state
  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentAgency) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Agency Access</h2>
          <p className="text-gray-600">
            You are not currently associated with an agency. Please contact support if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Funnel Dashboard</h1>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-gray-600">{currentAgency.agencies?.name || 'Agency'}</p>
              <Link
                to="/agency/leads"
                className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
              >
                <List className="w-4 h-4" />
                View Lead Pipeline
              </Link>
            </div>
          </div>

          {/* Time Range Filter */}
          <div className="flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {TIME_RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  timeRange === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading / Error */}
        {metricsLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
            <p className="text-gray-500">Loading dashboard metrics...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">Error loading metrics. Please try refreshing the page.</p>
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

            {/* Section 4: Capacity Planning */}
            <CapacityPlanner
              kpis={metrics.kpis}
              plannerInputs={plannerInputs}
              onInputChange={handlePlannerChange}
            />

            {/* Section 5: Staffing & Quoting Capacity */}
            <StaffingCapacity
              staffingInputs={staffingInputs}
              onStaffingChange={handleStaffingChange}
              plannerInputs={plannerInputs}
            />

            {/* Section 6: Partial Lead Recovery */}
            <PartialRecovery partials={metrics.partials} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FunnelDashboardPage;
