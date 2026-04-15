// src/pages/components/time-attendance/WeekPickerCalendar.jsx
// Calendar popup for picking a week. Clicking any date selects that week (Mon–Fri).

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getFederalHolidays, getHolidayLabel } from '../../../lib/federalHolidays';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return toLocalDateStr(date);
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  // Fill in days from previous month to start on Monday
  const startDow = firstDay.getDay(); // Sun=0
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, currentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true });
  }

  // Fill remaining to complete full weeks only (don't force 6 rows)
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
    days.push({ date: d, currentMonth: false });
  }

  return days;
}

export default function WeekPickerCalendar({ weekStart, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const wsDate = new Date(weekStart + 'T00:00:00');
  const [viewYear, setViewYear] = useState(wsDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(wsDate.getMonth());

  useEffect(() => {
    const d = new Date(weekStart + 'T00:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [weekStart]);

  // Compute holidays for the viewed year (plus neighbors for edge months)
  const holidays = useMemo(() => {
    const set = new Set();
    for (const y of [viewYear, viewYear - 1, viewYear + 1]) {
      for (const d of getFederalHolidays(y)) set.add(d);
    }
    return set;
  }, [viewYear]);

  // Position popup below trigger button on open
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopupStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
      transform: 'translateX(-50%)',
      zIndex: 9999,
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Keyboard handling
  const handleKeyDown = useCallback((e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
      else setViewMonth(m => m - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
      else setViewMonth(m => m + 1);
    }
  }, [open, viewMonth]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    const now = new Date();
    const atCurrentMonth =
      viewYear === now.getFullYear() && viewMonth === now.getMonth();
    if (atCurrentMonth) return; // already at current month — don't go forward
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  const today = toLocalDateStr(new Date());

  function handleDayClick(date) {
    const ds = toLocalDateStr(date);
    // Block future dates — cannot log attendance for dates that haven't happened
    if (ds > today) return;
    const monday = toMonday(date);
    onChange(monday);
    setOpen(false);
  }

  const days = getCalendarDays(viewYear, viewMonth);
  const isCurrentMonth =
    viewYear === new Date().getFullYear() && viewMonth === new Date().getMonth();
  const selectedMonday = weekStart;
  const selectedFriday = (() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 4);
    return toLocalDateStr(d);
  })();

  function isInSelectedWeek(date) {
    const ds = toLocalDateStr(date);
    return ds >= selectedMonday && ds <= selectedFriday;
  }

  const popup = open ? (
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Pick a week"
      style={{ ...popupStyle, background: 'var(--qs-card)', width: 300, borderRadius: 12, border: '1px solid var(--qs-border)', padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
    >
      {/* Month/Year header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} aria-label="Previous month" className="p-1 rounded hover:bg-qs-card text-qs-dim">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-qs-bright" aria-live="polite">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className={`p-1 rounded text-qs-dim ${
            isCurrentMonth
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-qs-card'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1" role="row">
        {DAY_HEADERS.map(d => (
          <div key={d} role="columnheader" className="text-center text-xs font-medium text-qs-muted py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7" role="grid">
        {days.map(({ date, currentMonth }, i) => {
          const ds = toLocalDateStr(date);
          const isToday = ds === today;
          const inWeek = isInSelectedWeek(date);
          const isMonday = date.getDay() === 1 && inWeek;
          const isFriday = date.getDay() === 5 && inWeek;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const isFuture = ds > today;
          const isHoliday = holidays.has(ds);
          const holidayLabel = isHoliday ? getHolidayLabel(ds) : null;

          return (
            <button
              key={i}
              onClick={() => handleDayClick(date)}
              disabled={isFuture}
              tabIndex={open ? 0 : -1}
              aria-pressed={inWeek}
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${isHoliday ? ` (${holidayLabel})` : ''}${inWeek ? ' (selected week)' : ''}${isFuture ? ' (unavailable)' : ''}`}
              className={`
                py-1.5 text-xs text-center transition-colors relative
                ${isFuture
                  ? 'text-qs-muted opacity-30 cursor-not-allowed'
                  : !currentMonth ? 'text-qs-muted'
                  : isWeekend ? 'text-qs-muted'
                  : 'text-qs-text'
                }
                ${inWeek && !isFuture ? 'bg-primary-900/20 text-primary-300 font-semibold' : ''}
                ${!isFuture ? 'hover:bg-qs-card' : ''}
                ${isMonday ? 'rounded-l-lg' : ''}
                ${isFriday ? 'rounded-r-lg' : ''}
                ${isToday && !inWeek ? 'font-bold text-primary-400' : ''}
                ${isHoliday && !inWeek && !isFuture ? 'text-blue-400 font-medium' : ''}
                ${isHoliday && inWeek && !isFuture ? 'text-blue-300' : ''}
              `}
            >
              {date.getDate()}
              {isToday && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />
              )}
              {isHoliday && !isToday && (
                <span
                  title={holidayLabel}
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500"
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-qs-muted text-center">
        Click any day to jump to that week &middot; Arrow keys change month &middot; Esc to close
      </p>
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-qs-muted">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block" /> Today
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Holiday
        </span>
      </div>

      <div className="mt-2 pt-3 border-t border-qs-border flex justify-between">
        <button
          onClick={() => { onChange(toMonday(new Date())); setOpen(false); }}
          className="text-xs text-primary-400 hover:text-primary-300 font-medium"
        >
          This Week
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-qs-subtle hover:text-qs-text font-medium">
          Close
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-qs-bright bg-qs-card border border-qs-border rounded-lg hover:bg-qs-elevated hover:border-primary-400 transition-colors min-w-[220px] justify-center"
      >
        <Calendar className="w-4 h-4 text-primary-400" />
        {label}
      </button>
      {createPortal(popup, document.body)}
    </>
  );
}
