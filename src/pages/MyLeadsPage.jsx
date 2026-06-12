// src/pages/MyLeadsPage.jsx
// The producer's daily new-business queue: assigned leads ranked "work these
// next", with log-touch / schedule-follow-up / snooze. The actual contact work
// (messaging, quoting, disposition) happens in the lead detail page, which this
// links to — leads are intentionally PII-light, so this view triages and the
// detail page does the work.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProducerQueue, useLogLeadTouch, useScheduleLeadFollowup, useSnoozeLead } from '../hooks/useProducerQueue';

function relativeTime(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

const RESULTS = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'left_voicemail', label: 'Voicemail' },
  { value: 'reached', label: 'Reached ✓' },
  { value: 'wrong_number', label: 'Wrong #' },
  { value: 'busy', label: 'Busy' },
  { value: 'disconnected', label: 'Disconnected' },
];

function LeadCard({ lead, onLog, onFollowup, onSnooze }) {
  const due = lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= Date.now();
  const enrichment = lead.enrichment_status;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return (
    <div style={{
      background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 10,
      borderLeft: due ? '3px solid #F59E0B' : '1px solid var(--qs-border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright, #fff)' }}>
            {name || (lead.product_intent ? `${lead.product_intent} lead` : 'New lead')}
            {lead.source === 'winback' && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, marginLeft: 8,
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399',
              }}
              title="Former customer — generated from termination history. Batch work, no SLA clock.">
                ♻ Winback
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--qs-dim)', marginLeft: 8 }}>
              {[lead.product_intent, lead.state, lead.zip].filter(Boolean).join(' · ')}
            </span>
          </div>
          {lead.phone && (
            <a href={`tel:${lead.phone}`} style={{ fontSize: 12, color: 'var(--qs-info, #3B82F6)', textDecoration: 'none' }}>
              📞 {lead.phone}
            </a>
          )}
          <div style={{ fontSize: 11, color: 'var(--qs-subtle)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ textTransform: 'capitalize' }}>{(lead.status || 'new').replace('_', ' ')}</span>
            {lead.attempt_count > 0 && <span>· {lead.attempt_count} attempt{lead.attempt_count !== 1 ? 's' : ''}{lead.last_attempt_result ? ` (${lead.last_attempt_result.replace('_', ' ')})` : ''}</span>}
            {enrichment === 'enriched' && <span style={{ color: '#10B981' }}>· enriched</span>}
            {lead.risk_flag && <span style={{ color: '#F59E0B' }}>· risk</span>}
            <span>· created {relativeTime(lead.created_at)}</span>
            {lead.next_followup_at && (
              <span style={{ color: due ? '#F59E0B' : 'var(--qs-subtle)' }}>
                · follow-up {new Date(lead.next_followup_at).toLocaleDateString()}
              </span>
            )}
          </div>
          {lead.callback_note && (
            <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 4, fontStyle: 'italic' }}>“{lead.callback_note}”</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {lead.lead_score != null && (
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--qs-info, #3B82F6)' }}>
              {Math.round(lead.lead_score)}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>score</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={() => onLog(lead)} style={btn('primary')}>Log Touch</button>
        <button onClick={() => onFollowup(lead)} style={btn()}>📅 Follow-up</button>
        <button onClick={() => onSnooze(lead)} style={btn()}>💤 Snooze</button>
        <Link to={`/agency/leads/${lead.id}`} style={{ ...btn(), textDecoration: 'none', display: 'inline-block' }}>Open →</Link>
      </div>
    </div>
  );
}

function btn(kind) {
  return {
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
    border: kind === 'primary' ? 'none' : '1px solid var(--qs-border)',
    background: kind === 'primary' ? 'var(--qs-info, #3B82F6)' : 'transparent',
    color: kind === 'primary' ? '#fff' : 'var(--qs-dim)',
  };
}

export default function MyLeadsPage() {
  const { leads, isLoading, error, dailyTarget, touchedToday, followupsDue } = useProducerQueue();
  const logTouch = useLogLeadTouch();
  const scheduleFollowup = useScheduleLeadFollowup();
  const snoozeLead = useSnoozeLead();

  const [logTarget, setLogTarget] = useState(null);
  const [logForm, setLogForm] = useState({ result: 'no_answer', note: '' });
  const [fuTarget, setFuTarget] = useState(null);
  const [fuForm, setFuForm] = useState({ time: '', note: '' });

  const closeAll = () => { setLogTarget(null); setFuTarget(null); };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--qs-bright, #fff)', marginBottom: 4 }}>New Business Queue</h1>
      <div style={{ fontSize: 13, color: 'var(--qs-subtle)', marginBottom: 16 }}>
        {touchedToday}/{dailyTarget} touched today
        {followupsDue > 0 && <span style={{ color: '#F59E0B' }}> · {followupsDue} follow-up{followupsDue !== 1 ? 's' : ''} due</span>}
      </div>

      {isLoading && <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading your leads…</div>}
      {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error.message}</div>}
      {!isLoading && !error && leads.length === 0 && (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>No open leads assigned to you. Nice — inbox zero.</div>
      )}

      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead}
          onLog={(l) => { setLogTarget(l); setLogForm({ result: 'no_answer', note: '' }); }}
          onFollowup={(l) => { setFuTarget(l); setFuForm({ time: '', note: '' }); }}
          onSnooze={(l) => snoozeLead.mutate({ leadId: l.id, days: 3, reason: 'producer snooze' })}
        />
      ))}

      {/* Log Touch */}
      {logTarget && (
        <Overlay onClose={closeAll} title="Log Touch">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
            {RESULTS.map((o) => (
              <button key={o.value} onClick={() => setLogForm((f) => ({ ...f, result: o.value }))}
                style={{
                  fontSize: 13, padding: '9px 6px', borderRadius: 7, cursor: 'pointer', fontWeight: 600,
                  border: '1px solid', borderColor: logForm.result === o.value ? 'var(--qs-info)' : 'var(--qs-border)',
                  background: logForm.result === o.value ? 'rgba(59,130,246,0.12)' : 'var(--qs-elevated)',
                  color: logForm.result === o.value ? 'var(--qs-info)' : 'var(--qs-dim)',
                }}>{o.label}</button>
            ))}
          </div>
          <input className="dark-input" placeholder="Optional note…" value={logForm.note}
            onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '10px 12px' }} />
          <ActionRow onCancel={closeAll} disabled={logTouch.isPending}
            onConfirm={async () => { await logTouch.mutateAsync({ lead: logTarget, result: logForm.result, note: logForm.note }); closeAll(); }} />
        </Overlay>
      )}

      {/* Schedule Follow-up */}
      {fuTarget && (
        <Overlay onClose={closeAll} title="Schedule Follow-up">
          <input type="datetime-local" className="dark-input" value={fuForm.time}
            onChange={(e) => setFuForm((f) => ({ ...f, time: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '10px 12px' }} />
          <input className="dark-input" placeholder="Note (optional)…" value={fuForm.note}
            onChange={(e) => setFuForm((f) => ({ ...f, note: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '10px 12px' }} />
          <ActionRow onCancel={closeAll} disabled={scheduleFollowup.isPending || !fuForm.time}
            onConfirm={async () => {
              await scheduleFollowup.mutateAsync({ leadId: fuTarget.id, followupAt: new Date(fuForm.time).toISOString(), note: fuForm.note });
              closeAll();
            }} />
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--qs-card, #1a1a1a)', border: '1px solid var(--qs-border)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--qs-bright, #fff)', marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ActionRow({ onCancel, onConfirm, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button onClick={onCancel} style={btn()}>Cancel</button>
      <button onClick={onConfirm} disabled={disabled} style={{ ...btn('primary'), opacity: disabled ? 0.5 : 1 }}>Save</button>
    </div>
  );
}
