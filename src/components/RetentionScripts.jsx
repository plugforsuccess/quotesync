// src/components/RetentionScripts.jsx
// Shared call + voicemail scripts for retention surfaces (the queue list and the
// case work surface), so the same words appear wherever a rep works a case.
// Builders are pure (easy to copy/test); the *Box components render them.
import { productLabel } from '../lib/productLabels';

// Voicemail — names the product line (low sensitivity) but no premium/coverage
// detail, since a voicemail can be overheard. Warm reason to call back.
export function voicemailText({ firstName, agentName, product }) {
  const policy = product ? `your ${productLabel(product).toLowerCase()} policy` : 'your policy';
  return `Hi ${firstName}, this is ${agentName} with your Allstate agency. `
    + `I was reviewing ${policy} and wanted to connect with you personally. `
    + `When you get a moment, give our office a quick call back — we want to make sure `
    + `you're getting everything you should be. Thanks, talk soon!`;
}

// A spoken-friendly date: "2026-06-16" → "June 16th". Date-only strings are
// parsed as local time to avoid a timezone off-by-one.
function spokenDate(d) {
  if (!d) return 'soon';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const day = date.getDate();
  const j = day % 10, k = day % 100;
  const ord = (j === 1 && k !== 11) ? 'st' : (j === 2 && k !== 12) ? 'nd' : (j === 3 && k !== 13) ? 'rd' : 'th';
  return `${month} ${day}${ord}`;
}

// Live-answer renewal script. Introduces the agent, names the product + a
// spoken date, and leads with value. rateShock surfaces the increase up front.
export function renewalCallScript({ firstName, agentName = 'your agent', product, renewalDate, rateShock, changePct }) {
  const line = productLabel(product).toLowerCase();
  const when = spokenDate(renewalDate);
  const pct = Math.abs(Number(changePct) || 0);
  const intro = `Hi ${firstName}, this is ${agentName} with your Allstate agency.`;
  return rateShock
    ? `"${intro} I'm reaching out ahead of your ${line} policy renewal on ${when}. I noticed the premium is going up about ${pct.toFixed(0)}%, so I'd like to review it together and look at a few options to keep your rate as low as we can."`
    : `"${intro} I'm calling ahead of your ${line} policy renewal on ${when} — I want to make sure your coverage still fits and answer any questions before it renews."`;
}

export function CallScriptBox({ label = 'Call script', children }) {
  return (
    <div style={{
      background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
      borderRadius: 6, padding: '7px 10px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#60A5FA',
        textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

export function VoicemailScriptBox({ firstName, agentName, product }) {
  const text = voicemailText({ firstName, agentName, product });
  return (
    <div style={{
      background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 6, padding: '7px 10px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: '#F59E0B',
        textTransform: 'uppercase', marginBottom: 4 }}>
        📞 Voicemail — if no answer (read aloud)
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', fontStyle: 'italic', lineHeight: 1.5 }}>
        "{text}"
      </div>
    </div>
  );
}
