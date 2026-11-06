// src/pages/CompScheduleAdminPage.jsx
import { T } from '../components/SiteCopy';
import { useState, Fragment } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useAllSchedules,
  useDeleteSchedule,
  getScheduleStatus,
} from '../hooks/useCompSchedules';
import ScheduleFormModal from './components/comp-schedule/ScheduleFormModal';
import ScheduleRateEditor from './components/comp-schedule/ScheduleRateEditor';
import PageSpinner from '../components/PageSpinner';

// Style constants — see "Component patterns" section of this spec.
const btnPrimary = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 16px', background: 'var(--qs-info)',
  color: 'white', fontSize: 14, fontWeight: 500,
  borderRadius: 8, border: 'none', cursor: 'pointer',
};

export default function CompScheduleAdminPage() {
  const { currentAgencyId } = useAuth();
  const { data: schedules, isLoading } = useAllSchedules(currentAgencyId);
  const deleteSchedule = useDeleteSchedule();

  const [editingSchedule, setEditingSchedule] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [expandedScheduleId, setExpandedScheduleId] = useState(null);

  if (isLoading) return <PageSpinner />;

  const scheduleList = schedules ?? [];

  const handleDelete = async (schedule) => {
    const confirmed = window.confirm(
      `Delete "${schedule.schedule_label}"? This will permanently remove the schedule and ` +
      `all its commission rates. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteSchedule.mutateAsync(schedule.id);
    } catch (err) {
      window.alert(`Delete failed: ${err.message ?? err}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 24,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>
            <T k="pages.compscheduleadminpage.49bdf9">Compensation Schedules</T>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--qs-subtle)', marginTop: 4 }}>
            <T k="pages.compscheduleadminpage.93df23">Manage carrier commission schedules by state and effective period.</T>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingNew(true)}
          style={btnPrimary}
        >
          <Plus size={16} />
          <T k="pages.compscheduleadminpage.d1b9a8">Add Schedule</T>
        </button>
      </div>

      <ScheduleListTable
        schedules={scheduleList}
        expandedId={expandedScheduleId}
        onToggleExpanded={(id) =>
          setExpandedScheduleId(prev => (prev === id ? null : id))
        }
        onEdit={(s) => setEditingSchedule(s)}
        onDelete={handleDelete}
      />

      {creatingNew && (
        <ScheduleFormModal
          mode="create"
          existingSchedules={scheduleList}
          onClose={() => setCreatingNew(false)}
        />
      )}
      {editingSchedule && (
        <ScheduleFormModal
          mode="edit"
          schedule={editingSchedule}
          existingSchedules={scheduleList}
          onClose={() => setEditingSchedule(null)}
        />
      )}
    </div>
  );
}

function ScheduleListTable({ schedules, expandedId, onToggleExpanded, onEdit, onDelete }) {
  if (schedules.length === 0) {
    return (
      <div className="rounded border border-[var(--qs-border)] bg-[var(--qs-card)] p-8 text-center">
        <p className="text-[var(--qs-subtle)]">
          <T k="pages.compscheduleadminpage.422fc2">No schedules yet. Add your first schedule to begin modeling commission changes.</T>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-[var(--qs-border)] bg-[var(--qs-card)] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[var(--qs-elevated)] text-[var(--qs-subtle)] text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.25f734">Schedule</T></th>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.914419">Carrier</T></th>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.46a2a4">State</T></th>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.619622">Effective From</T></th>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.c45fda">Effective To</T></th>
            <th className="px-4 py-3 text-left"><T k="pages.compscheduleadminpage.ec53a8">Status</T></th>
            <th className="px-4 py-3 text-right"><T k="pages.compscheduleadminpage.06df33">Actions</T></th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const status = getScheduleStatus(s);
            const isExpanded = expandedId === s.id;
            return (
              <Fragment key={s.id}>
                <tr
                  className="border-t border-[var(--qs-border)] hover:bg-[var(--qs-elevated)] cursor-pointer"
                  onClick={() => onToggleExpanded(s.id)}
                >
                  <td className="px-4 py-3 font-medium text-[var(--qs-text)]">
                    {s.schedule_label}
                  </td>
                  <td className="px-4 py-3 text-[var(--qs-text)]">{s.carrier_name}</td>
                  <td className="px-4 py-3 text-[var(--qs-text)]">{s.state_code}</td>
                  <td className="px-4 py-3 text-[var(--qs-text)]">{formatDate(s.effective_from)}</td>
                  <td className="px-4 py-3 text-[var(--qs-text)]">
                    {s.effective_to ? formatDate(s.effective_to) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-1 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${status.colorToken} 15%, transparent)`,
                        color: status.colorToken,
                      }}
                    >
                      <T>{status.label}</T>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                      className="text-[var(--qs-info)] hover:opacity-80 mr-3"
                      aria-label="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                      className="text-[var(--qs-danger)] hover:opacity-80"
                      aria-label="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-4 bg-[var(--qs-dark)] border-t border-[var(--qs-border)]"
                    >
                      <ScheduleRateEditor scheduleId={s.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}
