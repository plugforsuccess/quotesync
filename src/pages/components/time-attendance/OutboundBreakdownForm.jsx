// src/pages/components/time-attendance/OutboundBreakdownForm.jsx
// Manual outbound call categorization form + stacked bar chart.

import { useState, useEffect, useMemo } from 'react';
import { PhoneOutgoing, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { OUTBOUND_CATEGORIES } from '../../../config/csPerformanceDefaults';

export default function OutboundBreakdownForm({
  breakdownData,
  totalOutbound,
  onSave,
  saving,
  orgId,
  employeeId,
  weekStart,
}) {
  const [form, setForm] = useState({
    renewal: 0,
    cross_sell: 0,
    billing: 0,
    save_attempt: 0,
    winback: 0,
    other: 0,
  });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (breakdownData) {
      setForm({
        renewal: breakdownData.renewal || 0,
        cross_sell: breakdownData.cross_sell || 0,
        billing: breakdownData.billing || 0,
        save_attempt: breakdownData.save_attempt || 0,
        winback: breakdownData.winback || 0,
        other: breakdownData.other || 0,
      });
    }
  }, [breakdownData]);

  const formTotal = useMemo(() =>
    Object.values(form).reduce((s, v) => s + (parseInt(v, 10) || 0), 0),
    [form]
  );

  const chartData = useMemo(() =>
    OUTBOUND_CATEGORIES.map((cat) => ({
      name: cat.label,
      value: form[cat.key] || 0,
      color: cat.color,
    })).filter((d) => d.value > 0),
    [form]
  );

  // Top category
  const topCategory = useMemo(() => {
    let max = 0;
    let top = null;
    for (const cat of OUTBOUND_CATEGORIES) {
      if ((form[cat.key] || 0) > max) {
        max = form[cat.key];
        top = cat;
      }
    }
    if (!top || max === 0) return null;
    const pct = formTotal > 0 ? ((max / formTotal) * 100).toFixed(0) : 0;
    return { label: top.label, count: max, pct };
  }, [form, formTotal]);

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: Math.max(0, parseInt(value, 10) || 0) }));
  }

  function handleSave() {
    onSave({
      org_id: orgId,
      employee_user_id: employeeId,
      week_start: weekStart,
      ...form,
    });
    setEditing(false);
  }

  const hasData = formTotal > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <PhoneOutgoing className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Outbound Call Breakdown
        </h4>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {OUTBOUND_CATEGORIES.map((cat) => (
                <div key={cat.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: cat.color }} />
                    {cat.label}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form[cat.key]}
                    onChange={(e) => handleChange(cat.key, e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <p className={`text-sm ${formTotal !== totalOutbound ? 'text-yellow-600' : 'text-gray-600'}`}>
                Sum: {formTotal} / {totalOutbound || '?'} total outbound
                {formTotal !== totalOutbound && totalOutbound > 0 && ' (mismatch)'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : hasData ? (
          <div className="space-y-3">
            {/* Stacked bar chart */}
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={[{ name: 'Outbound', ...form }]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  formatter={(value, name) => {
                    const cat = OUTBOUND_CATEGORIES.find((c) => c.key === name);
                    return [value, cat?.label || name];
                  }}
                />
                {OUTBOUND_CATEGORIES.map((cat) => (
                  <Bar key={cat.key} dataKey={cat.key} stackId="a" fill={cat.color} radius={0} />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Legend + top category */}
            <div className="flex flex-wrap gap-3 text-xs">
              {OUTBOUND_CATEGORIES.map((cat) => (
                form[cat.key] > 0 && (
                  <span key={cat.key} className="inline-flex items-center gap-1 text-gray-600">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.label}: {form[cat.key]}
                  </span>
                )
              ))}
            </div>

            {topCategory && (
              <p className="text-sm text-gray-600">
                Top category: <span className="font-medium text-gray-900">{topCategory.label}</span> ({topCategory.pct}%)
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No outbound breakdown recorded. Click "Edit" to categorize outbound calls.
          </p>
        )}
      </div>
    </div>
  );
}
