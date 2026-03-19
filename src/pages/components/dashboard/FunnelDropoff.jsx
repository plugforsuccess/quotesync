// src/pages/components/dashboard/FunnelDropoff.jsx
// Funnel step drop-off visualization with worst-step callout

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { AlertTriangle } from 'lucide-react';

const STEP_COLORS = [
  '#3b82f6', '#3b82f6', '#2563eb', '#2563eb', '#1d4ed8',
  '#1e40af', '#1e3a8a', '#059669', '#047857', '#22c55e',
];

const STEP_RECOMMENDATIONS = {
  'ZIP Code': 'Consider broadening your target ZIPs or improving ad landing page relevance.',
  'Own/Rent': 'The own/rent question may feel intrusive early. Consider rewording or adding context about why it matters.',
  'Product Intent': 'Too many options can paralyze. Consider reducing choices or adding a "Not sure" option.',
  'Carrier': 'Consider simplifying the carrier options or adding a "Skip" option for users unsure of their carrier.',
  'Risk Screening': 'The driving record / claims question may scare users. Add reassurance that incidents won\'t disqualify them.',
  'Vehicle Count': 'This step has a low drop-off usually. If elevated, check for mobile UI issues.',
  'Marital Status': 'Users may find this question too personal. Add context about why it affects insurance rates.',
  'Date of Birth': 'Ensure the date picker is mobile-friendly. Consider allowing manual text entry.',
  'Address': 'Address autocomplete may have issues. Test on mobile and slow connections.',
  'Contact Info': 'Users are abandoning at the final step. Consider reducing required fields or adding trust signals.',
};

function CustomBarLabel({ x, y, width, value, index, data }) {
  if (index == null || !data || !data[index]) return null;
  const step = data[index];
  const dropText = index > 0 && step.dropOffPercent > 0
    ? ` (${Math.round(step.dropOffPercent)}% drop)`
    : '';
  return (
    <text x={x + width + 8} y={y + 14} fill="var(--qs-text)" fontSize={12} fontWeight={500}>
      {step.count.toLocaleString()}{dropText}
    </text>
  );
}

export default function FunnelDropoff({ funnel }) {
  if (!funnel || !funnel.steps) return null;

  const { steps, worstStep } = funnel;
  const maxCount = Math.max(...steps.map(s => s.count), 1);

  // Chart data for horizontal bars
  const chartData = steps.map(s => ({
    name: s.name,
    count: s.count,
    dropOffPercent: Math.round(s.dropOffPercent * 10) / 10,
  }));

  return (
    <div className="dark-card">
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--qs-bright)' }}>Funnel Step Drop-off</h2>

      <div className="overflow-x-auto">
        <div style={{ minWidth: '600px' }}>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 120, left: 100, bottom: 0 }}
            >
              <XAxis type="number" domain={[0, maxCount]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={95}
                tick={{ fontSize: 12, fill: 'var(--qs-text)' }}
              />
              <Tooltip
                formatter={(value, name, props) => {
                  const drop = props.payload.dropOffPercent;
                  return [`${value.toLocaleString()} leads${drop > 0 ? ` (${drop}% drop)` : ''}`, 'Reached'];
                }}
                contentStyle={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.dropOffPercent > 15 ? '#ef4444' : STEP_COLORS[index] || '#3b82f6'}
                    fillOpacity={entry.dropOffPercent > 15 ? 0.85 : 1}
                  />
                ))}
                <LabelList
                  content={(props) => <CustomBarLabel {...props} data={chartData} />}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Worst step callout */}
      {worstStep && worstStep.dropOffPercent > 5 && (
        <div
          className="mt-4 p-4 rounded-lg border-l-4"
          style={worstStep.dropOffPercent > 15
            ? { borderColor: 'var(--qs-danger)', background: 'var(--qs-danger-subtle)' }
            : { borderColor: 'var(--qs-warning)', background: 'var(--qs-warning-subtle)' }
          }
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${worstStep.dropOffPercent > 15 ? 'text-red-500' : 'text-amber-500'}`} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--qs-bright)' }}>
                Your biggest drop-off is at <strong>{worstStep.name}</strong> ({Math.round(worstStep.dropOffPercent)}%).
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--qs-dim)' }}>
                {STEP_RECOMMENDATIONS[worstStep.name] || 'Review this step for usability issues.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
