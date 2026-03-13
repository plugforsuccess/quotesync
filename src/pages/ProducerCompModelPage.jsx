// src/pages/ProducerCompModelPage.jsx
// Producer Compensation Model — scenario projections for agency principals.
// Route: /admin/producers/:producerId/comp-model
// Access: agent role only (agency principal)

import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Settings, BarChart3, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useProducerInfo,
  useCarrierInfo,
  useCompConfig,
  useProductMix,
  useCreateCompConfig,
  useUpdateCompConfig,
  useSaveProductMix,
} from '../hooks/useProducerCompModel';
import AssumptionsTab from './components/comp-model/AssumptionsTab';
import ScenariosTab from './components/comp-model/ScenariosTab';

const TABS = [
  { key: 'assumptions', label: 'Assumptions', icon: Settings },
  { key: 'scenarios', label: 'Scenarios', icon: BarChart3 },
];

export default function ProducerCompModelPage() {
  const { producerId } = useParams();
  const { currentAgencyId } = useAuth();

  const [activeTab, setActiveTab] = useState('assumptions');
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: producer, isLoading: loadingProducer } = useProducerInfo(producerId);
  const { data: config, isLoading: loadingConfig } = useCompConfig(currentAgencyId, producerId);
  const { data: productMix = [], isLoading: loadingMix } = useProductMix(config?.id);
  const { data: carrier } = useCarrierInfo(config?.carrier_id);

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

      // Optimistic: apply immediately for live recalculation
      setOptimisticOverrides((prev) => ({ ...prev, ...updates }));
      setSaveStatus('saving');

      updateConfig.mutate(
        { id: config.id, agencyId: config.agency_id, producerId: config.producer_id, ...updates },
        {
          onSuccess: () => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
          },
          onError: () => {
            // Revert optimistic update on error
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

      // Optimistic: apply immediately
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
      producerId,
      carrierId: null,
    });
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  const isLoading = loadingProducer || loadingConfig;

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
          <p className="text-gray-500">Loading compensation model...</p>
        </div>
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Producer not found</h2>
          <p className="text-gray-600 mb-4">The producer you're looking for doesn't exist or you don't have access.</p>
          <Link to="/admin/cs-performance" className="text-blue-600 hover:text-blue-700 font-medium">
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
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
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
      <div className="flex items-center justify-between mb-6">
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

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
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
    </div>
  );
}
