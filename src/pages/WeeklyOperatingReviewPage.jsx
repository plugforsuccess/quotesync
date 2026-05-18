// src/pages/WeeklyOperatingReviewPage.jsx
// Weekly Operating Review — principal's Monday home.
// Three sections: Where We Stand, What Slipped, This Week's Focus.

import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toMonday, toPriorMonday, formatWeekLabel } from '../lib/weekUtils';

// Sub-section components
import WhereWeStandSection from './components/operating-review/WhereWeStandSection';
import WhatSlippedSection from './components/operating-review/WhatSlippedSection';
import ThisWeeksFocusSection from './components/operating-review/ThisWeeksFocusSection';
import MarkReviewedBar from './components/operating-review/MarkReviewedBar';

export default function WeeklyOperatingReviewPage() {
  const { currentAgencyId } = useAuth();

  // The "current week" the principal is reviewing.
  // Default: this week's Monday. Selectable via the week-picker.
  const [reviewWeekStart, setReviewWeekStart] = useState(() => toMonday(new Date()));
  const priorWeekStart = useMemo(() => toPriorMonday(reviewWeekStart), [reviewWeekStart]);

  if (!currentAgencyId) {
    return (
      <div style={{ padding: 24, color: 'var(--qs-subtle)' }}>
        Resolving agency context…
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 700,
              color: 'var(--qs-bright)', margin: 0,
            }}>
              Weekly Operating Review
            </h1>
            <p style={{
              fontSize: 14, color: 'var(--qs-subtle)',
              marginTop: 4, marginBottom: 0,
            }}>
              {formatWeekLabel(reviewWeekStart)} · A 15-minute Monday discipline
            </p>
          </div>

          <WeekPicker
            value={reviewWeekStart}
            onChange={setReviewWeekStart}
          />
        </div>
      </header>

      {/* Three primary sections — top to bottom in the order a principal reads them */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <WhereWeStandSection
          agencyId={currentAgencyId}
          reviewWeekStart={reviewWeekStart}
          priorWeekStart={priorWeekStart}
        />

        <WhatSlippedSection
          agencyId={currentAgencyId}
          reviewWeekStart={reviewWeekStart}
          priorWeekStart={priorWeekStart}
        />

        <ThisWeeksFocusSection
          agencyId={currentAgencyId}
          reviewWeekStart={reviewWeekStart}
        />
      </div>

      {/* Mark Reviewed bar (sticky at bottom) */}
      <MarkReviewedBar
        agencyId={currentAgencyId}
        reviewWeekStart={reviewWeekStart}
      />
    </div>
  );
}

// ── WeekPicker — simple "← Prior week / Current week →" navigation ─────────

function WeekPicker({ value, onChange }) {
  const thisWeek = toMonday(new Date());
  const isCurrentWeek = value === thisWeek;

  const goPrev = () => onChange(toPriorMonday(value));
  const goNext = () => {
    const next = new Date(value + 'T00:00:00');
    next.setDate(next.getDate() + 7);
    onChange(next.toLocaleDateString('en-CA'));
  };
  const goToday = () => onChange(thisWeek);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--qs-card)',
      border: '1px solid var(--qs-border)',
      borderRadius: 8,
      padding: 4,
    }}>
      <button
        type="button"
        onClick={goPrev}
        style={pickerBtnStyle}
        aria-label="Previous week"
      >
        ←
      </button>
      <button
        type="button"
        onClick={goToday}
        disabled={isCurrentWeek}
        style={{
          ...pickerBtnStyle,
          opacity: isCurrentWeek ? 0.4 : 1,
          fontWeight: 500,
        }}
      >
        Today
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={isCurrentWeek}
        style={{ ...pickerBtnStyle, opacity: isCurrentWeek ? 0.4 : 1 }}
        aria-label="Next week"
      >
        →
      </button>
    </div>
  );
}

const pickerBtnStyle = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--qs-text)',
  fontSize: 14,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};
