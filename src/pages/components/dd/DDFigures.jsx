// src/pages/components/dd/DDFigures.jsx
// Illustrations for the Defensive Driving course, drawn in SVG so they're sharp at any
// size, follow the course's light/dark theme (colors are the .ddc CSS variables), and
// animate with CSS (index.css, "ddc-fig"), which stops for readers who ask for reduced
// motion. Each one teaches a single idea from the lesson it sits in.

const C = {
  ink: 'var(--ddc-heading)',
  text: 'var(--ddc-text)',
  muted: 'var(--ddc-muted)',
  road: 'var(--ddc-surface-2)',
  line: 'var(--ddc-border)',
  go: 'var(--ddc-accent-solid)',
  blue: 'var(--law-c)',
  amber: 'var(--warn-c)',
  red: 'var(--no-c)',
  card: 'var(--ddc-surface)',
};

// A car seen from above, pointing right. `x`,`y` is its top-left corner.
function Car({ x, y, color = C.blue, className, w = 34, h = 16 }) {
  return (
    <g className={className} transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="4" fill={color} />
      <rect x={w * 0.55} y="2.5" width={w * 0.22} height={h - 5} rx="2" fill={C.card} opacity=".85" />
      <rect x={w * 0.12} y="2.5" width={w * 0.16} height={h - 5} rx="2" fill={C.card} opacity=".6" />
    </g>
  );
}

const Label = ({ x, y, children, anchor = 'middle', size = 11, weight = 600, color = C.text }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={color} fontFamily="inherit">{children}</text>
);

// ── M1: SIPDE, a loop you run continuously ─────────────────────────────────────
function Sipde() {
  const steps = [['S', 'Search'], ['I', 'Identify'], ['P', 'Predict'], ['D', 'Decide'], ['E', 'Execute']];
  const cx = 160, cy = 92, r = 62;
  return (
    <svg viewBox="0 0 320 190" role="img" aria-label="The SIPDE loop: Search, Identify, Predict, Decide, Execute, then back to Search">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth="3" strokeDasharray="4 6" />
      <g className="ddc-fig-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy - r} r="7" fill={C.go} />
      </g>
      {steps.map(([k, word], i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / steps.length;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        const lx = cx + (r + 48) * Math.cos(a), ly = cy + (r + 30) * Math.sin(a) + 4;
        return (
          <g key={k}>
            <circle cx={x} cy={y} r="15" fill={C.blue} />
            <Label x={x} y={y + 5} size={14} weight={800} color="#fff">{k}</Label>
            <Label x={lx} y={ly} size={11}>{word}</Label>
          </g>
        );
      })}
      <Label x={cx} y={cy + 4} size={11} color={C.muted}>every few seconds</Label>
    </svg>
  );
}

// ── M2: eyes off the road for 5 seconds at 55 mph ─────────────────────────────
function Distraction() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="At 55 miles per hour, 5 seconds with your eyes off the road covers about the length of a football field">
      <rect x="10" y="48" width="300" height="46" rx="6" fill={C.road} />
      {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={30 + i * 52} y1="48" x2={30 + i * 52} y2="94" stroke={C.line} strokeWidth="1.5" />)}
      <line x1="14" y1="71" x2="306" y2="71" stroke={C.line} strokeWidth="2" strokeDasharray="10 8" />
      <Car x={14} y={63} className="ddc-fig-cross" />
      <Label x={30} y={40} anchor="start" size={11} color={C.muted}>Eyes on the phone…</Label>
      <Label x={290} y={40} anchor="end" size={11} color={C.muted}>…5 seconds later</Label>
      <Label x={160} y={118} size={13} weight={800} color={C.ink}>≈ 100 yards at 55 mph, driving blind</Label>
      <Label x={160} y={136} size={11} color={C.muted}>about the length of a football field</Label>
    </svg>
  );
}

// ── M3: Georgia's BAC limits ──────────────────────────────────────────────────
function Bac() {
  const rows = [['Under 21', '0.02', 0.02, C.red], ['Commercial driver', '0.04', 0.04, C.amber], ['21 and older', '0.08', 0.08, C.blue]];
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="Georgia blood alcohol limits: 0.02 under 21, 0.04 for commercial drivers, 0.08 for drivers 21 and older">
      {rows.map(([who, v, n, color], i) => (
        <g key={who} transform={`translate(0 ${16 + i * 42})`}>
          <Label x={10} y={14} anchor="start" size={11}>{who}</Label>
          <rect x="10" y="20" width="250" height="14" rx="7" fill={C.road} />
          <rect className="ddc-fig-grow" style={{ animationDelay: `${i * 0.25}s` }} x="10" y="20" width={(n / 0.08) * 250} height="14" rx="7" fill={color} />
          <Label x={300} y={32} anchor="end" size={14} weight={800} color={C.ink}>{v}</Label>
        </g>
      ))}
    </svg>
  );
}

// ── M4: the 3-second following rule ───────────────────────────────────────────
function Following() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="Three-second rule: when the car ahead passes a fixed point, count three seconds before you reach it">
      <rect x="0" y="52" width="320" height="44" fill={C.road} />
      <line x1="0" y1="74" x2="320" y2="74" stroke={C.line} strokeWidth="2" strokeDasharray="10 8" />
      <line x1="200" y1="30" x2="200" y2="52" stroke={C.ink} strokeWidth="3" />
      <rect x="186" y="16" width="28" height="16" rx="3" fill={C.go} />
      <Label x={200} y={110} size={11} color={C.muted}>fixed point</Label>
      <Car x={0} y={66} color={C.muted} className="ddc-fig-lead" />
      <Car x={0} y={66} className="ddc-fig-follow" />
      <g className="ddc-fig-count">
        <Label x={160} y={138} size={14} weight={800} color={C.ink}>one-one-thousand · two · three</Label>
      </g>
    </svg>
  );
}

// ── M4: stopping distance = reaction + braking ────────────────────────────────
function Stopping() {
  return (
    <svg viewBox="0 0 320 130" role="img" aria-label="Total stopping distance is the distance you travel while reacting plus the distance it takes to brake">
      <rect className="ddc-fig-grow" x="10" y="40" width="110" height="22" rx="4" fill={C.amber} />
      <rect className="ddc-fig-grow" style={{ animationDelay: '.5s' }} x="120" y="40" width="190" height="22" rx="4" fill={C.blue} />
      <Label x={65} y={32} size={11}>Reacting</Label>
      <Label x={215} y={32} size={11}>Braking</Label>
      <Label x={65} y={84} size={10} color={C.muted}>you haven’t touched</Label>
      <Label x={65} y={97} size={10} color={C.muted}>the brake yet</Label>
      <Label x={215} y={84} size={10} color={C.muted}>grows much faster</Label>
      <Label x={215} y={97} size={10} color={C.muted}>than your speed</Label>
      <Label x={160} y={122} size={12} weight={800} color={C.ink}>Total stopping distance</Label>
    </svg>
  );
}

// ── M5: a truck's no-zones ────────────────────────────────────────────────────
function TruckZones() {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label="A large truck's blind spots: directly in front, directly behind, and along both sides, largest on the right">
      <rect x="0" y="20" width="320" height="130" fill={C.road} />
      <rect className="ddc-fig-pulse" x="214" y="62" width="60" height="46" rx="4" fill={C.red} opacity=".35" />
      <rect className="ddc-fig-pulse" x="10" y="62" width="44" height="46" rx="4" fill={C.red} opacity=".35" />
      <rect className="ddc-fig-pulse" x="96" y="26" width="90" height="34" rx="4" fill={C.red} opacity=".35" />
      <rect className="ddc-fig-pulse" x="80" y="110" width="130" height="36" rx="4" fill={C.red} opacity=".35" />
      <rect x="58" y="66" width="120" height="38" rx="3" fill={C.muted} />
      <rect x="180" y="68" width="30" height="34" rx="5" fill={C.ink} />
      <Label x={244} y={56} size={10} weight={700} color={C.ink}>front</Label>
      <Label x={32} y={56} size={10} weight={700} color={C.ink}>rear</Label>
      <Label x={141} y={20} size={10} weight={700} color={C.ink}>left side</Label>
      <Label x={145} y={162} size={10} weight={700} color={C.ink}>right side (largest)</Label>
    </svg>
  );
}

// ── M6: wet roads ─────────────────────────────────────────────────────────────
function Wet() {
  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="On wet pavement your stopping distance can be about twice as long as on dry pavement">
      <Label x={10} y={22} anchor="start" size={11}>Dry road</Label>
      <rect className="ddc-fig-grow" x="10" y="28" width="140" height="18" rx="4" fill={C.blue} />
      <Label x={10} y={70} anchor="start" size={11}>Wet road</Label>
      <rect className="ddc-fig-grow" style={{ animationDelay: '.4s' }} x="10" y="76" width="280" height="18" rx="4" fill={C.amber} />
      <Label x={300} y={112} anchor="end" size={12} weight={800} color={C.ink}>can be about twice as far</Label>
    </svg>
  );
}

// ── M7: Georgia's Move Over law ───────────────────────────────────────────────
function MoveOver() {
  return (
    <svg viewBox="0 0 320 160" role="img" aria-label="Move Over law: when an emergency or maintenance vehicle is stopped with lights flashing, move over a lane if you safely can, or slow down below the limit">
      <rect x="0" y="30" width="320" height="96" fill={C.road} />
      <line x1="0" y1="78" x2="320" y2="78" stroke={C.line} strokeWidth="2" strokeDasharray="10 8" />
      <rect x="0" y="126" width="320" height="18" fill={C.card} />
      <g transform="translate(206 128)">
        <rect width="40" height="14" rx="3" fill={C.ink} />
        <rect className="ddc-fig-blink" x="14" y="-4" width="5" height="5" fill={C.red} />
        <rect className="ddc-fig-blink-b" x="21" y="-4" width="5" height="5" fill={C.blue} />
      </g>
      <Car x={0} y={98} className="ddc-fig-moveover" />
      <Label x={160} y={22} size={12} weight={800} color={C.ink}>Move over a lane, or slow down</Label>
      <Label x={226} y={156} size={10} color={C.muted}>stopped, lights flashing</Label>
    </svg>
  );
}

// ── M6 / M8: steps, highlighted one after another ─────────────────────────────
function Steps({ steps, label }) {
  const w = 300 / steps.length;
  return (
    <svg viewBox="0 0 320 120" role="img" aria-label={label}>
      <line x1={10 + w / 2} y1="42" x2={10 + w * (steps.length - 0.5)} y2="42" stroke={C.line} strokeWidth="3" />
      {steps.map((s, i) => (
        <g key={s}>
          <circle cx={10 + w * (i + 0.5)} cy="42" r="15" fill={C.road} stroke={C.line} strokeWidth="2" />
          <circle className="ddc-fig-step" style={{ animationDelay: `${i * 0.9}s`, animationDuration: `${steps.length * 0.9}s` }}
            cx={10 + w * (i + 0.5)} cy="42" r="15" fill={C.go} />
          <Label x={10 + w * (i + 0.5)} y={47} size={13} weight={800} color={C.ink}>{i + 1}</Label>
          {s.split(' ').reduce((lines, word) => {
            const last = lines[lines.length - 1];
            if (last && (last + ' ' + word).length <= 10) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word);
            return lines;
          }, []).map((ln, j) => <Label key={j} x={10 + w * (i + 0.5)} y={78 + j * 13} size={10}>{ln}</Label>)}
        </g>
      ))}
    </svg>
  );
}

const FIGURES = {
  sipde: Sipde,
  distraction: Distraction,
  bac: Bac,
  following: Following,
  stopping: Stopping,
  truckzones: TruckZones,
  wet: Wet,
  moveover: MoveOver,
  crashsteps: () => <Steps label="After a crash: stop, check for injuries and call 911, make the scene safe, exchange information, document, report" steps={['Stop', 'Call 911 if hurt', 'Make it safe', 'Swap info', 'Take photos', 'Report it']} />,
  claimsteps: () => <Steps label="Making a claim: report it, the adjuster reviews, get estimates, repair, then settle" steps={['Report it', 'Adjuster reviews', 'Get estimate', 'Repair', 'Settle']} />,
};

/** A course figure by name, with its caption. */
export default function DDFigure({ name, caption }) {
  const Fig = FIGURES[name];
  if (!Fig) return null;
  return (
    <figure className="ddc-fig rounded-xl border ddc-bd ddc-card p-4">
      <div className="mx-auto max-w-md"><Fig /></div>
      {caption && <figcaption className="mt-2 text-center ddc-sm ddc-muted">{caption}</figcaption>}
    </figure>
  );
}

/** A lesson video: a YouTube id, or a self-hosted file (`src`). */
export function DDVideo({ youtube, src, caption, title = 'Lesson video' }) {
  return (
    <figure className="rounded-xl border ddc-bd ddc-card overflow-hidden">
      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
        {youtube
          ? <iframe className="absolute inset-0 h-full w-full" src={`https://www.youtube.com/embed/${encodeURIComponent(youtube)}?rel=0`} title={title}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
          : <video className="absolute inset-0 h-full w-full" src={src} controls playsInline preload="metadata" />}
      </div>
      {caption && <figcaption className="px-4 py-3 ddc-sm ddc-muted">{caption}</figcaption>}
    </figure>
  );
}
