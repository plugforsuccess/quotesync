// src/pages/ConsentManagementPage.jsx
// View and manage customer consent records across the book.

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Search, Plus, X, CheckCircle, XCircle,
  Download, Edit2, Shield,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCustomerConsent } from '../hooks/useCustomerConsent';
import { useActiveEmployees } from '../hooks/useEmployees';

// ── Constants ───────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: 'inbound_call', label: 'Inbound Call' },
  { value: 'email', label: 'Email' },
  { value: 'service_interaction', label: 'Service Interaction' },
  { value: 'manual', label: 'Manual' },
  { value: 'funnel', label: 'Funnel' },
];

const OPT_OUT_CHANNEL_OPTIONS = [
  { value: 'verbal', label: 'Verbal' },
  { value: 'email', label: 'Email' },
  { value: 'manual', label: 'Manual' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getEmployeeName(employees, id) {
  if (!id || !Array.isArray(employees)) return '—';
  const emp = employees.find((e) => e.id === id);
  if (!emp) return '—';
  return `${emp.preferred_name || emp.first_name} ${emp.last_name}`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ConsentManagementPage() {
  const { currentAgencyId } = useAuth();
  const { data: consents, isLoading, upsertConsent, isUpserting, deleteConsent } = useCustomerConsent(currentAgencyId);
  const { data: employees = [] } = useActiveEmployees(currentAgencyId);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  // Filter
  const filtered = useMemo(() => {
    if (!Array.isArray(consents)) return [];
    if (!search) return consents;
    const term = search.toLowerCase();
    return consents.filter((c) =>
      (c.customer_name || '').toLowerCase().includes(term) ||
      (c.customer_phone || '').includes(term)
    );
  }, [consents, search]);

  // Export CSV
  const handleExport = () => {
    if (!Array.isArray(filtered) || filtered.length === 0) return;
    const headers = ['Customer Name', 'Phone', 'Auto-dial Consent', 'Consent Date', 'Source'];
    const rows = filtered.map((c) => [
      c.customer_name || '',
      c.customer_phone || '',
      c.autodial_consent ? 'Yes' : 'No',
      c.autodial_consent_date ? new Date(c.autodial_consent_date).toLocaleDateString() : '',
      c.autodial_consent_source || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'consent_records.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link to="/admin/renewals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to Renewals
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-gray-600" />
          Consent Management
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => { setEditRecord(null); setShowModal(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Consent Record
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by phone or customer name..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading consent records...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No consent records found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auto-dial</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collected By</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{c.customer_phone}</td>
                  <td className="px-4 py-3">
                    {c.autodial_consent ? (
                      <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle className="w-4 h-4" /> Yes</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-400"><XCircle className="w-4 h-4" /> No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(c.autodial_consent_date)}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{c.autodial_consent_source?.replace('_', ' ') || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{getEmployeeName(employees, c.consent_collected_by)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditRecord(c); setShowModal(true); }}
                      className="p-1 text-gray-400 hover:text-primary-600 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <ConsentModal
          record={editRecord}
          agencyId={currentAgencyId}
          employees={employees}
          onSave={async (data) => {
            await upsertConsent(data);
            setShowModal(false);
            setEditRecord(null);
          }}
          isSaving={isUpserting}
          onClose={() => { setShowModal(false); setEditRecord(null); }}
        />
      )}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

function ConsentModal({ record, agencyId, employees, onSave, isSaving, onClose }) {
  const [phone, setPhone] = useState(record?.customer_phone || '');
  const [name, setName] = useState(record?.customer_name || '');
  const [policyNumbers, setPolicyNumbers] = useState(
    Array.isArray(record?.policy_numbers) ? record.policy_numbers.join(', ') : ''
  );
  const [autodialConsent, setAutodialConsent] = useState(record?.autodial_consent ?? false);
  const [source, setSource] = useState(record?.autodial_consent_source || '');
  const [optOutChannel, setOptOutChannel] = useState(record?.autodial_opt_out_channel || '');
  const [collectedBy, setCollectedBy] = useState(record?.consent_collected_by || '');
  const [notes, setNotes] = useState(record?.consent_notes || '');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    setError(null);

    const policyArr = policyNumbers
      ? policyNumbers.split(',').map((p) => p.trim()).filter(Boolean)
      : null;

    try {
      await onSave({
        agency_id: agencyId,
        customer_phone: phone.trim(),
        customer_name: name.trim() || null,
        policy_numbers: policyArr,
        autodial_consent: autodialConsent,
        autodial_consent_source: autodialConsent ? source || null : null,
        autodial_opt_out_channel: !autodialConsent ? optOutChannel || null : null,
        consent_collected_by: collectedBy || null,
        consent_notes: notes || null,
      });
    } catch (err) {
      setError(err.message || 'Failed to save consent.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {record ? 'Edit Consent Record' : 'Add Consent Record'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="(555) 123-4567"
              disabled={!!record}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Numbers (comma separated)</label>
            <input
              type="text"
              value={policyNumbers}
              onChange={(e) => setPolicyNumbers(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="POL-001, POL-002"
            />
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autodialConsent}
                onChange={(e) => setAutodialConsent(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">Auto-dial consent granted</span>
            </label>
          </div>

          {autodialConsent ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consent Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select source...</option>
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opt-out Channel</label>
              <select
                value={optOutChannel}
                onChange={(e) => setOptOutChannel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select channel...</option>
                {OPT_OUT_CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Collected By</label>
            <select
              value={collectedBy}
              onChange={(e) => setCollectedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select employee...</option>
              {Array.isArray(employees) && employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.preferred_name || emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : record ? 'Update' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
