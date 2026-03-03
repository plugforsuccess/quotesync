// src/pages/components/time-attendance/WeeklyTimeTable.jsx
// Admin-facing weekly breakdown table for a single employee

import { CheckCircle, XCircle, Clock } from 'lucide-react';

const CODE_LABELS = {
  REG: { label: 'Regular', bg: 'bg-green-100', text: 'text-green-700' },
  WFH: { label: 'WFH', bg: 'bg-blue-100', text: 'text-blue-700' },
  SICK: { label: 'Sick', bg: 'bg-red-100', text: 'text-red-700' },
  SICK_PART: { label: 'Sick (Part)', bg: 'bg-orange-100', text: 'text-orange-700' },
  PTO: { label: 'PTO', bg: 'bg-purple-100', text: 'text-purple-700' },
  APPT: { label: 'Appt', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  EARLY: { label: 'Early', bg: 'bg-amber-100', text: 'text-amber-700' },
};

function formatTime(t) {
  if (!t) return '-';
  // t is like "09:00:00" — show "9:00 AM"
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyTimeTable({ entries, onToggleApproval, onBulkApproval }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No time entries for this week.</p>
      </div>
    );
  }

  // Sort by work_date
  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));

  // Totals
  const totalHours = sorted.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
  const ptoDays = sorted.filter((e) => e.code === 'PTO').length;
  const sickDays = sorted.filter((e) => e.code === 'SICK' || e.code === 'SICK_PART').length;
  const wfhDays = sorted.filter((e) => e.location === 'WFH' || e.code === 'WFH').length;

  const pendingCount = sorted.filter((e) => !e.approved).length;
  const allApproved = pendingCount === 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Bulk actions bar */}
      {onBulkApproval && sorted.length > 1 && (
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {allApproved ? 'All entries approved' : `${pendingCount} pending approval`}
          </span>
          <button
            onClick={() => onBulkApproval(sorted.map((e) => e.id), !allApproved)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              allApproved
                ? 'text-yellow-700 bg-yellow-100 hover:bg-yellow-200'
                : 'text-green-700 bg-green-100 hover:bg-green-200'
            }`}
          >
            {allApproved ? 'Unapprove All' : 'Approve All'}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Day</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Start</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Lunch Out</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Lunch In</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">End</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Break</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Hours</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Approved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((entry) => {
              const codeConfig = CODE_LABELS[entry.code] || { label: entry.code, bg: 'bg-gray-100', text: 'text-gray-700' };
              const dayOfWeek = DAYS[new Date(entry.work_date + 'T00:00:00').getDay() === 0 ? 6 : new Date(entry.work_date + 'T00:00:00').getDay() - 1];

              return (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{entry.work_date}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{dayOfWeek}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{entry.location}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${codeConfig.bg} ${codeConfig.text}`}>
                      {codeConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTime(entry.start_time)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTime(entry.lunch_out)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTime(entry.lunch_in)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTime(entry.end_time)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{entry.unpaid_break_minutes > 0 ? `${entry.unpaid_break_minutes}m` : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">
                    {entry.hours_worked != null ? parseFloat(entry.hours_worked).toFixed(2) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate" title={entry.notes || ''}>
                    {entry.notes || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onToggleApproval && onToggleApproval(entry.id, !entry.approved)}
                      className="inline-flex items-center justify-center"
                      title={entry.approved ? 'Click to unapprove' : 'Click to approve'}
                    >
                      {entry.approved ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400 hover:text-green-600 transition-colors" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Summary row */}
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={9} className="px-4 py-3 text-sm font-semibold text-gray-700">
                Weekly Total &middot; PTO: {ptoDays} &middot; Sick: {sickDays} &middot; WFH: {wfhDays}
              </td>
              <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                {totalHours.toFixed(2)}h
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
