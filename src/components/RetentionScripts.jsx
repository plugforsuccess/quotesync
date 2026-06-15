// src/components/RetentionScripts.jsx
// Shared call + voicemail scripts for retention surfaces (the queue list and the
// case work surface), so the same words appear wherever a rep works a case.
// Builders are pure (easy to copy/test); the *Box components render them.
import { productLabel } from '../lib/productLabels';
import { titleCaseName } from '../lib/names';

// Voicemail — names the product line (low sensitivity) but no premium/coverage
// detail, since a voicemail can be overheard. Warm reason to call back.
export function voicemailText({ firstName, agentName, product }) {
  const policy = product ? `your ${productLabel(product).toLowerCase()} policy` : 'your policy';
  firstName = titleCaseName(firstName);
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
// spoken date, and leads with advocacy. For rate-shock cases it acknowledges
// "a change to your rate" WITHOUT volunteering the percentage — leading with the
// number frames the call as bad news and invites the customer to shop. The rep
// can quote the exact figure if asked; it's on the card.
export function renewalCallScript({ firstName, agentName = 'your agent', product, renewalDate, rateShock }) {
  firstName = titleCaseName(firstName);
  const line = productLabel(product).toLowerCase();
  const when = spokenDate(renewalDate);
  const intro = `Hi ${firstName}, this is ${agentName} with your Allstate agency.`;
  return rateShock
    ? `"${intro} I'm reaching out ahead of your ${line} renewal on ${when} — I like to review these personally before they go through. There's a change to your rate this year, and that's exactly why I wanted to call: let's go over your coverage together and make sure you're getting every discount you've earned."`
    : `"${intro} I'm calling ahead of your ${line} policy renewal on ${when} — I want to make sure your coverage still fits and answer any questions before it renews."`;
}

// Live-answer cancel/save script. Leads with the lapse/payment situation and a
// direct ask to resolve it today. Reads the balance aloud only on a live call
// (the voicemail stays balance-free).
export function cancelCallScript({ firstName, agentName = 'your agent', product, isLapsed, amountDue, effectiveDate }) {
  firstName = titleCaseName(firstName);
  const line = productLabel(product).toLowerCase();
  const when = spokenDate(effectiveDate);
  const amt = amountDue ? `$${Number(amountDue).toLocaleString()}` : null;
  const intro = `Hi ${firstName}, this is ${agentName} calling from your Allstate agency.`;
  if (isLapsed) {
    return `"${intro} Your ${line} policy lapsed on ${when}.${
      amt ? ` We can reinstate your coverage today — the amount due is ${amt}.` : ' I want to help you get your coverage reinstated.'
    } Are you in a position to take care of that today?"`;
  }
  return `"${intro} I'm calling about your ${line} policy.${
    amt ? ` We're showing a payment of ${amt} due by ${when}.` : ` Your payment is due by ${when}.`
  } I want to make sure you don't have a gap in coverage — can I help you take care of that today?"`;
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
