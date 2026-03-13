// src/pages/components/comp-model/EntriesDetailTable.jsx
// Collapsible detail table showing individual revenue entries for the selected month.

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function fmt(value) {
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// Mask customer PII — show first name + last initial only
function maskCustomerName(fullName) {
  if (!fullName) return '—';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'Homeowners', condo: 'Condo', renters: 'Renters',
  landlord: 'Landlord', specialty_auto: 'Specialty Auto', pup: 'Personal Umbrella',
  manufactured: 'Manufactured Home', boat: 'Boat Owners', motor_club: 'Motor Club', other: 'Other',
};

export default function EntriesDetailTable({ entries }) {
  const [expanded, setExpanded] = useState(false);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <FileText className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Entry Detail ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
        </h4>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Date</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Policy No</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Product</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Premium</th>
                <th className="text-right py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Items</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Customer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="py-2 px-4 text-gray-700 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="py-2 px-4 text-gray-700 font-mono text-xs whitespace-nowrap">{entry.policyNo || '—'}</td>
                  <td className="py-2 px-4 text-gray-700 whitespace-nowrap">{PRODUCT_LABELS[entry.product] || entry.product}</td>
                  <td className="py-2 px-4 text-right text-gray-700">{fmt(entry.premium)}</td>
                  <td className="py-2 px-4 text-right text-gray-700">{entry.itemCount}</td>
                  <td className="py-2 px-4 text-gray-500 whitespace-nowrap">{maskCustomerName(entry.customerName)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 bg-gray-50/50">
                <td colSpan={3} className="py-2 px-4 text-xs font-bold text-gray-700 uppercase">Total</td>
                <td className="py-2 px-4 text-right text-sm font-bold text-gray-900">
                  {fmt(entries.reduce((s, e) => s + e.premium, 0))}
                </td>
                <td className="py-2 px-4 text-right text-sm font-bold text-gray-900">
                  {entries.reduce((s, e) => s + e.itemCount, 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
