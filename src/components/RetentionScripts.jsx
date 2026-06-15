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

// Live-answer renewal script. rateShock surfaces the increase up front.
export function renewalCallScript({ firstName, product, renewalDate, rateShock, changePct }) {
  const lead = `your ${productLabel(product).toLowerCase()} renewal on ${renewalDate}`;
  const pct = Number(changePct) || 0;
  return rateShock
    ? `"Hi ${firstName} — calling about ${lead}. Your premium is going up ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%. Want to review options and make sure you're getting the best rate."`
    : `"Hi ${firstName} — calling about ${lead}. Just making sure everything still looks good and answering any questions."`;
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
