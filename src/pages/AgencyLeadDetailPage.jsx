// src/pages/AgencyLeadDetailPage.jsx
// Agency Lead Detail View with Quote Summary and Workflow Actions

import { T } from '../components/SiteCopy';
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
import { LeadSalesCard } from './components/sales/SalesForms';
import LeadDeclarationCard from './components/LeadDeclarationCard';
import { getScoreColor, formatScoreFactors, RISK_FLAG_CONFIG } from '../lib/leadScoring';
import { supabase } from '../lib/supabase';
import PageSpinner from '../components/PageSpinner';
import LeadMessageThread from './components/LeadMessageThread';
import ReferredByField from './components/sales/ReferredByField';

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
          <h2 className="text-xl font-semibold text-gray-900 mb-2"><T k="pages.agencyleaddetailpage.e952ec">No Agency Access</T></h2>
          <p className="text-gray-600"><T k="pages.agencyleaddetailpage.106032">You are not associated with an agency.</T></p>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2"><T k="pages.agencyleaddetailpage.17895d">Lead Not Found</T></h2>
          <p className="text-gray-600 mb-4"><T k="pages.agencyleaddetailpage.d63935">This lead does not exist or you do not have access to it.</T></p>
          <Link to="/agency/leads" className="text-primary-600 hover:underline">
            <T k="pages.agencyleaddetailpage.22027f">Back to Leads</T>
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
          <T k="pages.agencyleaddetailpage.22027f">Back to Leads</T>
        </Link>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-gray-900">
                  {(lead.first_name || lead.last_name)
                    ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
                    : <><T k="pages.agencyleaddetailpage.c6f71d">{"Lead"}</T>{" "}{lead.zip || ''}{" / "}{lead.state || ''}</>}
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
                      <T>{cfg.label}</T> <T k="pages.agencyleaddetailpage.c6142b">risk</T>
                    </div>
                  ) : null;
                })()}
              </div>
              {/* Risk detail */}
              {(lead.auto_driving_record || lead.home_claims_history) && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  {lead.auto_driving_record && (
                    <div><T k="pages.agencyleaddetailpage.5fee7a">Driving record:</T> <span className="font-medium text-gray-700">
                      {{ clean: 'Clean', '1-2': '1\u20132 incidents', '3+': '3+ incidents' }[lead.auto_driving_record] ?? lead.auto_driving_record}
                    </span></div>
                  )}
                  {lead.home_claims_history && (
                    <div><T k="pages.agencyleaddetailpage.80639e">Home claims:</T> <span className="font-medium text-gray-700">
                      {{ '0-1': '0\u20131 claims', '2+': '2+ claims' }[lead.home_claims_history] ?? lead.home_claims_history}
                    </span></div>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-500">
                <T k="pages.agencyleaddetailpage.0eceeb">Created</T> {formatDate(lead.created_at)}
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
              <p className="text-xs text-gray-500 mt-1"><T k="pages.agencyleaddetailpage.426d29">Lead Score</T></p>
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
              <span><T k="pages.agencyleaddetailpage.40632a">Drip stage:</T></span>
              <span className="font-medium text-gray-700">{lead.drip_stage} / 3</span>
              {lead.sms_opted_out && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><T k="pages.agencyleaddetailpage.fe493d">Opted out</T></span>
              )}
            </div>
          )}

          {/* Score updated timestamp */}
          {lead.score_updated_at && (
            <p className="text-xs text-gray-400 mt-1"><T k="pages.agencyleaddetailpage.b620c8">Score updated</T> {formatTimeAgo(lead.score_updated_at)}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quotes & binds: drives the lead's status and the producer's numbers */}
            <LeadSalesCard lead={lead} agencyId={agencyId} />

            {/* Lead Identity */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.a9ea07">Lead Details</T></h2>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> <T k="pages.agencyleaddetailpage.ce5bf5">Location</T>
                  </dt>
                  <dd className="text-gray-900 font-medium">{lead.zip || '-'}, {lead.state || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <Tag className="w-4 h-4" /> <T k="pages.agencyleaddetailpage.e37178">Product Intent</T>
                  </dt>
                  <dd className="text-gray-900 font-medium">{lead.product_intent || <T k="pages.agencyleaddetailpage.60f1e9">{'Not specified'}</T>}</dd>
                </div>
                {lead.current_auto_carrier && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.17aee8">Current Auto Carrier</T></dt>
                    <dd className={`font-medium ${
                      lead.current_auto_carrier === 'allstate' ? 'text-purple-600' : 'text-gray-900'
                    }`}>
                      {formatCarrier(lead.current_auto_carrier)}
                    </dd>
                  </div>
                )}
                {lead.current_auto_premium != null && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.c150d7">Current Auto Premium</T></dt>
                    <dd className="font-semibold text-gray-900">
                      ${lead.current_auto_premium.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal ml-1"><T k="pages.agencyleaddetailpage.6d8fef">/yr</T></span>
                    </dd>
                  </div>
                )}
                {lead.current_home_carrier && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.f4b42c">Current Home Carrier</T></dt>
                    <dd className={`font-medium ${
                      lead.current_home_carrier === 'allstate' ? 'text-purple-600' : 'text-gray-900'
                    }`}>
                      {formatCarrier(lead.current_home_carrier)}
                    </dd>
                  </div>
                )}
                {lead.current_home_premium != null && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.5025ee">Current Home Premium</T></dt>
                    <dd className="font-semibold text-gray-900">
                      ${lead.current_home_premium.toLocaleString()}
                      <span className="text-xs text-gray-400 font-normal ml-1"><T k="pages.agencyleaddetailpage.6d8fef">/yr</T></span>
                    </dd>
                  </div>
                )}
                {lead.allstate_conflict && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.771e80">Carrier Conflict</T></dt>
                    <dd className="font-bold text-purple-600">
                      <T k="pages.agencyleaddetailpage.4c0994">🟣 Allstate — cannot write</T>
                    </dd>
                  </div>
                )}
                {lead.auto_driving_record && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.68d9f7">Driving Record (3yr)</T></dt>
                    <dd className={`font-medium ${
                      lead.auto_driving_record === '3+' ? 'text-red-600' :
                      lead.auto_driving_record === '1-2' ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {lead.auto_driving_record === 'clean' ? <T k="pages.agencyleaddetailpage.fa893d">{'Clean'}</T> :
                       lead.auto_driving_record === '1-2' ? <T k="pages.agencyleaddetailpage.ea5060">{'1\u20132 incidents'}</T> : <T k="pages.agencyleaddetailpage.959b7c">{'3+ incidents'}</T>}
                    </dd>
                  </div>
                )}
                {lead.home_claims_history && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.c7dc3d">Home Claims (5yr)</T></dt>
                    <dd className={`font-medium ${
                      lead.home_claims_history === '2+' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {lead.home_claims_history === '0-1' ? <T k="pages.agencyleaddetailpage.d35544">{'0\u20131 claims'}</T> : <T k="pages.agencyleaddetailpage.169a87">{'2+ claims'}</T>}
                    </dd>
                  </div>
                )}
                {lead.coverage_lapse && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.0e9784">Coverage Lapse</T></dt>
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
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.e73344">Multiple Drivers</T></dt>
                    <dd className="font-medium text-gray-900">
                      {lead.multiple_drivers ? <T k="pages.agencyleaddetailpage.5397e0">{'Yes'}</T> : <T k="pages.agencyleaddetailpage.816c52">{'No'}</T>}
                    </dd>
                  </div>
                )}
                {lead.veteran_status && (
                  <div>
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.0252f6">Military / Veteran</T></dt>
                    <dd className={`font-medium ${
                      lead.veteran_status === 'yes' ? 'text-blue-600' : 'text-gray-900'
                    }`}>
                      {lead.veteran_status === 'yes' ? <T k="pages.agencyleaddetailpage.451e24">{'\u2713 Yes \u2014 discount eligible'}</T> : <T k="pages.agencyleaddetailpage.816c52">{'No'}</T>}
                    </dd>
                  </div>
                )}
                {(lead.vehicle_year || lead.vehicle_make || lead.vehicle_model) && (
                  <div className="col-span-2">
                    <dt className="text-gray-500 text-sm mb-1"><T k="pages.agencyleaddetailpage.d6af9c">Vehicle</T></dt>
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
                    <dt className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.957dae">Risk Flag</T></dt>
                    <dd className={`font-bold ${
                      lead.risk_flag === 'red' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {lead.risk_flag === 'red' ? <T k="pages.agencyleaddetailpage.a3cfc5">{'\uD83D\uDD34 Exceeds carrier limits'}</T> : <T k="pages.agencyleaddetailpage.4d37b8">{'\uD83D\uDFE1 Needs review'}</T>}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-500"><T k="pages.agencyleaddetailpage.f31bbd">Source</T></dt>
                  <dd className="text-gray-900 font-medium">
                    {lead.referral_code ? (
                      <span className="text-green-600"><T k="pages.agencyleaddetailpage.36efd0">Referral:</T> {lead.referral_code}</span>
                    ) : lead.utm_source ? (
                      lead.utm_source
                    ) : (
                      <T k="pages.agencyleaddetailpage.bc8152">{'Direct'}</T>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500"><T k="pages.agencyleaddetailpage.f00a1d">Campaign</T></dt>
                  <dd className="text-gray-900">{lead.utm_campaign || '-'}</dd>
                </div>
              </dl>

              {/* Contact Info Note — source-aware */}
              {lead.source === 'canopy' ? (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg">
                  <p className="text-sm text-primary-800">
                    <Phone className="w-4 h-4 inline mr-1" />
                    <T k="pages.agencyleaddetailpage.633b33">Contact details captured via Canopy. View full profile in your Canopy dashboard.</T>
                  </p>
                </div>
              ) : lead.source === 'winback' ? (
                <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
                  <p className="text-sm text-emerald-800">
                    ♻ <span className="font-semibold"><T k="pages.agencyleaddetailpage.c2c4b5">Former customer</T></span> <T k="pages.agencyleaddetailpage.3002e2">— generated from termination history. Contact comes from their Allstate record:</T>
                    {lead.phone ? <span className="font-medium"> {lead.phone}</span> : <T k="pages.agencyleaddetailpage.6d0467">{' no phone on file'}</T>}
                    {lead.email ? <> · <span className="font-medium">{lead.email}</span></> : null}
                  </p>
                  {lead.callback_note && (
                    <p className="text-sm text-emerald-900 mt-2 font-medium">{lead.callback_note}</p>
                  )}
                </div>
              ) : lead.source === 'cross_sell_audit' ? (
                <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
                  <p className="text-sm text-emerald-800">
                    💡 <span className="font-semibold"><T k="pages.agencyleaddetailpage.56dd1a">Active-book customer</T></span> <T k="pages.agencyleaddetailpage.cb9f84">— from the cross-sell audit. They already hold a policy with the agency; pitch adds the bundle discount.</T>
                    {lead.phone ? <span className="font-medium"> {lead.phone}</span> : null}
                  </p>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <Phone className="w-4 h-4 inline mr-1" />
                    <T k="pages.agencyleaddetailpage.406996">Contact details submitted via form.</T>
                    {lead.phone ? <span className="font-medium"> {lead.phone}</span> : null}
                  </p>
                </div>
              )}
            </div>

            {/* Declarations page — extracted from the lead's uploaded dec page */}
            <LeadDeclarationCard lead={lead} />

            {/* Quote Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.d8533c">Quote Summary</T></h2>

              {quoteData ? (
                <div className="space-y-4">
                  {/* Policy Types */}
                  {quoteSummary.policy_types && quoteSummary.policy_types.length > 0 && (
                    <div>
                      <dt className="text-sm text-gray-500 mb-1"><T k="pages.agencyleaddetailpage.d87fe1">Policy Types</T></dt>
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
                        <div className="text-xs text-gray-500"><T k="pages.agencyleaddetailpage.834671">Vehicles</T></div>
                      </div>
                    )}
                    {quoteSummary.driver_count !== undefined && (
                      <div className="text-center p-3 bg-gray-50 rounded">
                        <div className="text-2xl font-bold text-gray-900">{quoteSummary.driver_count}</div>
                        <div className="text-xs text-gray-500"><T k="pages.agencyleaddetailpage.8e64a6">Drivers</T></div>
                      </div>
                    )}
                    {quoteSummary.property_count !== undefined && (
                      <div className="text-center p-3 bg-gray-50 rounded">
                        <div className="text-2xl font-bold text-gray-900">{quoteSummary.property_count}</div>
                        <div className="text-xs text-gray-500"><T k="pages.agencyleaddetailpage.9fc2d2">Properties</T></div>
                      </div>
                    )}
                  </div>

                  {/* Renewal Proximity */}
                  {quoteSummary.renewal_days !== undefined && (
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <span className="text-yellow-800 font-medium">
                        <T k="pages.agencyleaddetailpage.ab4518">Renewal in</T> {quoteSummary.renewal_days} <T k="pages.agencyleaddetailpage.44fdec">days</T>
                      </span>
                    </div>
                  )}

                  {/* Documents */}
                  <div className="flex items-center gap-2">
                    <FileText className={`w-5 h-5 ${quoteData.has_documents ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className={quoteData.has_documents ? 'text-green-700' : 'text-gray-500'}>
                      {quoteData.has_documents ? (
                        <><T k="pages.agencyleaddetailpage.97417b">Documents available (</T>{quoteSummary.document_count || <T k="pages.agencyleaddetailpage.88fc77">{'multiple'}</T>})</>
                      ) : (
                        <T k="pages.agencyleaddetailpage.8386fe">{'No documents'}</T>
                      )}
                    </span>
                  </div>

                  {/* Premium (if present, labeled as reported) */}
                  {quoteSummary.reported_premium && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm">
                      <span className="text-gray-500"><T k="pages.agencyleaddetailpage.7c446c">Reported in documents:</T> </span>
                      <span className="text-gray-900 font-medium">
                        ${quoteSummary.reported_premium.toLocaleString()}
                      </span>
                      <span className="text-gray-400 ml-1"><T k="pages.agencyleaddetailpage.bcc14c">(unverified)</T></span>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    <T k="pages.agencyleaddetailpage.0f6024">Enriched:</T> {quoteData.enriched_at ? formatTimeAgo(quoteData.enriched_at) : <T k="pages.agencyleaddetailpage.96f608">{'Pending'}</T>}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500"><T k="pages.agencyleaddetailpage.748501">No enrichment data available yet.</T></p>
              )}
            </div>

            {/* AI Verification */}
            {(lead.bland_outbound_call_id || lead.bland_inbound_call_id || blandCallLog) && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-500" />
                  <T k="pages.agencyleaddetailpage.28db5c">AI Verification</T>
                </h2>

                <div className="space-y-4">
                  {/* Status Badges Row */}
                  <div className="flex flex-wrap gap-2">
                    {/* Verification Status */}
                    {lead.bland_verified ? (
                      lead.bland_qualified === true ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          <CheckCircle className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.d0c7fd">Verified & Qualified</T>
                        </span>
                      ) : lead.bland_qualified === false ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.4d8e6f">Disqualified</T>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          <CheckCircle className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.3f68e6">Verified</T>
                        </span>
                      )
                    ) : lead.bland_outbound_status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                        <Clock className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.ec1383">Call In Progress</T>
                      </span>
                    ) : lead.bland_outbound_call_id || lead.bland_inbound_call_id ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        <T k="pages.agencyleaddetailpage.c52c6e">Attempted</T>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                        <T k="pages.agencyleaddetailpage.44f0ab">Not Called</T>
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
                          ? <><PhoneOutgoing className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.3ed57e">Outbound Verification</T></>
                          : <><PhoneIncoming className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.c31854">Inbound Call</T></>
                        }
                      </span>
                    )}

                    {/* Transfer Outcome */}
                    {blandCallLog?.transferred === true && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.3f89c4">Transferred</T>
                      </span>
                    )}
                    {blandCallLog?.transferred === false && blandCallLog?.variables?.transfer_attempted === 'true' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <T k="pages.agencyleaddetailpage.91bc48">Transfer — No Answer</T>
                      </span>
                    )}

                    {/* Canopy Link */}
                    {lead.canopy_link_sent && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                        <ExternalLink className="w-3.5 h-3.5" /> <T k="pages.agencyleaddetailpage.5498d0">Canopy Link Sent</T>
                      </span>
                    )}
                  </div>

                  {/* Details Grid */}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {lead.bland_disqualify_reason && (
                      <div className="col-span-2">
                        <dt className="text-gray-500 text-xs"><T k="pages.agencyleaddetailpage.0daa28">Disqualify Reason</T></dt>
                        <dd className="text-red-600 font-medium">{lead.bland_disqualify_reason}</dd>
                      </div>
                    )}
                    {blandCallLog?.transferred_to_name && (
                      <div>
                        <dt className="text-gray-500 text-xs"><T k="pages.agencyleaddetailpage.225242">Transferred To</T></dt>
                        <dd className="text-gray-900 font-medium">{blandCallLog.transferred_to_name}</dd>
                      </div>
                    )}
                    {blandCallLog?.duration_seconds != null && (
                      <div>
                        <dt className="text-gray-500 text-xs"><T k="pages.agencyleaddetailpage.afb061">Call Duration</T></dt>
                        <dd className="text-gray-900 font-medium">
                          {Math.floor(blandCallLog.duration_seconds / 60)}m {blandCallLog.duration_seconds % 60}s
                        </dd>
                      </div>
                    )}
                    {blandCallLog?.variables?.coverage_interest && (
                      <div>
                        <dt className="text-gray-500 text-xs"><T k="pages.agencyleaddetailpage.456bcd">Coverage Interest</T></dt>
                        <dd className="text-gray-900 font-medium capitalize">{blandCallLog.variables.coverage_interest}</dd>
                      </div>
                    )}
                    {blandCallLog?.variables?.callback_requested === 'true' && (
                      <div>
                        <dt className="text-gray-500 text-xs"><T k="pages.agencyleaddetailpage.adf678">Callback Requested</T></dt>
                        <dd className="text-gray-900 font-medium">
                          {blandCallLog.variables.callback_time_preference || <T k="pages.agencyleaddetailpage.f0a745">{'Yes — no time specified'}</T>}
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
                        {transcriptOpen ? <T k="pages.agencyleaddetailpage.34d8b6">{'Hide'}</T> : <T k="pages.agencyleaddetailpage.d97d1e">{'Show'}</T>} <T k="pages.agencyleaddetailpage.f24f9b">Transcript</T>
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
                      <T k="pages.agencyleaddetailpage.3f68e6">Verified</T> {formatTimeAgo(lead.bland_verified_at)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                <T k="pages.agencyleaddetailpage.41de6d">Messages</T>
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.ecfc2d">Activity</T></h2>
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
                <p className="text-gray-500 text-sm"><T k="pages.agencyleaddetailpage.cc5f05">No activity recorded yet.</T></p>
              )}
            </div>
          </div>

          {/* Sidebar - Actions & SLA */}
          <div className="space-y-6">
            {/* SLA Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.5d1983">SLA Metrics</T></h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock className="w-4 h-4" /> <T k="pages.agencyleaddetailpage.626057">Time Since Created</T>
                  </dt>
                  <dd className="text-xl font-bold text-gray-900">{formatDuration(lead.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> <T k="pages.agencyleaddetailpage.368022">Time to First Contact</T>
                  </dt>
                  <dd className="text-xl font-bold text-gray-900">
                    {lead.first_contact_at ? (
                      formatDuration(lead.created_at, lead.first_contact_at)
                    ) : lead.source === 'winback' ? (
                      // Winbacks are batch work, not interrupt work — a 2024
                      // termination doesn't decay by the hour. No SLA pressure.
                      <span className="text-gray-500"><T k="pages.agencyleaddetailpage.1704e3">Batch lead — no SLA</T></span>
                    ) : (
                      <span className="text-orange-600"><T k="pages.agencyleaddetailpage.9deb4b">Not contacted</T></span>
                    )}
                  </dd>
                </div>
                {lead.first_contact_at && (
                  <div className="text-xs text-gray-500">
                    <T k="pages.agencyleaddetailpage.489794">First contact:</T> {formatDate(lead.first_contact_at)}
                  </div>
                )}
              </dl>
            </div>

            {/* Workflow Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.06df33">Actions</T></h2>

              {/* First Contact Button */}
              {!lead.first_contact_at && (
                <button
                  onClick={handleFirstContact}
                  disabled={updating}
                  className="w-full mb-4 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <T k="pages.agencyleaddetailpage.999317">Mark First Contacted</T>
                </button>
              )}

              {/* Status Buttons */}
              <p className="text-sm text-gray-500 mb-3"><T k="pages.agencyleaddetailpage.4c31df">Update Status:</T></p>
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
                    <T>{action.label}</T>
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
                    <T k="pages.agencyleaddetailpage.7dd847">Close or Convert Lead</T>
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
                      {lead.status === 'closed_won' ? <T k="pages.agencyleaddetailpage.4716ac">{'Converted — Quoted in Lead Manager'}</T> : <T k="pages.agencyleaddetailpage.88d86b">{'Closed'}</T>}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4"><T k="pages.agencyleaddetailpage.2855b8">Attribution</T></h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500"><T k="pages.agencyleaddetailpage.93cb0f">UTM Source</T></dt>
                  <dd className="text-gray-900">{lead.utm_source || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500"><T k="pages.agencyleaddetailpage.34f171">UTM Medium</T></dt>
                  <dd className="text-gray-900">{lead.utm_medium || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500"><T k="pages.agencyleaddetailpage.2eeaad">UTM Campaign</T></dt>
                  <dd className="text-gray-900">{lead.utm_campaign || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500"><T k="pages.agencyleaddetailpage.23edfe">Referral Code</T></dt>
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
