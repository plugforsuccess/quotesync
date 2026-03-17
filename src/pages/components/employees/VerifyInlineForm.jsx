// src/pages/components/employees/VerifyInlineForm.jsx
// Small inline form for marking an employee as verified.

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

export default function VerifyInlineForm({ onVerify, saving }) {
  const [notes, setNotes] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onVerify(notes || null);
    setNotes('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-1">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)..."
        className="flex-1 px-2 py-1.5 text-xs text-qs-text bg-qs-elevated border border-qs-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      />
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
      >
        <CheckCircle className="w-3.5 h-3.5" />
        {saving ? 'Saving...' : 'Mark Verified'}
      </button>
    </form>
  );
}
