// src/pages/components/time-attendance/AgentAliasManager.jsx
// Admin panel for resolving unmatched agent names from call log uploads.
// Maps RC display names (aliases) to employees and optionally backfills past calls.

import { useState } from 'react';
import { UserX, Link2, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import {
  useAgentAliases,
  useUnmatchedAgents,
  useSaveAgentAlias,
  useDeleteAgentAlias,
  useBackfillAlias,
  useBackfillPreview,
  normalizeAliasKey,
} from '../../../hooks/useEmployees';

export default function AgentAliasManager({ orgId, employees }) {
  const { data: aliases = [], isLoading: aliasesLoading } = useAgentAliases(orgId);
  const { data: unmatchedAgents = [], isLoading: unmatchedLoading } = useUnmatchedAgents(orgId);
  const { mutate: saveAlias, isPending: saving } = useSaveAgentAlias();
  const { mutate: deleteAlias, isPending: deleting } = useDeleteAgentAlias();
  const { mutateAsync: previewBackfill } = useBackfillPreview();
  const { mutate: backfillAlias, isPending: backfilling } = useBackfillAlias();

  const [selectedMapping, setSelectedMapping] = useState({}); // { agentName: employeeUserId }
  const [backfillChecked, setBackfillChecked] = useState({}); // { agentName: boolean }
  const [feedback, setFeedback] = useState(null);

  // All employees are mappable — use auth_user_id if linked, else employees.id
  const mappableEmployees = (employees || []).map((e) => ({
    ...e,
    mappingId: e.auth_user_id || e.id,
  }));

  async function handleSaveAlias(agentName, nameKey) {
    const employeeUserId = selectedMapping[agentName];
    if (!employeeUserId) return;

    // Collision detection: check if this normalized key already maps to a different employee
    const existingAlias = aliases.find(
      (a) => a.alias_key === normalizeAliasKey(agentName)
    );
    if (existingAlias && existingAlias.employee_user_id !== employeeUserId) {
      const currentName = getEmployeeNameById(existingAlias.employee_user_id);
      const newName = getEmployeeNameById(employeeUserId);
      const confirmed = window.confirm(
        `"${agentName}" is currently mapped to ${currentName}. Replace with ${newName}?`
      );
      if (!confirmed) return;
    }

    // If backfill is checked, preview count and confirm
    if (backfillChecked[agentName]) {
      try {
        const backfillKey = nameKey || normalizeAliasKey(agentName);
        const { count } = await previewBackfill({ orgId, nameKey: backfillKey });
        if (count > 0) {
          const confirmed = window.confirm(
            `This will update up to ${count} unmatched call${count !== 1 ? 's' : ''} to ${getEmployeeNameById(employeeUserId)}. Continue?`
          );
          if (!confirmed) return;
        }
      } catch {
        // Preview failed — proceed without confirmation (backfill itself will validate)
      }
    }

    setFeedback(null);
    saveAlias(
      { orgId, aliasDisplay: agentName, employeeUserId },
      {
        onSuccess: () => {
          if (backfillChecked[agentName]) {
            const backfillKey = nameKey || normalizeAliasKey(agentName);
            backfillAlias(
              { orgId, nameKey: backfillKey, employeeUserId },
              {
                onSuccess: (result) => {
                  setFeedback({
                    type: 'success',
                    text: `Alias saved. ${result.updated} past call${result.updated !== 1 ? 's' : ''} updated.`,
                  });
                },
                onError: (err) => {
                  setFeedback({
                    type: 'warning',
                    text: `Alias saved, but backfill failed: ${err.message}`,
                  });
                },
              }
            );
          } else {
            setFeedback({ type: 'success', text: `Alias saved for "${agentName}".` });
          }
          setSelectedMapping((prev) => {
            const next = { ...prev };
            delete next[agentName];
            return next;
          });
        },
        onError: (err) => {
          setFeedback({ type: 'error', text: `Failed to save alias: ${err.message}` });
        },
      }
    );
  }

  function handleDeleteAlias(alias) {
    setFeedback(null);
    deleteAlias(
      { id: alias.id, orgId },
      {
        onSuccess: () => {
          setFeedback({ type: 'success', text: `Alias "${alias.alias_display}" removed.` });
        },
        onError: (err) => {
          setFeedback({ type: 'error', text: `Failed to remove alias: ${err.message}` });
        },
      }
    );
  }

  function getEmployeeLabel(emp) {
    return `${emp.preferred_name || emp.first_name} ${emp.last_name || ''}`.trim();
  }

  function getEmployeeNameById(userId) {
    const emp = mappableEmployees.find((e) => e.mappingId === userId);
    return emp ? getEmployeeLabel(emp) : userId?.substring(0, 8) || 'Unknown';
  }

  const hasUnmatched = unmatchedAgents.length > 0;
  const hasAliases = aliases.length > 0;

  if (!hasUnmatched && !hasAliases && !aliasesLoading && !unmatchedLoading) {
    return null; // Nothing to show
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <UserX className="w-6 h-6 text-yellow-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Agent Name Mapping</h3>
          <p className="text-sm text-gray-500">
            Resolve unmatched agent names from call log uploads. Aliases persist across future uploads.
          </p>
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 flex items-center gap-1.5 text-sm ${
          feedback.type === 'error' ? 'text-red-600' :
          feedback.type === 'warning' ? 'text-yellow-600' : 'text-green-600'
        }`}>
          {feedback.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
           feedback.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
           <CheckCircle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {/* Unmatched agents section */}
      {hasUnmatched && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Unmatched Agents ({unmatchedAgents.length})
          </h4>
          <div className="space-y-2">
            {unmatchedAgents.map(({ name, nameKey, count }) => (
              <div
                key={nameKey || name}
                className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500">{count} call{count !== 1 ? 's' : ''}</p>
                </div>
                <select
                  value={selectedMapping[name] || ''}
                  onChange={(e) => setSelectedMapping((prev) => ({ ...prev, [name]: e.target.value }))}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 max-w-[200px]"
                >
                  <option value="">Select employee...</option>
                  {mappableEmployees.map((emp) => (
                    <option key={emp.mappingId} value={emp.mappingId}>
                      {getEmployeeLabel(emp)}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={backfillChecked[name] || false}
                    onChange={(e) => setBackfillChecked((prev) => ({ ...prev, [name]: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Backfill
                </label>
                <button
                  onClick={() => handleSaveAlias(name, nameKey)}
                  disabled={!selectedMapping[name] || saving || backfilling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {saving || backfilling ? 'Saving...' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing aliases section */}
      {hasAliases && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Active Aliases ({aliases.length})
          </h4>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Alias</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Mapped To</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Source</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {aliases.map((alias) => (
                  <tr key={alias.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900 font-medium">{alias.alias_display}</td>
                    <td className="px-3 py-2 text-gray-700">{getEmployeeNameById(alias.employee_user_id)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        alias.source === 'manual' ? 'bg-primary-100 text-primary-700' :
                        alias.source === 'auto' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {alias.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteAlias(alias)}
                        disabled={deleting}
                        className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors disabled:opacity-50"
                        title="Remove alias"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
