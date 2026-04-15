// src/lib/chartTheme.js
// Theme-aware color values for Recharts components.
// Recharts renders SVG — CSS variables don't work in SVG attributes.
// This hook returns resolved hex values for the current theme.

import { useTheme } from '../contexts/ThemeContext';

// ── Structural colors (grid, axes, tooltips) ──────────────────
const STRUCTURAL = {
  dark: {
    grid:            '#1E2130',
    axisTick:        '#475569',
    axisLine:        '#252A3A',
    tooltipBg:       '#1A1D27',
    tooltipBorder:   '#252A3A',
    tooltipText:     '#E2E8F0',
    tooltipLabel:    '#94A3B8',
    tooltipItem:     '#E2E8F0',
    cursor:          'rgba(255,255,255,0.04)',
    referenceLine:   '#334155',
  },
  light: {
    grid:            '#E2E8F0',
    axisTick:        '#94A3B8',
    axisLine:        '#E2E8F0',
    tooltipBg:       '#FFFFFF',
    tooltipBorder:   '#E2E8F0',
    tooltipText:     '#1E293B',
    tooltipLabel:    '#64748B',
    tooltipItem:     '#1E293B',
    cursor:          'rgba(0,0,0,0.04)',
    referenceLine:   '#CBD5E1',
  },
  high_contrast: {
    grid:            '#1E3A5F',
    axisTick:        '#60A5FA',
    axisLine:        '#1E3A5F',
    tooltipBg:       '#0C0F1A',
    tooltipBorder:   '#1E3A5F',
    tooltipText:     '#E0EEFF',
    tooltipLabel:    '#60A5FA',
    tooltipItem:     '#E0EEFF',
    cursor:          'rgba(96,165,250,0.08)',
    referenceLine:   '#1E3A5F',
  },
};

// ── Data colors — semantic, consistent across themes ──────────
// Accent colors are unchanged. Light mode gets slightly deeper
// saturation on some to maintain contrast on white backgrounds.
const DATA = {
  dark: {
    blue:   '#3B82F6',
    green:  '#10B981',
    amber:  '#F59E0B',
    red:    '#EF4444',
    purple: '#8B5CF6',
    cyan:   '#06B6D4',
    orange: '#F97316',
    pink:   '#EC4899',
    slate:  '#64748B',
    teal:   '#34D399',
  },
  light: {
    blue:   '#2563EB',  // deeper for contrast on white
    green:  '#059669',  // deeper for contrast on white
    amber:  '#D97706',  // deeper for contrast on white
    red:    '#DC2626',  // deeper for contrast on white
    purple: '#7C3AED',
    cyan:   '#0891B2',
    orange: '#EA580C',
    pink:   '#DB2777',
    slate:  '#475569',
    teal:   '#10B981',
  },
  high_contrast: {
    blue:   '#60A5FA',  // lighter for max contrast on deep black
    green:  '#34D399',
    amber:  '#FCD34D',  // brighter for max contrast
    red:    '#F87171',
    purple: '#A78BFA',
    cyan:   '#67E8F9',
    orange: '#FB923C',
    pink:   '#F472B6',
    slate:  '#93C5FD',
    teal:   '#6EE7B7',
  },
};

// ── Status badge colors for retention analytics ───────────────
// bg values need to work on theme card backgrounds
const STATUS_COLORS = {
  dark: {
    saved:    { bg: '#064E3B', fg: '#34D399' },
    lost:     { bg: '#7F1D1D', fg: '#FCA5A5' },
    default:  { bg: '#1E293B', fg: null }, // fg varies per status
  },
  light: {
    saved:    { bg: '#DCFCE7', fg: '#059669' },
    lost:     { bg: '#FEE2E2', fg: '#DC2626' },
    default:  { bg: '#F1F5F9', fg: null },
  },
  high_contrast: {
    saved:    { bg: 'rgba(52,211,153,0.15)', fg: '#34D399' },
    lost:     { bg: 'rgba(248,113,113,0.15)', fg: '#F87171' },
    default:  { bg: '#0C0F1A', fg: null },
  },
};

// ── Hook ──────────────────────────────────────────────────────
export function useChartTheme() {
  const { theme } = useTheme();
  const t = theme === 'high_contrast' ? 'high_contrast'
          : theme === 'light'         ? 'light'
          : 'dark';

  return {
    structural: STRUCTURAL[t],
    data:       DATA[t],
    status:     STATUS_COLORS[t],
    theme:      t,

    // Convenience: pre-built Tooltip contentStyle object
    tooltipStyle: {
      background:   STRUCTURAL[t].tooltipBg,
      border:       `1px solid ${STRUCTURAL[t].tooltipBorder}`,
      borderRadius: 8,
      fontSize:     12,
      color:        STRUCTURAL[t].tooltipText,
    },
    tooltipLabelStyle: { color: STRUCTURAL[t].tooltipLabel },
    tooltipItemStyle:  { color: STRUCTURAL[t].tooltipItem  },
    tooltipCursor:     { fill: STRUCTURAL[t].cursor },
  };
}
