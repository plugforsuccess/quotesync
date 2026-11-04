// src/pages/components/dd/DDFigures.jsx
// Illustrations for the Defensive Driving course, drawn in SVG so they're sharp at any
// size, follow the course's light/dark theme (colors are the .ddc CSS variables), and
// animate with CSS (index.css, "ddc-fig"), which stops for readers who ask for reduced
// motion. Each one teaches a single idea from the lesson it sits in. Facts in them come
// from the lesson text itself (src/data/ddCourseContent.js).
import {
  Check, X as XIcon, Hand, CloudRain, Car as CarIcon, Bike, PersonStanding,
  Disc3, CircleGauge, Lightbulb, Droplets, Coffee, Clock, Wind,
  Smartphone, ShieldCheck, ShieldAlert, CloudLightning, Gauge, Users, Bed, BadgeDollarSign,
} from 'lucide-react';

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

// ── Reusable parts ────────────────────────────────────────────────────────────

const TONES = {
  good: { c: 'var(--ok-c)', bg: 'var(--ok-bg)', bd: 'var(--ok-bd)' },
  bad: { c: 'var(--no-c)', bg: 'var(--no-bg)', bd: 'var(--no-bd)' },
  warn: { c: 'var(--warn-c)', bg: 'var(--warn-bg)', bd: 'var(--warn-bd)' },
  info: { c: 'var(--law-c)', bg: 'var(--law-bg)', bd: 'var(--law-bd)' },
};

/** Side-by-side cards: a title, an icon, and short lines, popping in one after another. */
function Cards({ cards, big = false }) {
  return (
    <div className={`grid gap-2.5 ${cards.length >= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {cards.map((card, i) => {
        const t = TONES[card.tone || 'info'];
        const Icon = card.icon;
        return (
          <div key={card.title} className="ddc-fig-pop rounded-lg p-3" style={{ animationDelay: `${i * 0.35}s`, background: t.bg, border: `1px solid ${t.bd}` }}>
            <p className="flex items-center gap-1.5 font-bold ddc-sm" style={{ color: t.c }}>
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}{card.title}
            </p>
            {card.value && <p className={`mt-1 font-black ddc-heading ${big ? 'ddc-h2' : 'ddc-lg'}`}>{card.value}</p>}
            {card.items && (
              <ul className="mt-1.5 space-y-1">
                {card.items.map(it => (
                  <li key={it} className="flex gap-1.5 ddc-xs ddc-text leading-snug">
                    {card.tone === 'bad' ? <XIcon className="mt-0.5 h-3 w-3 shrink-0" style={{ color: t.c }} aria-hidden="true" />
                      : <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: t.c }} aria-hidden="true" />}
                    {it}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bars that grow in turn; each row has a label, a share of the full width, and a value. */
function Bars({ rows, label, marker, barW = 250 }) {
  return (
    <svg viewBox={`0 0 320 ${rows.length * 40 + (marker ? 34 : 10)}`} role="img" aria-label={label}>
      {rows.map(([name, share, value, color], i) => (
        <g key={name} transform={`translate(0 ${10 + i * 40})`}>
          <Label x={10} y={12} anchor="start" size={11}>{name}</Label>
          <rect x="10" y="18" width={barW} height="13" rx="6.5" fill={C.road} />
          <rect className="ddc-fig-grow" style={{ animationDelay: `${i * 0.25}s` }} x="10" y="18" width={Math.max(6, share * barW)} height="13" rx="6.5" fill={color || C.blue} />
          <Label x={310} y={29} anchor="end" size={12} weight={800} color={C.ink}>{value}</Label>
        </g>
      ))}
      {marker && <Label x={160} y={rows.length * 40 + 28} size={12} weight={800} color={C.red}>{marker}</Label>}
    </svg>
  );
}

// ── Custom drawings ───────────────────────────────────────────────────────────

// Points add up toward the 15-point suspension line.
function PointsMeter() {
  const parts = [[6, 'Aggressive', C.red], [4, 'Reckless', C.amber], [3, 'Speeding', C.blue]];
  let at = 0;
  const unit = 280 / 15;
  return (
    <svg viewBox="0 0 320 130" role="img" aria-label="Six points for aggressive driving, four for reckless and three for speeding add up to 13; 15 points in 24 months suspends a Georgia license">
      <rect x="20" y="40" width="280" height="24" rx="5" fill={C.road} />
      {parts.map(([n, name, color], i) => {
        const x = 20 + at * unit; at += n;
        return (
          <g key={name}>
            <rect className="ddc-fig-grow" style={{ animationDelay: `${i * 0.6}s` }} x={x} y="40" width={n * unit - 2} height="24" rx="4" fill={color} />
            <Label x={x + (n * unit) / 2} y={57} size={12} weight={800} color="#fff">{`+${n}`}</Label>
            <Label x={x + (n * unit) / 2} y={84} size={9} color={C.muted}>{name}</Label>
          </g>
        );
      })}
      <line x1="300" y1="30" x2="300" y2="72" stroke={C.red} strokeWidth="3" />
      <Label x={300} y={22} size={11} weight={800} color={C.red}>15</Label>
      <Label x={160} y={114} size={12} weight={800} color={C.ink}>13 points so far. Two more in 24 months: suspended.</Label>
    </svg>
  );
}

// Aim far ahead; check mirrors often.
function VisionScan() {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label="Look 12 to 15 seconds ahead and check your mirrors every 5 to 8 seconds">
      <path d="M130 160 L150 10 L170 10 L190 160 Z" fill={C.road} />
      <line x1="160" y1="150" x2="160" y2="18" stroke={C.line} strokeWidth="2" strokeDasharray="8 8" />
      <g className="ddc-fig-sweep" style={{ transformOrigin: '160px 140px' }}>
        <path d="M160 140 L132 20 L188 20 Z" fill={C.go} opacity=".22" />
      </g>
      <Car x={151} y={128} w={18} h={30} />
      <Label x={250} y={34} size={11} weight={700} color={C.ink}>Look 12–15</Label>
      <Label x={250} y={48} size={11} weight={700} color={C.ink}>seconds ahead</Label>
      <Label x={70} y={140} size={11} weight={700} color={C.ink}>Mirrors every</Label>
      <Label x={70} y={154} size={11} weight={700} color={C.ink}>5–8 seconds</Label>
    </svg>
  );
}

// Scan left, right, left before entering an intersection.
function Intersection() {
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="At an intersection, cover the brake and scan left, right, then left again">
      <rect x="120" y="0" width="80" height="180" fill={C.road} />
      <rect x="0" y="60" width="320" height="60" fill={C.road} />
      <Car x={146} y={128} w={28} h={18} />
      <path className="ddc-fig-look1" d="M160 124 L60 90" stroke={C.go} strokeWidth="4" strokeLinecap="round" />
      <path className="ddc-fig-look2" d="M160 124 L260 90" stroke={C.go} strokeWidth="4" strokeLinecap="round" />
      <path className="ddc-fig-look3" d="M160 124 L60 90" stroke={C.go} strokeWidth="4" strokeLinecap="round" />
      <Label x={50} y={78} size={13} weight={800} color={C.ink}>1 · Left</Label>
      <Label x={270} y={78} size={13} weight={800} color={C.ink}>2 · Right</Label>
      <Label x={60} y={146} size={13} weight={800} color={C.ink}>3 · Left again</Label>
    </svg>
  );
}

// Lap belt low on the hips, shoulder belt across the chest.
function SeatBelt() {
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="Wear the lap belt low across your hips and the shoulder belt across your chest and collarbone">
      <rect x="110" y="20" width="100" height="150" rx="18" fill={C.road} />
      <circle cx="160" cy="44" r="18" fill={C.muted} />
      <rect x="132" y="66" width="56" height="64" rx="14" fill={C.muted} />
      <rect x="132" y="126" width="56" height="34" rx="8" fill={C.muted} />
      <line className="ddc-fig-draw" x1="186" y1="68" x2="134" y2="128" stroke={C.go} strokeWidth="8" strokeLinecap="round" />
      <line className="ddc-fig-draw" style={{ animationDelay: '.6s' }} x1="128" y1="134" x2="192" y2="134" stroke={C.go} strokeWidth="8" strokeLinecap="round" />
      <Label x={250} y={84} size={11} weight={700} color={C.ink}>Shoulder belt:</Label>
      <Label x={250} y={98} size={11} color={C.text}>across the chest</Label>
      <Label x={60} y={130} size={11} weight={700} color={C.ink}>Lap belt:</Label>
      <Label x={60} y={144} size={11} color={C.text}>low on the hips</Label>
    </svg>
  );
}

// School bus stopped with red lights and the stop arm out.
function SchoolBus() {
  return (
    <svg viewBox="0 0 320 160" role="img" aria-label="When a school bus shows red flashing lights and its stop arm, stop and stay stopped until it moves on">
      <rect x="0" y="80" width="320" height="56" fill={C.road} />
      <rect x="150" y="52" width="130" height="62" rx="8" fill={C.amber} />
      {[0, 1, 2, 3].map(i => <rect key={i} x={170 + i * 26} y="62" width="18" height="16" rx="2" fill={C.card} opacity=".85" />)}
      <circle className="ddc-fig-blink" cx="158" cy="60" r="5" fill={C.red} />
      <circle className="ddc-fig-blink-b" cx="272" cy="60" r="5" fill={C.red} />
      <g className="ddc-fig-arm" style={{ transformOrigin: '150px 86px' }}>
        <line x1="150" y1="86" x2="128" y2="86" stroke={C.ink} strokeWidth="3" />
        <polygon points="104,76 114,66 128,66 138,76 138,90 128,100 114,100 104,90" fill={C.red} />
        <Label x={121} y={87} size={8} weight={800} color="#fff">STOP</Label>
      </g>
      <Car x={30} y={100} />
      <Label x={47} y={150} size={11} weight={800} color={C.ink}>stopped</Label>
      <Label x={160} y={30} size={12} weight={800} color={C.ink}>Red lights + stop arm: stay stopped</Label>
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
  chain: () => <Steps label="Better knowledge leads to a better attitude, better behavior, fewer crashes and lower insurance costs" steps={['Knowledge', 'Attitude', 'Behavior', 'Fewer crashes', 'Lower costs']} />,
  control: () => <Cards cards={[
    { title: 'You control', tone: 'good', icon: ShieldCheck, items: ['Your preparation', 'Your attention', 'Your response'] },
    { title: 'You can’t control', tone: 'bad', icon: ShieldAlert, items: ['Other drivers', 'The road', 'The weather'] },
  ]} />,
  points: () => <Bars label="Points in Georgia: aggressive driving 6, reckless driving 4, speeding 19 to 23 over 3, failing to obey a traffic-control device 3. Fifteen in 24 months suspends your license."
    rows={[['Aggressive driving', 6 / 15, '6', C.red], ['Reckless driving', 4 / 15, '4', C.amber], ['Speeding 19–23 over', 3 / 15, '3', C.blue], ['Ignoring a traffic device', 3 / 15, '3', C.blue]]}
    marker="15 points in 24 months = suspension" />,
  pointsmeter: PointsMeter,
  vision: VisionScan,
  fatigue: () => <Cards cards={[
    { title: 'Warning signs', tone: 'warn', icon: Bed, items: ['Yawning', 'Heavy eyelids', 'Drifting', 'Missing exits'] },
    { title: 'What works', tone: 'good', icon: Clock, items: ['Enough sleep', 'Real breaks', 'Share the driving', 'Pull over and nap'] },
    { title: 'Doesn’t work', tone: 'bad', icon: XIcon, items: ['Loud music', 'An open window', 'Caffeine instead of sleep'] },
  ]} />,
  roadrage: () => <Steps label="If a driver is aggressive: don't make eye contact, don't respond, create space, let them go" steps={['No eye contact', 'Don’t respond', 'Make space', 'Let them go']} />,
  soberup: () => <Cards cards={[
    { title: 'Doesn’t lower BAC', tone: 'bad', icon: Coffee, items: ['Coffee', 'A cold shower', 'Fresh air', 'Exercise'] },
    { title: 'Lowers BAC', tone: 'good', icon: Clock, value: 'Only time' },
  ]} />,
  medlabel: () => <Cards cards={[
    { title: 'On the label', tone: 'warn', icon: ShieldAlert, items: ['“May cause drowsiness”', '“Do not operate heavy machinery”'] },
    { title: 'Means', tone: 'bad', icon: CarIcon, value: 'Don’t drive' },
  ]} />,
  soberplan: () => <Steps label="Decide before you go out: a sober driver, a rideshare or transit, or staying over" steps={['Sober driver', 'Rideshare or transit', 'Stay over', 'Take the keys']} />,
  superspeeder: () => <Cards big cards={[
    { title: 'Anywhere', tone: 'warn', icon: Gauge, value: '85+ mph' },
    { title: 'Two-lane road', tone: 'warn', icon: Gauge, value: '75+ mph' },
    { title: 'Super Speeder fee', tone: 'bad', icon: BadgeDollarSign, value: '+$200' },
  ]} />,
  intersection: Intersection,
  seatbelt: SeatBelt,
  vulnerable: () => <Cards cards={[
    { title: 'Pedestrians', tone: 'info', icon: PersonStanding, items: ['Yield at crosswalks', 'Slow near schools and stops'] },
    { title: 'Cyclists', tone: 'info', icon: Bike, items: ['Treat as vehicles', 'Pass with a safe buffer'] },
    { title: 'Motorcyclists', tone: 'info', icon: Bike, items: ['Give a full lane', 'Double-check blind spots'] },
  ]} />,
  schoolbus: SchoolBus,
  maintenance: () => <Cards cards={[
    { title: 'Tires', tone: 'good', icon: Disc3, items: ['Pressure', 'Tread'] },
    { title: 'Brakes', tone: 'good', icon: CircleGauge, items: ['Noise, pulling or a soft pedal: fix now'] },
    { title: 'Lights, wipers, fluids', tone: 'good', icon: Lightbulb, items: ['See, be seen, signal'] },
  ]} />,
  skidblowout: () => <Cards cards={[
    { title: 'Skid', tone: 'warn', icon: Droplets, items: ['Ease off the gas', 'Steer where you want to go', 'Don’t slam the brakes'] },
    { title: 'Tire blowout', tone: 'warn', icon: Wind, items: ['Grip the wheel', 'Don’t brake hard', 'Ease off, hold straight, slow down'] },
  ]} />,
  handsfree: () => <Cards cards={[
    { title: 'Allowed', tone: 'good', icon: Smartphone, items: ['Phone in a mount', 'Voice or a single touch'] },
    { title: 'Not allowed', tone: 'bad', icon: Hand, items: ['Holding the phone', 'Texts or email', 'Watching or recording video'] },
  ]} />,
  impliedconsent: () => <Steps label="Lawfully arrested for DUI, you are asked to take a chemical test; refusing brings its own automatic license suspension" steps={['DUI arrest', 'Asked to test', 'Refuse: license suspended']} />,
  reasonable: () => <Cards cards={[
    { title: 'Clear and dry', tone: 'good', icon: CarIcon, value: 'Up to the limit' },
    { title: 'Rain, fog, traffic', tone: 'warn', icon: CloudRain, value: 'Slower than the limit' },
  ]} />,
  premium: () => <Bars barW={190} label="What raises your rate: a ticket, more for an at-fault crash, and a DUI most of all"
    rows={[['Speeding ticket', 0.33, 'raises it', C.blue], ['At-fault crash', 0.62, 'raises it more', C.amber], ['DUI', 1, 'raises it most', C.red]]} />,
  minimums: () => <Cards big cards={[
    { title: 'Injury, per person', tone: 'info', icon: Users, value: '$25,000' },
    { title: 'Injury, per accident', tone: 'info', icon: Users, value: '$50,000' },
    { title: 'Property damage', tone: 'info', icon: CarIcon, value: '$25,000' },
  ]} />,
  coverages: () => <Cards cards={[
    { title: 'Collision', tone: 'info', icon: CarIcon, items: ['Your car after a crash, whoever is at fault'] },
    { title: 'Comprehensive', tone: 'info', icon: CloudLightning, items: ['Theft, hail, flood, fire, trees, deer'] },
    { title: 'Uninsured motorist', tone: 'good', icon: ShieldCheck, items: ['Pays you when the other driver can’t'] },
  ]} />,
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
