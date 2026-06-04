// Width wrapper for queue screens.
//
// A single place to control the reading measure of a list of cards so other
// queue screens (renewals, service follow-ups) can adopt a consistent width.
// Choose a `size`:
//   - 'reading' (default) — narrow centered column (~768px), tightest line length
//   - 'wide'              — roomier centered column (~1024px)
//   - 'full'              — full content width; let inner blocks cap their own
//                           line length (e.g. the script) for readability
//
// Page chrome (the top nav, stat tiles, tab toggles) lives outside this. rem-
// based Tailwind sizing keeps the layout intact at browser/OS zoom up to 200%.
const MAX = {
  reading: 'max-w-3xl',
  wide:    'max-w-5xl',
  full:    'max-w-none',
};

export default function ReadingColumn({ children, size = 'reading', className = '', style }) {
  const max = MAX[size] || MAX.reading;
  return (
    <div className={`mx-auto w-full ${max} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
