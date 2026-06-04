// Centered, max-width reading column for queue screens.
//
// Constrains a list of cards to a comfortable single column (~768px / max-w-3xl)
// so line length stays readable and related data groups by proximity instead of
// scattering to opposite viewport edges. Built for the retention/cancellation
// queue (older agents, larger text, higher contrast) but intentionally generic
// so other queue screens — renewals, service follow-ups — can adopt the same
// reading measure.
//
// Page chrome (headers, stat tiles, tab toggles) can stay full-width above this;
// wrap only the card list. rem-based Tailwind sizing keeps the layout intact at
// browser/OS zoom up to 200%.
export default function ReadingColumn({ children, className = '', style }) {
  return (
    <div className={`mx-auto w-full max-w-3xl ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
