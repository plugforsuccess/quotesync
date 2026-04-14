// src/pages/components/settings/CadenceSettingsTab.jsx
// Principal activates cadence types per employee, sets schedule,
// generates calendar links. Multi-tenant — all queries scoped to agencyId.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useActiveEmployees } from '../../../hooks/useEmployees';

// ── Calendar link generators ──────────────────────────────────
// All generated client-side. No OAuth. No backend required.

function toGoogleDate(date, time = '08:00') {
  // Returns YYYYMMDDTHHmmss format for Google Calendar deep link
  const d = new Date(`${date}T${time}:00`);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0];
}

function getRRULE(frequencyDays) {
  if (frequencyDays === 1)  return 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR';
  if (frequencyDays === 7)  return 'RRULE:FREQ=WEEKLY';
  if (frequencyDays === 31) return 'RRULE:FREQ=MONTHLY';
  if (frequencyDays === 90) return 'RRULE:FREQ=MONTHLY;INTERVAL=3';
  if (frequencyDays === 365) return 'RRULE:FREQ=YEARLY';
  return `RRULE:FREQ=DAILY;INTERVAL=${frequencyDays}`;
}

function buildGoogleLink({ label, employeeName, date, time, durationMins, frequencyDays, agendaUrl }) {
  const start = toGoogleDate(date, time);
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + durationMins);
  const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0];
  const title = encodeURIComponent(`${label} — ${employeeName}`);
  const details = encodeURIComponent(`QuoteSync agenda: ${agendaUrl}`);
  const recur = encodeURIComponent(getRRULE(frequencyDays));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&recur=${recur}&details=${details}`;
}

function buildOutlookLink({ label, employeeName, date, time, durationMins, agendaUrl }) {
  const start = new Date(`${date}T${time}:00`).toISOString();
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + durationMins);
  const end = endDate.toISOString();
  const subject = encodeURIComponent(`${label} — ${employeeName}`);
  const body = encodeURIComponent(`QuoteSync agenda: ${agendaUrl}`);
  return `https://outlook.office.com/calendar/action/compose?subject=${subject}&startdt=${start}&enddt=${end}&body=${body}`;
}

function downloadICS({ label, employeeName, date, time, durationMins, frequencyDays, agendaUrl }) {
  const start = toGoogleDate(date, time);
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + durationMins);
  const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0];
  const uid = `${Date.now()}@quotesync`;
  const rrule = getRRULE(frequencyDays);
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `RRULE:${rrule.replace('RRULE:','')}`,
    `SUMMARY:${label} — ${employeeName}`,
    `DESCRIPTION:QuoteSync agenda: ${agendaUrl}`,
    `UID:${uid}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${label.replace(/\s+/g, '-').toLowerCase()}-${employeeName.split(' ')[0].toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Frequency label helper ─────────────────────────────────────
function freqLabel(days) {
  if (days === 1)   return 'Daily (weekdays)';
  if (days === 7)   return 'Weekly';
  if (days === 14)  return 'Bi-weekly';
  if (days === 31)  return 'Monthly';
  if (days === 90)  return 'Quarterly';
  if (days === 365) return 'Annually';
  return `Every ${days} days`;
}

// ── Main component ─────────────────────────────────────────────
export default function CadenceSettingsTab({ agencyId, isAgent }) {
  const queryClient = useQueryClient();
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(null); // cadenceId showing calendar picker
  const [saving, setSaving] = useState(null);

  // Fetch cadence templates (platform-level, shared across all agencies)
  const { data: templates = [] } = useQuery({
    queryKey: ['cadence_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cadence_templates')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // templates rarely change
  });

  // Fetch active employees for this agency
  const { data: employees = [] } = useActiveEmployees(agencyId);

  // Fetch this agency's configured cadences
  const { data: agencyCadences = [], isLoading } = useQuery({
    queryKey: ['agency_cadences', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_cadences')
        .select('*')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // Get cadence config for a specific employee + type
  function getCadence(employeeId, cadenceType) {
    return agencyCadences.find(
      c => c.employee_id === employeeId && c.cadence_type === cadenceType
    ) || null;
  }

  // Upsert a cadence configuration
  async function upsertCadence({ employeeId, cadenceType, patch }) {
    setSaving(`${employeeId}-${cadenceType}`);
    const template = templates.find(t => t.cadence_type === cadenceType);
    const existing = getCadence(employeeId, cadenceType);

    const row = {
      agency_id: agencyId,
      employee_id: employeeId,
      cadence_type: cadenceType,
      frequency_days: template?.default_frequency_days ?? 7,
      duration_mins: template?.default_duration_mins ?? 15,
      active: true,
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('agency_cadences')
      .upsert(row, { onConflict: 'agency_id,cadence_type,employee_id' });

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['agency_cadences', agencyId] });
    }
    setSaving(null);
  }

  // Build agenda URL for calendar link
  function agendaUrl(cadenceType, employeeId) {
    return `${window.location.origin}/agency/cadence/${cadenceType}/${employeeId}`;
  }

  // Today's date for calendar link default
  const today = new Date().toISOString().split('T')[0];

  if (isLoading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--qs-muted)' }}>
      Loading cadence settings...
    </div>
  );

  // Filter employees that are not AI/bot (empty roles = bot)
  const staffEmployees = employees.filter(e => e.roles?.length > 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--qs-bright)' }}>
          Management Cadence
        </h2>
        <p style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 4 }}>
          Activate recurring touchpoints for each employee. Each cadence generates
          a calendar link so meetings actually happen on a schedule.
        </p>
      </div>

      {staffEmployees.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--qs-muted)',
          fontSize: 13, border: '1px solid var(--qs-border)', borderRadius: 10 }}>
          No employees found. Add employees first to configure cadences.
        </div>
      )}

      {/* Employee accordion */}
      {staffEmployees.map(emp => {
        const isExpanded = expandedEmployee === emp.id;
        const empName = `${emp.first_name} ${emp.last_name}`;
        const empRoles = emp.roles || [];

        // Count active cadences for this employee
        const activeCadenceCount = agencyCadences.filter(
          c => c.employee_id === emp.id && c.active
        ).length;

        return (
          <div key={emp.id} style={{
            border: '1px solid var(--qs-border)', borderRadius: 10,
            marginBottom: 12, overflow: 'hidden',
          }}>
            {/* Employee header row */}
            <div
              onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
              style={{
                padding: '14px 18px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', background: 'var(--qs-card)',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#3B82F622', border: '1px solid #3B82F633',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#3B82F6',
                }}>
                  {emp.first_name[0]}{emp.last_name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                    {empName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 2 }}>
                    {empRoles.join(', ')}
                    {activeCadenceCount > 0 && (
                      <span style={{ marginLeft: 8, color: '#10B981', fontWeight: 600 }}>
                        · {activeCadenceCount} active cadence{activeCadenceCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span style={{ color: 'var(--qs-muted)', fontSize: 16 }}>
                {isExpanded ? '▲' : '▼'}
              </span>
            </div>

            {/* Cadence list */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--qs-border)' }}>
                {templates
                  .filter(t =>
                    // Show templates applicable to this employee's roles
                    t.applicable_roles.some(r => empRoles.includes(r))
                  )
                  .map(template => {
                    const cadence = getCadence(emp.id, template.cadence_type);
                    const isActive = cadence?.active ?? false;
                    const isSavingThis = saving === `${emp.id}-${template.cadence_type}`;
                    const showCal = calendarOpen === `${emp.id}-${template.cadence_type}`;

                    const freq = cadence?.frequency_days ?? template.default_frequency_days;
                    const dur = cadence?.duration_mins ?? template.default_duration_mins;
                    const time = cadence?.preferred_time?.slice(0,5) ?? '08:15';

                    return (
                      <div key={template.cadence_type} style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--qs-border)',
                        background: 'var(--qs-elevated)',
                      }}>
                        {/* Row: toggle + label + calendar button */}
                        <div style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Active toggle */}
                            <button
                              onClick={() => upsertCadence({
                                employeeId: emp.id,
                                cadenceType: template.cadence_type,
                                patch: { active: !isActive },
                              })}
                              disabled={isSavingThis}
                              style={{
                                width: 40, height: 22, borderRadius: 11,
                                background: isActive ? '#10B981' : '#374151',
                                border: 'none', cursor: 'pointer',
                                position: 'relative', transition: 'background 0.2s',
                                flexShrink: 0,
                              }}
                            >
                              <div style={{
                                position: 'absolute', top: 2,
                                left: isActive ? 20 : 2,
                                width: 18, height: 18, borderRadius: '50%',
                                background: '#fff', transition: 'left 0.2s',
                              }} />
                            </button>

                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600,
                                color: isActive ? 'var(--qs-bright)' : 'var(--qs-muted)' }}>
                                {template.label}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 2 }}>
                                {isActive
                                  ? `${freqLabel(freq)} · ${dur} min · ${time}`
                                  : template.description}
                              </div>
                            </div>
                          </div>

                          {/* Calendar button — only if active */}
                          {isActive && (
                            <button
                              onClick={() => setCalendarOpen(showCal ? null : `${emp.id}-${template.cadence_type}`)}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '5px 12px',
                                borderRadius: 6, background: '#3B82F622',
                                border: '1px solid #3B82F633', color: '#3B82F6',
                                cursor: 'pointer', flexShrink: 0,
                              }}>
                              📅 Add to Calendar
                            </button>
                          )}
                        </div>

                        {/* Expanded config — frequency, time */}
                        {isActive && (
                          <div style={{ marginTop: 12, display: 'flex', gap: 12,
                            flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ fontSize: 11, color: 'var(--qs-muted)',
                                display: 'block', marginBottom: 4 }}>Frequency</label>
                              <select
                                value={freq}
                                onChange={e => upsertCadence({
                                  employeeId: emp.id,
                                  cadenceType: template.cadence_type,
                                  patch: { frequency_days: parseInt(e.target.value) },
                                })}
                                style={{
                                  fontSize: 12, padding: '5px 8px', borderRadius: 6,
                                  background: 'var(--qs-card)',
                                  border: '1px solid var(--qs-border)',
                                  color: 'var(--qs-text)',
                                }}>
                                <option value={1}>Daily (weekdays)</option>
                                <option value={7}>Weekly</option>
                                <option value={14}>Bi-weekly</option>
                                <option value={31}>Monthly</option>
                                <option value={90}>Quarterly</option>
                                <option value={365}>Annually</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ fontSize: 11, color: 'var(--qs-muted)',
                                display: 'block', marginBottom: 4 }}>Preferred time</label>
                              <input
                                type="time"
                                value={time}
                                onChange={e => upsertCadence({
                                  employeeId: emp.id,
                                  cadenceType: template.cadence_type,
                                  patch: { preferred_time: e.target.value },
                                })}
                                style={{
                                  fontSize: 12, padding: '5px 8px', borderRadius: 6,
                                  background: 'var(--qs-card)',
                                  border: '1px solid var(--qs-border)',
                                  color: 'var(--qs-text)',
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ fontSize: 11, color: 'var(--qs-muted)',
                                display: 'block', marginBottom: 4 }}>Duration (min)</label>
                              <select
                                value={dur}
                                onChange={e => upsertCadence({
                                  employeeId: emp.id,
                                  cadenceType: template.cadence_type,
                                  patch: { duration_mins: parseInt(e.target.value) },
                                })}
                                style={{
                                  fontSize: 12, padding: '5px 8px', borderRadius: 6,
                                  background: 'var(--qs-card)',
                                  border: '1px solid var(--qs-border)',
                                  color: 'var(--qs-text)',
                                }}>
                                {[5,10,15,20,30,45,60].map(m => (
                                  <option key={m} value={m}>{m} min</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Calendar picker dropdown */}
                        {isActive && showCal && (
                          <div style={{
                            marginTop: 12, padding: 14, borderRadius: 8,
                            background: 'var(--qs-card)',
                            border: '1px solid var(--qs-border)',
                          }}>
                            <p style={{ fontSize: 12, color: 'var(--qs-muted)',
                              marginBottom: 10 }}>
                              This adds a recurring event to your calendar with a
                              link back to the QuoteSync agenda for each meeting.
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <a
                                href={buildGoogleLink({
                                  label: template.label,
                                  employeeName: empName,
                                  date: today,
                                  time,
                                  durationMins: dur,
                                  frequencyDays: freq,
                                  agendaUrl: agendaUrl(template.cadence_type, emp.id),
                                })}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: 12, fontWeight: 600, padding: '7px 14px',
                                  borderRadius: 6, background: '#4285F422',
                                  border: '1px solid #4285F433', color: '#4285F4',
                                  textDecoration: 'none',
                                }}>
                                Google Calendar
                              </a>
                              <a
                                href={buildOutlookLink({
                                  label: template.label,
                                  employeeName: empName,
                                  date: today,
                                  time,
                                  durationMins: dur,
                                  agendaUrl: agendaUrl(template.cadence_type, emp.id),
                                })}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: 12, fontWeight: 600, padding: '7px 14px',
                                  borderRadius: 6, background: '#0078D422',
                                  border: '1px solid #0078D433', color: '#0078D4',
                                  textDecoration: 'none',
                                }}>
                                Outlook
                              </a>
                              <button
                                onClick={() => downloadICS({
                                  label: template.label,
                                  employeeName: empName,
                                  date: today,
                                  time,
                                  durationMins: dur,
                                  frequencyDays: freq,
                                  agendaUrl: agendaUrl(template.cadence_type, emp.id),
                                })}
                                style={{
                                  fontSize: 12, fontWeight: 600, padding: '7px 14px',
                                  borderRadius: 6, background: 'var(--qs-elevated)',
                                  border: '1px solid var(--qs-border)',
                                  color: 'var(--qs-dim)', cursor: 'pointer',
                                }}>
                                Download .ics
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
