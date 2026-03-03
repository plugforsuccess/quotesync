// src/pages/components/time-attendance/TrendsView.jsx
// 8-week performance trend charts using Recharts LineChart.

import { TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { calculateGrade, computeMetrics, GRADE_CONFIG, DEFAULT_TARGETS } from '../../../config/csPerformanceDefaults';

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TrendChart({ title, data, dataKey, targetValue, targetLabel, unit, domain, band }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h5 className="text-sm font-semibold text-gray-900 mb-3">{title}</h5>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={domain || ['auto', 'auto']} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value) => [`${typeof value === 'number' ? value.toFixed(1) : value}${unit || ''}`, title]}
            labelStyle={{ fontWeight: 600 }}
          />
          {band ? (
            <>
              <ReferenceLine y={band[0]} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `${band[0]}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
              <ReferenceLine y={band[1]} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `${band[1]}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
            </>
          ) : targetValue != null ? (
            <ReferenceLine y={targetValue} stroke="#ef4444" strokeDasharray="4 4" label={{ value: targetLabel || `${targetValue}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
          ) : null}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ fill: '#2563eb', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TrendsView({ trendData, targets }) {
  if (!trendData || trendData.length < 2) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Trend data requires at least 2 weeks of uploaded RingCentral reports.</p>
        <p className="text-sm text-gray-400 mt-1">Keep uploading weekly and trends will appear here.</p>
      </div>
    );
  }

  const t = { ...DEFAULT_TARGETS, ...targets };

  // Build chart data
  const chartData = trendData.map((rc) => {
    const metrics = computeMetrics(rc, 5);
    const grade = calculateGrade(rc.outbound_calls, metrics.answerRate, metrics.hasZeroCallDays, t);

    return {
      label: formatWeekLabel(rc.week_start),
      weekStart: rc.week_start,
      outbound: rc.outbound_calls || 0,
      answerRate: parseFloat(metrics.answerRate.toFixed(1)),
      avgHandle: parseFloat((rc.avg_handle_time_minutes || 0).toFixed(1)),
      gradeNumeric: GRADE_CONFIG[grade]?.numeric || 0,
      grade,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">8-Week Trends</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendChart
          title="Outbound Calls"
          data={chartData}
          dataKey="outbound"
          targetValue={t.outbound_calls_weekly}
          targetLabel={`${t.outbound_calls_weekly}/wk`}
          domain={[0, 'auto']}
        />
        <TrendChart
          title="Answer Rate %"
          data={chartData}
          dataKey="answerRate"
          targetValue={t.answer_rate_pct}
          targetLabel={`${t.answer_rate_pct}%`}
          unit="%"
          domain={[0, 100]}
        />
        <TrendChart
          title="Avg Handle Time (min)"
          data={chartData}
          dataKey="avgHandle"
          band={[t.avg_handle_time_min_low, t.avg_handle_time_min_high]}
          unit=" min"
        />
        <TrendChart
          title="Weekly Grade"
          data={chartData}
          dataKey="gradeNumeric"
          targetValue={4}
          targetLabel="B-line"
          domain={[0, 5]}
        />
      </div>
    </div>
  );
}
