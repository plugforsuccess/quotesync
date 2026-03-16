// src/pages/AgencyLeadDetailPage.jsx
// Agency Lead Detail View with Quote Summary and Workflow Actions

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Clock, MapPin, FileText, Tag, Phone,
  CheckCircle, AlertCircle, ExternalLink, RefreshCw, MessageSquare,
  XCircle
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

  // Realtime subscription for new messages
  useEffect(() => {
    if (!leadId) return;
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, queryClient]);

  const updateStatus = useUpdateLeadStatus();
  const setFirstContact = useSetFirstContact();
  const recomputeScore = useRecomputeLeadScore();
  const disposeLead = useDisposeLead();
  const [showDisposition, setShowDisposition] = useState(false);

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
                      {lead.current_auto_carrier === 'state_farm' ? 'State Farm' :
                       lead.current_auto_carrier === 'geico' ? 'GEICO' :
                       lead.current_auto_carrier === 'progressive' ? 'Progressive' :
                       lead.current_auto_carrier === 'allstate' ? 'Allstate' :
                       lead.current_auto_carrier === 'liberty_mutual' ? 'Liberty Mutual' :
                       lead.current_auto_carrier === 'farmers' ? 'Farmers' :
                       lead.current_auto_carrier === 'farm_bureau' ? 'GA Farm Bureau' :
                       lead.current_auto_carrier === 'usaa' ? 'USAA' :
                       lead.current_auto_carrier === 'nationwide' ? 'Nationwide' :
                       lead.current_auto_carrier === 'none' ? 'No current policy' :
                       'Other'}
                    </dd>
                  </div>
                )}
                {lead.current_home_carrier && (
                  <div>
                    <dt className="text-gray-500 text-sm">Current Home Carrier</dt>
                    <dd className={`font-medium ${
                      lead.current_home_carrier === 'allstate' ? 'text-purple-600' : 'text-gray-900'
                    }`}>
                      {lead.current_home_carrier === 'state_farm' ? 'State Farm' :
                       lead.current_home_carrier === 'geico' ? 'GEICO' :
                       lead.current_home_carrier === 'progressive' ? 'Progressive' :
                       lead.current_home_carrier === 'allstate' ? 'Allstate' :
                       lead.current_home_carrier === 'liberty_mutual' ? 'Liberty Mutual' :
                       lead.current_home_carrier === 'farmers' ? 'Farmers' :
                       lead.current_home_carrier === 'farm_bureau' ? 'GA Farm Bureau' :
                       lead.current_home_carrier === 'usaa' ? 'USAA' :
                       lead.current_home_carrier === 'nationwide' ? 'Nationwide' :
                       lead.current_home_carrier === 'none' ? 'No current policy' :
                       'Other'}
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
