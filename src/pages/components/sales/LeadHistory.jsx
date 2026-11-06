// Sales workspace: the lead's history. Every text with them, what happened on the lead,
// who referred them, where they came from and how fast we got to them.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { T } from '../../../components/SiteCopy';
import { supabase } from '../../../lib/supabase';
import { useCurrentAgency, useLeadAuditLog, useLeadDetail, useLeadMessages } from '../../../hooks/useAgencyLeads';
import LeadMessageThread from '../LeadMessageThread';
import ReferredByField from './ReferredByField';

const card = { background: 'var(--qs-card)', border: '1px solid var(--qs-border)' };

function ago(date) {
  if (!date) return '';
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function duration(start, end = new Date()) {
  if (!start) return '';
  const mins = Math.max(0, Math.floor((new Date(end) - new Date(start)) / 60000));
  const hours = Math.floor(mins / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// New texts show up as they arrive (and after the tab comes back from the background).
function useLiveMessages(leadId) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!leadId) return undefined;
    let timer = null;
    let channel = null;
    const subscribe = () => {
      channel = supabase.channel(`lead-messages-${leadId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_messages', filter: `lead_id=eq.${leadId}` },
          () => queryClient.invalidateQueries({ queryKey: ['lead_messages', leadId] }))
        .subscribe((status) => {
          if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && !timer) {
            timer = setTimeout(() => { timer = null; supabase.removeChannel(channel); subscribe(); }, 5000);
          }
        });
    };
    subscribe();
    return () => { clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }, [leadId, queryClient]);
  return useLeadMessages(leadId);
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl p-4" style={card}>
      <h3 className="mb-3 text-base font-bold" style={{ color: 'var(--qs-bright)' }}><T>{title}</T></h3>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt style={{ color: 'var(--qs-subtle)' }}><T>{label}</T></dt>
      <dd className="text-right font-medium" style={{ color: 'var(--qs-bright)' }}>{children || '—'}</dd>
    </div>
  );
}

export default function LeadHistory({ leadId }) {
  const { data: agency } = useCurrentAgency();
  const agencyId = agency?.agency_id;
  const { data: lead } = useLeadDetail(leadId, agencyId);
  const { data: messages = [], isLoading: messagesLoading } = useLiveMessages(leadId);
  const { data: log = [] } = useLeadAuditLog(leadId);

  if (!leadId) return <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="sales.history.nolead">No lead record yet, so there’s no history.</T></p>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="sales.history.title">History</T></h3>

      <Section title="Texts">
        <LeadMessageThread messages={messages} isLoading={messagesLoading} leadId={leadId} leadPhone={lead?.phone} />
      </Section>

      <Section title="Activity">
        {log.length ? (
          <ol className="space-y-3">
            {log.map(e => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--qs-border)' }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold" style={{ color: 'var(--qs-bright)' }}>{titleCase(e.event_type)}</span>
                  {e.metadata?.old_status && <span className="block text-xs" style={{ color: 'var(--qs-text)' }}>{titleCase(e.metadata.old_status)} → {titleCase(e.metadata.new_status)}</span>}
                  <span className="block text-xs" style={{ color: 'var(--qs-subtle)' }}>{ago(e.created_at)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.agencyleaddetailpage.cc5f05">No activity recorded yet.</T></p>}
      </Section>

      {lead && (
        <Section title="Where They Came From">
          <dl className="space-y-2.5 text-sm">
            <ReferredByField lead={lead} leadId={leadId} agencyId={agencyId} />
            <Row label="Source">{titleCase(lead.source)}</Row>
            <Row label="UTM Source">{lead.utm_source}</Row>
            <Row label="UTM Medium">{lead.utm_medium}</Row>
            <Row label="UTM Campaign">{lead.utm_campaign}</Row>
            <Row label="Referral Code">{lead.referral_code}</Row>
          </dl>
        </Section>
      )}

      {lead && (
        <Section title="Response Time">
          <dl className="space-y-2.5 text-sm">
            <Row label="Came In">{duration(lead.created_at)} <span style={{ color: 'var(--qs-subtle)' }}>ago</span></Row>
            <Row label="First Contact">
              {lead.first_contact_at ? <>{duration(lead.created_at, lead.first_contact_at)} <span style={{ color: 'var(--qs-subtle)' }}>after</span></>
                : lead.source === 'winback' ? <T k="sales.history.batch">Batch Lead · No SLA</T>
                : <T k="pages.agencyleaddetailpage.9deb4b">Not contacted</T>}
            </Row>
          </dl>
        </Section>
      )}
    </div>
  );
}
