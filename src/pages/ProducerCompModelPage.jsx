// src/pages/ProducerCompModelPage.jsx
// Producer Compensation Model — projection & actuals modes for agency principals.
// Route: /admin/producers/:employeeId/comp-model
// Access: agent role only (agency principal)

import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Settings, BarChart3, Check, Loader2, TrendingUp, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useProducerInfo,
  useCarrierInfo,
  useCompConfig,
  useProductMix,
  useCreateCompConfig,
  useUpdateCompConfig,
  useSaveProductMix,
  useVcProductKeys,
  useProducerActuals,
} from '../hooks/useProducerCompModel';
import PageSpinner from '../components/PageSpinner';
import AssumptionsTab from './components/comp-model/AssumptionsTab';
import ScenariosTab from './components/comp-model/ScenariosTab';
import ActualsSummaryCard from './components/comp-model/ActualsSummaryCard';
import EntriesDetailTable from './components/comp-model/EntriesDetailTable';

const PROJECTION_TABS = [
  { key: 'assumptions', label: 'Assumptions', icon: Settings },
  { key: 'scenarios', label: 'Scenarios', icon: BarChart3 },
];

// ── Month picker helpers ────────────────────────────────────────────────────

function getPreviousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d;
}

function formatMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthRange(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function ProducerCompModelPage() {
  const { employeeId } = useParams();
  const { currentAgencyId } = useAuth();

  const [mode, setMode] = useState('projection'); // 'projection' | 'actuals'
  const [activeTab, setActiveTab] = useState('assumptions');
  const [saveStatus, setSaveStatus] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(formatMonthValue(getPreviousMonth()));

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: producer, isLoading: loadingProducer } = useProducerInfo(employeeId);
  const { data: config, isLoading: loadingConfig } = useCompConfig(currentAgencyId, employeeId);
  const { data: productMix = [] } = useProductMix(config?.id);
  const { data: carrier } = useCarrierInfo(config?.carrier_id);

  // Actuals data
  const monthRange = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);
  const { data: vcProductKeys = [] } = useVcProductKeys(currentAgencyId);
  const { data: actualsData, isLoading: loadingActuals } = useProducerActuals(
    currentAgencyId,
    employeeId,
    mode === 'actuals' ? monthRange.start : null,
    mode === 'actuals' ? monthRange.end : null
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createConfig = useCreateCompConfig();
  const updateConfig = useUpdateCompConfig();
  const saveProductMix = useSaveProductMix();

  // ── Optimistic config for live calculations ───────────────────────────────

  const [optimisticOverrides, setOptimisticOverrides] = useState({});
  const [optimisticMix, setOptimisticMix] = useState(null);

  const effectiveConfig = useMemo(() => {
    if (!config) return null;
    return { ...config, ...optimisticOverrides };
  }, [config, optimisticOverrides]);

  const effectiveMix = optimisticMix || productMix;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleUpdateConfig = useCallback(
    (updates) => {
      if (!config) return;
      setOptimisticOverrides((prev) => ({ ...prev, ...updates }));
      setSaveStatus('saving');

      updateConfig.mutate(
        { id: config.id, agencyId: config.agency_id, employeeId: config.employee_id, ...updates },
        {
          onSuccess: () => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          },
          onError: () => {
            setOptimisticOverrides((prev) => {
              const next = { ...prev };
              Object.keys(updates).forEach((k) => delete next[k]);
              return next;
            });
            setSaveStatus(null);
          },
        }
      );
    },
    [config, updateConfig]
  );

  const handleSaveProductMix = useCallback(
    (updatedProducts) => {
      if (!config) return;
      setOptimisticMix(updatedProducts);
      setSaveStatus('saving');

      saveProductMix.mutate(
        { configId: config.id, agencyId: config.agency_id, products: updatedProducts },
        {
          onSuccess: () => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          },
          onError: () => {
            setOptimisticMix(null);
            setSaveStatus(null);
          },
        }
      );
    },
    [config, saveProductMix]
  );

  const handleCreateConfig = () => {
    createConfig.mutate({
      agencyId: currentAgencyId,
      employeeId,
      carrierId: null,
    });
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  const isLoading = loadingProducer || loadingConfig;

  if (isLoading) {
    return <PageSpinner label="Loading compensation model..." />;
  }

  if (!producer) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Producer not found</h2>
          <p className="text-gray-600 mb-4">The producer you're looking for doesn't exist or you don't have access.</p>
          <Link to="/admin/cs-performance" className="text-primary-600 hover:text-primary-700 font-medium">
            Back to Performance
          </Link>
        </div>
      </div>
    );
  }

  const producerName = producer.preferred_name
    ? `${producer.preferred_name} ${producer.last_name}`
    : `${producer.first_name} ${producer.last_name}`;

  // ── Empty state — no config yet ───────────────────────────────────────────

  if (!config && !loadingConfig) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link
          to="/admin/cs-performance"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Set up compensation model for {producerName}
          </h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Configure compensation assumptions to see real-time scenario projections — monthly and annual — for this producer.
          </p>
          <button
            onClick={handleCreateConfig}
            disabled={createConfig.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {createConfig.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Set Up Compensation Model'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Main page ─────────────────────────────────────────────────────────────

  const monthDate = new Date(selectedMonth + '-01T00:00:00');
  const monthLabel = formatMonthLabel(monthDate);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        to="/admin/cs-performance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {producerName} — Compensation Model
          </h1>
          {carrier && (
            <p className="text-sm text-gray-500 mt-0.5">
              Carrier: {carrier.carrier_name}
            </p>
          )}
        </div>

        {/* Save indicator */}
        {saveStatus && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-opacity ${
              saveStatus === 'saving'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-green-100 text-green-700'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-3 h-3" />
                Saved
              </>
            )}
          </span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode('projection')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            mode === 'projection'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Projection
        </button>
        <button
          onClick={() => setMode('actuals')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            mode === 'actuals'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Actuals
        </button>
      </div>

      {/* ── Projection Mode ──────────────────────────────────────────────────── */}
      {mode === 'projection' && (
        <>
          {/* Projection sub-tabs */}
          <div className="flex gap-1 mb-6 border-b border-gray-200">
            {PROJECTION_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    isActive
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'assumptions' && (
            <AssumptionsTab
              config={effectiveConfig}
              productMix={effectiveMix}
              carrierName={carrier?.carrier_name}
              onUpdateConfig={handleUpdateConfig}
              onSaveProductMix={handleSaveProductMix}
            />
          )}

          {activeTab === 'scenarios' && (
            <ScenariosTab
              config={effectiveConfig}
              productMix={effectiveMix}
            />
          )}
        </>
      )}

      {/* ── Actuals Mode ─────────────────────────────────────────────────────── */}
      {mode === 'actuals' && (
        <div className="space-y-6">
          {/* Month picker */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {loadingActuals ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-2"></div>
                <p className="text-sm text-gray-500">Loading actuals for {monthLabel}...</p>
              </div>
            </div>
          ) : (
            <>
              <ActualsSummaryCard
                entries={actualsData?.entries || []}
                vcProductKeys={vcProductKeys}
                config={effectiveConfig}
                unattributedCount={actualsData?.unattributedCount || 0}
                monthLabel={monthLabel}
              />

              <EntriesDetailTable entries={actualsData?.entries || []} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
