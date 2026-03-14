// src/pages/components/time-attendance/WeekPickerCalendar.jsx
// Calendar popup for picking a week. Clicking any date selects that week (Mon–Fri).

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
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
  const ref = useRef(null);
  const triggerRef = useRef(null);

  // Calendar navigation state — start viewing the month of the current weekStart
  const wsDate = new Date(weekStart + 'T00:00:00');
  const [viewYear, setViewYear] = useState(wsDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(wsDate.getMonth());

  // Sync view when weekStart changes externally
  useEffect(() => {
    const d = new Date(weekStart + 'T00:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [weekStart]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Keyboard handling: Escape to close, arrow keys for month nav
  const handleKeyDown = useCallback((e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
      else setViewMonth((m) => m - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
      else setViewMonth((m) => m + 1);
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
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  function handleDayClick(date) {
    const monday = toMonday(date);
    onChange(monday);
    setOpen(false);
  }

  const days = getCalendarDays(viewYear, viewMonth);
  const today = toLocalDateStr(new Date());

  // Determine which week row is selected (Mon–Fri only)
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

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-primary-400 transition-colors min-w-[220px] justify-center"
      >
        <Calendar className="w-4 h-4 text-primary-600" />
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a week"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-xl shadow-md border border-gray-200 p-4 w-[300px]"
        >
          {/* Month/Year header */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900" aria-live="polite">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1" role="row">
            {DAY_HEADERS.map((d) => (
              <div key={d} role="columnheader" className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7" role="grid" aria-label="Calendar">
            {days.map(({ date, currentMonth }, i) => {
              const ds = toLocalDateStr(date);
              const isToday = ds === today;
              const inWeek = isInSelectedWeek(date);
              const isMonday = date.getDay() === 1 && inWeek;
              const isFriday = date.getDay() === 5 && inWeek;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(date)}
                  aria-label={`${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${inWeek ? ' (selected week)' : ''}`}
                  aria-pressed={inWeek}
                  tabIndex={open ? 0 : -1}
                  className={`
                    py-1.5 text-xs text-center transition-colors relative
                    ${!currentMonth ? 'text-gray-300' : isWeekend ? 'text-gray-400' : 'text-gray-700'}
                    ${inWeek ? 'bg-primary-100 text-primary-800 font-semibold' : 'hover:bg-gray-100'}
                    ${isMonday ? 'rounded-l-lg' : ''}
                    ${isFriday ? 'rounded-r-lg' : ''}
                    ${isToday && !inWeek ? 'font-bold text-primary-600' : ''}
                  `}
                >
                  {date.getDate()}
                  {isToday && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Hint */}
          <p className="mt-2 text-[10px] text-gray-400 text-center">
            Click any day to jump to that week &middot; Arrow keys change month &middot; Esc to close
          </p>

          {/* Quick actions */}
          <div className="mt-2 pt-3 border-t border-gray-100 flex justify-between">
            <button
              onClick={() => { onChange(toMonday(new Date())); setOpen(false); }}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              This Week
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
