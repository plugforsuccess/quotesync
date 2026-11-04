// src/pages/components/rate-checks/TextsTab.jsx
// Every text customers and partners get, in one place. The owner edits each
// paragraph with the copy-editor pencil (principals only); whatever's saved is
// what goes out, automatic or tapped. Blanks fill in when a text is sent.
import { Lock } from 'lucide-react';
import { T } from '../../../components/SiteCopy';
import { CopyTextButton } from './Copyable';
import { TEXT_GROUPS, TEXT_TEMPLATES, STOP_LINE, buildText } from '../../../lib/textTemplates';
import { REVIEW_LINK_KEY, REVIEW_LINK_FALLBACK, reviewUrl } from '../../../lib/reviews';

const box = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' };
const sample = { name: 'Dana', carrier: 'State Farm', reviewLink: '[review link]', portalLink: '[portal link]' };

function Template({ t }) {
  return (
    <article className="dark-card" style={{ padding: 16 }} aria-label={t.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>{t.name}</h4>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.auto ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>
          {t.auto ? 'Automatic' : 'You send it'}
        </span>
      </div>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>{t.when}</p>
      <div className="mt-3 space-y-2.5 rounded-lg p-3 text-[15px] leading-relaxed" style={box}>
        {t.paragraphs.map((p, i) => <p key={i}><T k={`${t.key}.${i + 1}`}>{p}</T></p>)}
        {t.auto && (
          <p className="flex items-center gap-1.5" style={{ color: 'var(--qs-subtle)' }} title="Added to every automatic text. Required by law.">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {STOP_LINE}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>Fills in: {t.blanks.join(', ')}</p>
        <CopyTextButton text={buildText(t.id, { ...sample, name: '', reviewLink: reviewUrl() })} className="h-8 rounded-full px-3 text-xs font-semibold text-primary-600" style={box}>
          Copy
        </CopyTextButton>
      </div>
    </article>
  );
}

export default function TextsTab() {
  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
        Turn on the pencil to edit any line. What you save is exactly what goes out, whether it’s sent automatically or you tap to send it.
      </p>

      <section className="dark-card" style={{ padding: 16 }} aria-label="Google review link">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}>Your Google review link</p>
        <p className="mt-1 break-all rounded-lg p-2.5 font-mono text-[13px]" style={box}>
          <T k={REVIEW_LINK_KEY}>{REVIEW_LINK_FALLBACK}</T>
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          Paste yours with the pencil (Google Business Profile → Ask for reviews). It fills in [review link]. <a href={reviewUrl()} target="_blank" rel="noreferrer" className="underline">Test it</a>
        </p>
      </section>

      {TEXT_GROUPS.map(g => (
        <section key={g} aria-label={g}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>{g}</h3>
          <div className="space-y-3">
            {TEXT_TEMPLATES.filter(t => t.group === g).map(t => <Template key={t.id} t={t} />)}
          </div>
        </section>
      ))}

      <section aria-label="Quick Send">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>Quick Send</h3>
        <article className="dark-card" style={{ padding: 16 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>Upload link</h4>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--qs-subtle)' }}><Lock className="h-3 w-3" aria-hidden="true" /> Locked</span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>
            Sent from the /qs page after the person says yes on the phone. It’s kept word for word with the record of what they agreed to, so it can’t be edited here.
          </p>
          <p className="mt-3 rounded-lg p-3 text-[15px] leading-relaxed" style={box}>
            insuredbycam.com (Cam Wiley Agency, Inc.): Here is the secure link you requested to upload your dec page for an agent-prepared quote: [link] {STOP_LINE}
          </p>
        </article>
      </section>
    </div>
  );
}
