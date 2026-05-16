// src/pages/AgencyLeadDetailPage.jsx
// Agency Lead Detail View with Quote Summary and Workflow Actions

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Clock, MapPin, FileText, Tag, Phone,
  CheckCircle, AlertCircle, ExternalLink, RefreshCw, MessageSquare,
  XCircle, Bot, PhoneIncoming, PhoneOutgoing, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  useCurrentAgency,
  useLeadDetail,
  useLeadAuditLog,
  useLeadMessages,
  useUpdateLeadStatus,
  useSetFirstContact,
  useRecomputeLeadScore,
  useDisposeLead
} from '../hooks/useAgencyLeads';
import DispositionModal from './components/DispositionModal';
import { getScoreColor, formatScoreFactors, RISK_FLAG_CONFIG } from '../lib/leadScoring';
import { supabase } from '../lib/supabase';
import PageSpinner from '../components/PageSpinner';
import LeadMessageThread from './components/LeadMessageThread';
import { useSetLeadReferrer } from '../hooks/useReferralRewards';

// Gap 2: capture/replace the call-in referrer for this lead. Persists to
// leads.referred_by_referrer_id so the server materializer attributes the
// quote to the right referrer (and dedups against the share-link path).
function ReferredByField({ lead, leadId, agencyId }) {
  const setReferrer = useSetLeadReferrer(leadId, agencyId);
  const linked = lead.referred_by;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [err, setErr] = useState(null);

  const save = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr('Enter the referrer’s name.');
      return;
    }
    if (state.trim() && !/^[A-Za-z]{2}$/.test(state.trim())) {
      setErr('State must be 2 letters (e.g. GA).');
      return;
    }
    try {
      await setReferrer.mutateAsync({ name, phone, state });
      setEditing(false);
      setName('');
      setPhone('');
      setState('');
    } catch (e) {
      setErr(e.message || 'Could not save.');
    }
  };

  return (
    <div className="pt-3 border-t border-gray-100">
      <div className="flex justify-between items-start">
        <dt className="text-gray-500">Referred by</dt>
        <dd className="text-gray-900 text-right">
          {linked ? (
            <span>
              <span className="font-medium">{linked.name}</span>
              {linked.state && (
                <span
                  className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    (linked.state || '').toUpperCase() === 'GA'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {(linked.state || '').toUpperCase() === 'GA'
                    ? 'GA · eligible'
                    : 'not eligible to win'}
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">Not linked</span>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="ml-3 text-xs text-primary-600 hover:text-primary-700"
          >
            {editing ? 'Cancel' : linked ? 'Change' : 'Link referrer'}
          </button>
        </dd>
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Referrer’s name"
            maxLength={120}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              maxLength={32}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="ST"
              maxLength={2}
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm uppercase outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            type="button"
            onClick={save}
            disabled={setReferrer.isPending}
            className="w-full px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md disabled:opacity-50"
          >
            {setReferrer.isPending ? 'Saving…' : 'Save referrer'}
          </button>
          <p className="text-[11px] text-gray-400">
            Only Georgia-resident referrers are eligible to win; anyone may
            refer.
          </p>
        </div>
      )}
    </div>
  );
}

const CARRIER_LABELS = {
  state_farm: 'State Farm',
  geico: 'GEICO',
  progressive: 'Progressive',
  allstate: 'Allstate',
  liberty: 'Liberty Mutual',
  liberty_mutual: 'Liberty Mutual',
  farmers: 'Farmers',
  farm_bureau: 'GA Farm Bureau',
  usaa: 'USAA',
  nationwide: 'Nationwide',
  travelers: 'Travelers',
  lemonade: 'Lemonade',
  none: 'No current policy',
};

function formatCarrier(value) {
  return CARRIER_LABELS[value] ?? value ?? '\u2014';
}

const STATUS_ACTIONS = [
  { value: 'contacted', label: 'Contacted', color: 'green' },
  { value: 'quoted', label: 'Quoted', color: 'purple' },
  { value: 'advanced', label: 'Advanced', color: 'indigo' },
  { value: 'inactive', label: 'Inactive', color: 'gray' },
  { value: 'unknown', label: 'Unknown', color: 'gray' }
];

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString();
}

function formatTimeAgo(date) {
  if (!date) return '-';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function formatDuration(start, end = new Date()) {
  if (!start) return '-';
  const diffMs = new Date(end) - new Date(start);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return `${days}d ${diffHours % 24}h`;
  }
  if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
  return `${diffMins}m`;
}

const AgencyLeadDetailPage = () => {
  const { id: leadId } = useParams();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);

  const { data: currentAgency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;

  const queryClient = useQueryClient();
  const { data: lead, isLoading: leadLoading, error } = useLeadDetail(leadId, agencyId);
  const { data: auditLog } = useLeadAuditLog(leadId);
  const { data: messages = [], isLoading: messagesLoading } = useLeadMessages(leadId);

  // Realtime subscription for new messages with auto-reconnect.
  // When the tab is backgrounded the WebSocket disconnects (CLOSED/CHANNEL_ERROR).
  // On return we tear down the dead channel and re-subscribe after a short delay
  // to avoid rapid reconnect loops.
  useEffect(() => {
    if (!leadId) return;

    let reconnectTimer = null;
    let isReconnecting = false;
    let currentChannel = null;

    function subscribe() {
      const channel = supabase
        .channel(`lead-messages-${leadId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_messages',
          filter: `lead_id=eq.${leadId}`,
        }, () => {
          queryClient.invalidateQueries({ queryKey: ['lead_messages', leadId] });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isReconnecting = false;
          } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && !isReconnecting) {
            isReconnecting = true;
            reconnectTimer = setTimeout(() => {
              supabase.removeChannel(channel);
              currentChannel = null;
              subscribe();
            }, 5000);
          }
        });

      currentChannel = channel;
    }

    subscribe();

    return () => {
      clearTimeout(reconnectTimer);
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
      }
    };
  }, [leadId, queryClient]);

  const updateStatus = useUpdateLeadStatus();
  const setFirstContact = useSetFirstContact();
  const recomputeScore = useRecomputeLeadScore();
  const disposeLead = useDisposeLead();
  const [showDisposition, setShowDisposition] = useState(false);

  // Fetch latest bland_call_log for this lead
  const [blandCallLog, setBlandCallLog] = useState(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('bland_call_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBlandCallLog(data);
      });
  }, [leadId]);

  const quoteData = lead?.lead_quotes?.[0];
  const quoteSummary = quoteData?.quote_summary || {};

  const handleStatusUpdate = async (newStatus) => {
    if (!lead || updating) return;
    setUpdating(true);
    try {
      await updateStatus.mutateAsync({
        leadId: lead.id,
        agencyId,
        newStatus,
        oldStatus: lead.status
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleFirstContact = async () => {
    if (!lead || lead.first_contact_at || updating) return;
    setUpdating(true);
    try {
      await setFirstContact.mutateAsync({ leadId: lead.id, agencyId });
    } finally {
      setUpdating(false);
    }
  };

  const handleRecomputeScore = async () => {
    if (!lead || updating) return;
    setUpdating(true);
    try {
      await recomputeScore.mutateAsync({
        leadId: lead.id,
        agencyId,
        lead,
        quoteSummary: {
          ...quoteSummary,
          has_documents: quoteData?.has_documents
        }
      });
    } finally {
      setUpdating(false);
    }
  };

  if (agencyLoading || leadLoading) {
    return <PageSpinner label="Loading lead details..." />;
  }

  if (!currentAgency) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Agency Access</h2>
          <p className="text-gray-600">You are not associated with an agency.</p>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Lead Not Found</h2>
          <p className="text-gray-600 mb-4">This lead does not exist or you do not have access to it.</p>
          <Link to="/agency/leads" className="text-primary-600 hover:underline">
            Back to Leads
          </Link>
        </div>
      </div>
    );
  }

  const scoreColor = getScoreColor(lead.lead_score || 0);
  const scoreFactors = formatScoreFactors(lead.score_factors);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          to="/agency/leads"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-gray-900">
                  Lead {lead.zip || ''} / {lead.state || ''}
                </h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium
                  ${lead.status === 'new' ? 'bg-primary-100 text-primary-700' : ''}
                  ${lead.status === 'contacted' ? 'bg-green-100 text-green-700' : ''}
                  ${lead.status === 'quoted' ? 'bg-purple-100 text-purple-700' : ''}
                  ${lead.status === 'advanced' ? 'bg-indigo-100 text-indigo-700' : ''}
                  ${lead.status === 'inactive' ? 'bg-gray-100 text-gray-700' : ''}
                  ${lead.status === 'closed_won' ? 'bg-green-100 text-green-700' : ''}
                  ${lead.status === 'closed_lost' ? 'bg-gray-100 text-gray-600' : ''}
                `}>
                  {lead.status}
                </span>
                {lead.risk_flag && (() => {
                  const cfg = RISK_FLAG_CONFIG[lead.risk_flag];
                  return cfg ? (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      {cfg.label} risk
                    </div>
                  ) : null;
                })()}
              </div>
              {/* Risk detail */}
              {(lead.auto_driving_record || lead.home_claims_history) && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  {lead.auto_driving_record && (
                    <div>Driving record: <span className="font-medium text-gray-700">
                      {{ clean: 'Clean', '1-2': '1\u20132 incidents', '3+': '3+ incidents' }[lead.auto_driving_record] ?? lead.auto_driving_record}
                    </span></div>
                  )}
                  {lead.home_claims_history && (
                    <div>Home claims: <span className="font-medium text-gray-700">
                      {{ '0-1': '0\u20131 claims', '2+': '2+ claims' }[lead.home_claims_history] ?? lead.home_claims_history}
                    </span></div>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-500">
                Created {formatDate(lead.created_at)}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-bold ${scoreColor}`}>
                  {lead.lead_score || 0}
                </span>
                <button
                  onClick={handleRecomputeScore}
                  disabled={updating}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded"
                  title="Refresh score"
                >
                  <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Lead Score</p>
            </div>
          </div>

          {/* Score Factors */}
          {scoreFactors.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {scoreFactors.map((factor, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs"
                >
                  {factor}
                </span>
              ))}
            </div>
          )}

          {/* Drip status */}
          {lead.sms_sent && lead.status === 'new' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <span>Drip stage:</span>
              <span className="font-medium text-gray-700">{lead.drip_stage} / 3</span>
              {lead.sms_opted_out && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Opted out</span>
              )}
            </div>
          )}

          {/* Score updated timestamp */}
          {lead.score_updated_at && (
            <p className="text-xs text-gray-400 mt-1">Score updated {formatTimeAgo(lead.score_updated_at)}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Lead Identity */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Lead Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> Location
                  </dt>
                  <dd className="text-gray-900 font-medium">{lead.zip || '-'}, {lead.state || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <Tag className="w-4 h-4" /> Product Intent
                  </dt>
                  <dd className="text-gray-900 font-medium">{lead.product_intent || 'Not specified'}</dd>
                </div>
                {lead.current_auto_carrier && (
                  <div>
                    <dt className="text-gray-500 text-sm">Current Auto Carrier</dt>
                    <dd className={`font-medium ${
                      lead.current_auto_carrier === 'allstate' ? 'text-purple-600' : 'text-gray-900'
                    }`}>
                      {formatCarrier(lead.current_auto_carrier)}
                    </dd>
                  </div>
                )}
                {lead.current_auto_premium != null && (
                  <div>
                    <dt className="text-gray-500 text-sm">Current Auto Premium</dt>
                    <dd className="font-semibold text-gray-900">
                      ${lead.current_auto_premium.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal ml-1">/yr</span>
                    </dd>
                  </div>
                )}
                {lead.current_home_carrier && (
                  <div>
                    <dt className="text-gray-500 text-sm">Current Home Carrier</dt>
                    <dd className={`font-medium ${
                      lead.current_home_carrier === 'allstate' ? 'text-purple-600' : 'text-gray-900'
                    }`}>
                      {formatCarrier(lead.current_home_carrier)}
                    </dd>
                  </div>
                )}
                {lead.current_home_premium != null && (
                  <div>
                    <dt className="text-gray-500 text-sm">Current Home Premium</dt>
                    <dd className="font-semibold text-gray-900">
                      ${lead.current_home_premium.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal ml-1">/yr</span>
                    </dd>
                  </div>
                )}
                {lead.allstate_conflict && (
                  <div>
                    <dt className="text-gray-500 text-sm">Carrier Conflict</dt>
                    <dd className="font-bold text-purple-600">
                      🟣 Allstate — cannot write
                    </dd>
                  </div>
                )}
                {lead.auto_driving_record && (
                  <div>
                    <dt className="text-gray-500 text-sm">Driving Record (3yr)</dt>
                    <dd className={`font-medium ${
                      lead.auto_driving_record === '3+' ? 'text-red-600' :
                      lead.auto_driving_record === '1-2' ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {lead.auto_driving_record === 'clean' ? 'Clean' :
                       lead.auto_driving_record === '1-2' ? '1\u20132 incidents' : '3+ incidents'}
                    </dd>
                  </div>
                )}
                {lead.home_claims_history && (
                  <div>
                    <dt className="text-gray-500 text-sm">Home Claims (5yr)</dt>
                    <dd className={`font-medium ${
                      lead.home_claims_history === '2+' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {lead.home_claims_history === '0-1' ? '0\u20131 claims' : '2+ claims'}
                    </dd>
                  </div>
                )}
                {lead.coverage_lapse && (
                  <div>
                    <dt className="text-gray-500 text-sm">Coverage Lapse</dt>
                    <dd className={`font-medium ${
                      lead.coverage_lapse === 'no_lapse'      ? 'text-green-600' :
                      lead.coverage_lapse === 'under_30'      ? 'text-amber-500' :
                      lead.coverage_lapse === 'never_insured' ? 'text-red-600'   :
                      'text-red-500'
                    }`}>
                      {{
                        no_lapse:       'No lapse \u2014 currently insured',
                        under_30:       'Less than 30 days',
                        '30_to_90':     '30\u201390 days',
                        over_90:        'Over 90 days',
                        never_insured:  'Never insured',
                      }[lead.coverage_lapse] ?? lead.coverage_lapse}
                    </dd>
                  </div>
                )}
                {lead.multiple_drivers != null && (
                  <div>
                    <dt className="text-gray-500 text-sm">Multiple Drivers</dt>
                    <dd className="font-medium text-gray-900">
                      {lead.multiple_drivers ? 'Yes' : 'No'}
                    </dd>
                  </div>
                )}
                {lead.veteran_status && (
                  <div>
                    <dt className="text-gray-500 text-sm">Military / Veteran</dt>
                    <dd className={`font-medium ${
                      lead.veteran_status === 'yes' ? 'text-blue-600' : 'text-gray-900'
                    }`}>
                      {lead.veteran_status === 'yes' ? '\u2713 Yes \u2014 discount eligible' : 'No'}
                    </dd>
                  </div>
                )}
                {(lead.vehicle_year || lead.vehicle_make || lead.vehicle_model) && (
                  <div className="col-span-2">
                    <dt className="text-gray-500 text-sm mb-1">Vehicle</dt>
                    <dd className="font-medium text-gray-900 text-base">
                      {[lead.vehicle_year, lead.vehicle_make, lead.vehicle_model]
                        .filter(Boolean).join(' ')}
                    </dd>
                    {lead.vehicle_use?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {lead.vehicle_use.map(use => (
                          <span key={use} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium capitalize">
                            {use.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {lead.risk_flag && lead.risk_flag !== 'green' && (
                  <div>
                    <dt className="text-gray-500 text-sm">Risk Flag</dt>
                    <dd className={`font-bold ${
                      lead.risk_flag === 'red' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {lead.risk_flag === 'red' ? '\uD83D\uDD34 Exceeds carrier limits' : '\uD83D\uDFE1 Needs review'}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500">Source</dt>
                  <dd className="text-gray-900 font-medium">
                    {lead.referral_code ? (
                      <span className="text-green-600">Referral: {lead.referral_code}</span>
                    ) : lead.utm_source ? (
                      lead.utm_source
                    ) : (
                      'Direct'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Campaign</dt>
                  <dd className="text-gray-900">{lead.utm_campaign || '-'}</dd>
                </div>
              </dl>

              {/* Contact Info Note */}
              {lead.source === 'canopy' ? (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg">
                  <p className="text-sm text-primary-800">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Contact details captured via Canopy. View full profile in your Canopy dashboard.
                  </p>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Contact details submitted via form.
                  </p>
                </div>
              )}
            </div>

            {/* Quote Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Summary</h2>

              {quoteData ? (
                <div className="space-y-4">
                  {/* Policy Types */}
                  {quoteSummary.policy_types && quoteSummary.policy_types.length > 0 && (
                    <div>
                      <dt className="text-sm text-gray-500 mb-1">Policy Types</dt>
                      <dd className="flex flex-wrap gap-2">
                        {quoteSummary.policy_types.map((type, idx) => (
                          <span key={idx} className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm">
                            {type}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}

                  {/* Counts */}
                  <div className="grid grid-cols-3 gap-4">
                    {quoteSummary.vehicle_count !== undefined && (
                      <div className="text-center p-3 bg-gray-50 rounded">
                        <div className="text-2xl font-bold text-gray-900">{quoteSummary.vehicle_count}</div>
                        <div className="text-xs text-gray-500">Vehicles</div>
                      </div>
                    )}
                    {quoteSummary.driver_count !== undefined && (
                      <div className="text-center p-3 bg-gray-50 rounded">
                        <div className="text-2xl font-bold text-gray-900">{quoteSummary.driver_count}</div>
                        <div className="text-xs text-gray-500">Drivers</div>
                      </div>
                    )}
                    {quoteSummary.property_count !== undefined && (
                      <div className="text-center p-3 bg-gray-50 rounded">
                        <div className="text-2xl font-bold text-gray-900">{quoteSummary.property_count}</div>
                        <div className="text-xs text-gray-500">Properties</div>
                      </div>
                    )}
                  </div>

                  {/* Renewal Proximity */}
                  {quoteSummary.renewal_days !== undefined && (
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <span className="text-yellow-800 font-medium">
                        Renewal in {quoteSummary.renewal_days} days
                      </span>
                    </div>
                  )}

                  {/* Documents */}
                  <div className="flex items-center gap-2">
                    <FileText className={`w-5 h-5 ${quoteData.has_documents ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className={quoteData.has_documents ? 'text-green-700' : 'text-gray-500'}>
                      {quoteData.has_documents ? (
                        <>Documents available ({quoteSummary.document_count || 'multiple'})</>
                      ) : (
                        'No documents'
                      )}
                    </span>
                  </div>

                  {/* Premium (if present, labeled as reported) */}
                  {quoteSummary.reported_premium && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <span className="text-gray-500">Reported in documents: </span>
                      <span className="text-gray-900 font-medium">
                        ${quoteSummary.reported_premium.toLocaleString()}
                      </span>
                      <span className="text-gray-400 ml-1">(unverified)</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    Enriched: {quoteData.enriched_at ? formatTimeAgo(quoteData.enriched_at) : 'Pending'}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No enrichment data available yet.</p>
              )}
            </div>

            {/* AI Verification */}
            {(lead.bland_outbound_call_id || lead.bland_inbound_call_id || blandCallLog) && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-500" />
                  AI Verification
                </h2>

                <div className="space-y-4">
                  {/* Status Badges Row */}
                  <div className="flex flex-wrap gap-2">
                    {/* Verification Status */}
                    {lead.bland_verified ? (
                      lead.bland_qualified === true ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified & Qualified
                        </span>
                      ) : lead.bland_qualified === false ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Disqualified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified
                        </span>
                      )
                    ) : lead.bland_outbound_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                        <Clock className="w-3.5 h-3.5" /> Call In Progress
                      </span>
                    ) : lead.bland_outbound_call_id || lead.bland_inbound_call_id ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        Attempted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        Not Called
                      </span>
                    )}

                    {/* Call Type */}
                    {blandCallLog && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        blandCallLog.direction === 'outbound'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {blandCallLog.direction === 'outbound'
                          ? <><PhoneOutgoing className="w-3.5 h-3.5" /> Outbound Verification</>
                          : <><PhoneIncoming className="w-3.5 h-3.5" /> Inbound Call</>
                        }
                      </span>
                    )}

                    {/* Transfer Outcome */}
                    {blandCallLog?.transferred === true && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3.5 h-3.5" /> Transferred
                      </span>
                    )}
                    {blandCallLog?.transferred === false && blandCallLog?.variables?.transfer_attempted === 'true' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        Transfer — No Answer
                      </span>
                    )}

                    {/* Canopy Link */}
                    {lead.canopy_link_sent && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                        <ExternalLink className="w-3.5 h-3.5" /> Canopy Link Sent
                      </span>
                    )}
                  </div>

                  {/* Details Grid */}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {lead.bland_disqualify_reason && (
                      <div className="col-span-2">
                        <dt className="text-gray-500 text-xs">Disqualify Reason</dt>
                        <dd className="text-red-600 font-medium">{lead.bland_disqualify_reason}</dd>
                      </div>
                    )}
                    {blandCallLog?.transferred_to_name && (
                      <div>
                        <dt className="text-gray-500 text-xs">Transferred To</dt>
                        <dd className="text-gray-900 font-medium">{blandCallLog.transferred_to_name}</dd>
                      </div>
                    )}
                    {blandCallLog?.duration_seconds != null && (
                      <div>
                        <dt className="text-gray-500 text-xs">Call Duration</dt>
                        <dd className="text-gray-900 font-medium">
                          {Math.floor(blandCallLog.duration_seconds / 60)}m {blandCallLog.duration_seconds % 60}s
                        </dd>
                      </div>
                    )}
                    {blandCallLog?.variables?.coverage_interest && (
                      <div>
                        <dt className="text-gray-500 text-xs">Coverage Interest</dt>
                        <dd className="text-gray-900 font-medium capitalize">{blandCallLog.variables.coverage_interest}</dd>
                      </div>
                    )}
                    {blandCallLog?.variables?.callback_requested === 'true' && (
                      <div>
                        <dt className="text-gray-500 text-xs">Callback Requested</dt>
                        <dd className="text-gray-900 font-medium">
                          {blandCallLog.variables.callback_time_preference || 'Yes — no time specified'}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Transcript (collapsible) */}
                  {(lead.bland_call_transcript || blandCallLog?.transcript) && (
                    <div>
                      <button
                        onClick={() => setTranscriptOpen(prev => !prev)}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        {transcriptOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {transcriptOpen ? 'Hide' : 'Show'} Transcript
                      </button>
                      {transcriptOpen && (
                        <div className="mt-2 p-3 bg-gray-50 rounded-lg max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {lead.bland_call_transcript || blandCallLog?.transcript}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  {lead.bland_verified_at && (
                    <p className="text-xs text-gray-400">
                      Verified {formatTimeAgo(lead.bland_verified_at)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                Messages
              </h3>
              <LeadMessageThread
                messages={messages}
                isLoading={messagesLoading}
                leadId={leadId}
                leadPhone={lead?.phone}
              />
            </div>

            {/* Activity / Audit Log */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
              {auditLog && auditLog.length > 0 ? (
                <div className="space-y-3">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400" />
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium">{entry.event_type.replace(/_/g, ' ')}</p>
                        {entry.metadata && (
                          <p className="text-gray-500 text-xs">
                            {entry.metadata.old_status && `${entry.metadata.old_status} → ${entry.metadata.new_status}`}
                          </p>
                        )}
                        <p className="text-gray-400 text-xs">{formatTimeAgo(entry.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No activity recorded yet.</p>
              )}
            </div>
          </div>

          {/* Sidebar - Actions & SLA */}
          <div className="space-y-6">
            {/* SLA Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SLA Metrics</h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock className="w-4 h-4" /> Time Since Created
                  </dt>
                  <dd className="text-xl font-bold text-gray-900">{formatDuration(lead.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Time to First Contact
                  </dt>
                  <dd className="text-xl font-bold text-gray-900">
                    {lead.first_contact_at ? (
                      formatDuration(lead.created_at, lead.first_contact_at)
                    ) : (
                      <span className="text-orange-600">Not contacted</span>
                    )}
                  </dd>
                </div>
                {lead.first_contact_at && (
                  <div className="text-xs text-gray-500">
                    First contact: {formatDate(lead.first_contact_at)}
                  </div>
                )}
              </dl>
            </div>

            {/* Workflow Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

              {/* First Contact Button */}
              {!lead.first_contact_at && (
                <button
                  onClick={handleFirstContact}
                  disabled={updating}
                  className="w-full mb-4 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Mark First Contacted
                </button>
              )}

              {/* Status Buttons */}
              <p className="text-sm text-gray-500 mb-3">Update Status:</p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_ACTIONS.map((action) => (
                  <button
                    key={action.value}
                    onClick={() => handleStatusUpdate(action.value)}
                    disabled={updating || lead.status === action.value}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${lead.status === action.value
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }
                      disabled:opacity-50
                    `}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Dispose Lead button */}
              {!['closed_won', 'closed_lost'].includes(lead.status) && (
                <div className="pt-4 border-t border-gray-200 mt-4">
                  <button
                    onClick={() => setShowDisposition(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Close or Convert Lead
                  </button>
                </div>
              )}

              {/* Closed state display */}
              {['closed_won', 'closed_lost'].includes(lead.status) && (
                <div className={`rounded-lg p-4 mt-4 ${
                  lead.status === 'closed_won'
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {lead.status === 'closed_won'
                      ? <CheckCircle className="w-4 h-4 text-green-600" />
                      : <XCircle className="w-4 h-4 text-gray-400" />
                    }
                    <span className={`text-sm font-semibold ${
                      lead.status === 'closed_won' ? 'text-green-700' : 'text-gray-600'
                    }`}>
                      {lead.status === 'closed_won' ? 'Converted — Quoted in Lead Manager' : 'Closed'}
                    </span>
                  </div>
                  {lead.disposition_reason && lead.disposition_reason !== 'quoted_in_lm' && (
                    <p className="text-xs text-gray-500 capitalize">
                      {lead.disposition_reason.replace(/_/g, ' ')}
                    </p>
                  )}
                  {lead.disposition_note && (
                    <p className="text-xs text-gray-500 mt-1 italic">{lead.disposition_note}</p>
                  )}
                  {lead.disposed_at && (
                    <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(lead.disposed_at)}</p>
                  )}
                </div>
              )}
            </div>

            {/* Attribution */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Attribution</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">UTM Source</dt>
                  <dd className="text-gray-900">{lead.utm_source || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">UTM Medium</dt>
                  <dd className="text-gray-900">{lead.utm_medium || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">UTM Campaign</dt>
                  <dd className="text-gray-900">{lead.utm_campaign || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Referral Code</dt>
                  <dd className="text-gray-900 font-medium">
                    {lead.referral_code || '-'}
                  </dd>
                </div>
                <ReferredByField
                  lead={lead}
                  leadId={leadId}
                  agencyId={agencyId}
                />
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Disposition Modal */}
      {showDisposition && (
        <DispositionModal
          lead={lead}
          agencyId={agencyId}
          onClose={() => setShowDisposition(false)}
          onConfirm={async ({ outcome, reason, note }) => {
            await disposeLead.mutateAsync({
              leadId: lead.id, agencyId, outcome, reason, note,
            });
            setShowDisposition(false);
          }}
          isPending={disposeLead.isPending}
        />
      )}
    </div>
  );
};

export default AgencyLeadDetailPage;
