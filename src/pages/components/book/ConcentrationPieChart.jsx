// src/pages/components/book/ConcentrationPieChart.jsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useChartTheme } from '../../../lib/chartTheme';

const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#A855F7',
];

export default function ConcentrationPieChart({ data }) {
  const { structural } = useChartTheme();

  if (!data || data.length === 0) {
    return (
      <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--qs-subtle)' }}>
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={60} outerRadius={100} paddingAngle={2}
          dataKey="value"
          label={(entry) => entry.share >= 5 ? `${entry.share.toFixed(0)}%` : ''}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: structural.tooltipBg,
            border: `1px solid ${structural.tooltipBorder}`,
            borderRadius: 8,
            color: structural.tooltipText,
          }}
          formatter={(value, name, props) => [
            `$${value.toLocaleString()} (${props.payload.share.toFixed(1)}%)`,
            name,
          ]}
        />
        <Legend
          verticalAlign="bottom" height={36}
          formatter={(value) => (
            <span style={{ color: structural.tooltipText, fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
