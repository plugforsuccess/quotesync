// Shared chip/flag styles for the retention desk.
//
// Color discipline: red (--qs-danger) is reserved for "must act today" —
// lapsed, ≤3 days to cancel, a renewal inside its 14-day save window, an
// overdue pay promise, an overdue callback. Everything informational (bundle,
// renewing, autopay, monoline, AI spoke, callbacks…) reads as a neutral chip
// so the one red thing on screen is the thing to act on. Gold (--qs-success)
// marks a completed/positive state; the platform has no green text.
//
// All values are theme tokens so chips repaint correctly in light mode.

export const NEUTRAL_CHIP = {
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  color: 'var(--qs-dim)',
};

export const DANGER_CHIP = {
  background: 'var(--qs-danger-subtle)',
  border: '1px solid var(--qs-danger-border)',
  color: 'var(--qs-danger)',
};

export const SUCCESS_CHIP = {
  background: 'var(--qs-success-subtle)',
  border: '1px solid var(--qs-success-border)',
  color: 'var(--qs-success)',
};
