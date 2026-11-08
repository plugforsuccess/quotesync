// src/pages/components/rate-checks/TextsTab.jsx
// Every text and script, in one place (the Texts & Scripts page): what producers say,
// what they text, and what customers and partners get. The owner edits each paragraph
// with the copy-editor pencil (principals only); whatever's saved is what goes out,
// automatic or tapped. Blanks fill in when a text is sent.
import { useState } from 'react';
import { AlertTriangle, Loader2, Lock, Mail, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { T } from '../../../components/SiteCopy';
import { CopyTextButton } from './Copyable';
import SendPitch from './SendPitch';
import Dismissible from '../../../components/Dismissible';
import { TEXT_GROUPS, TEXT_TEMPLATES, STOP_LINE, buildText, segments, templateWarnings } from '../../../lib/textTemplates';
import { REVIEW_LINK_KEY, REVIEW_LINK_FALLBACK, reviewUrl, TEXT_NUMBER_KEY, TEXT_NUMBER_UNSET } from '../../../lib/reviews';

const box = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' };
const sample = { passedDate: 'June 4, 2026', deadline: 'March 15, 2029', done: 3, total: 8, name: 'Dana', carrier: 'State Farm', reviewLink: '[review link]', portalLink: '[portal link]', producer: 'Cam', link: 'https://insuredbycam.com/r/K7PM2QXD', allstate: 8400, savings: 1516, courseLink: 'https://insuredbycam.com/courses/defensive-driving' };
const TIPS = [
  ['Call it your website, not an app.', '“App” makes people think download. Say: “Go to insuredbycam.com on your phone and tap Check My Rate. Nothing to download.”'],
  ['Explain “dec page”.', 'Most people don’t know the term: “the page that lists your cars, coverages and price; it’s in your insurance app or the email from your last renewal.”'],
  ['Ask for a number.', '“I’d love 10 of you” works better than “anyone who wants to.”'],
  ['Don’t promise savings.', '“I’ll tell you honestly if I can beat it” is more believable, and it keeps you compliant.'],
  ['Show it live.', 'Upload one on your phone in front of them. Seeing it take a minute is the best pitch.'],
];
const btnCls = 'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold';
export const EMAIL_ADDRESS_KEY = 'email.footer.address';
const EMAIL_ADDRESS_UNSET = 'Not set yet';

// Emails the principal this email, as it would go out (email-test). listId: a list's own wording.
export function SendTest({ id, listId }) {
  const [state, setState] = useState({ busy: false, note: '', error: false });
  const send = async () => {
    setState({ busy: true, note: '', error: false });
    const { data, error } = await supabase.functions.invoke('email-test', { body: listId ? { id, list_id: listId } : { id } });
    let msg = data?.error;
    if (error) {
      try { msg = (await error.context?.json())?.error; } catch { /* not JSON */ }
      msg = msg || 'Could not send the test.';
    }
    setState(msg ? { busy: false, note: msg, error: true } : { busy: false, note: `Sent to ${data.sent_to}.`, error: false });
  };
  return (
    <>
      <button type="button" onClick={send} disabled={state.busy} className={`${btnCls} bg-primary-600 text-white`}>
        {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
        <T k="pages.components.ratechecks.textstab.send-test">Send Me a Test</T>
      </button>
      {state.note && <span role="status" className="basis-full text-right text-xs" style={{ color: state.error ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>{state.note}</span>}
    </>
  );
}

function Template({ t }) {
  return (
    <article className="dark-card" style={{ padding: 16 }} aria-label={t.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>{t.name}</h4>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.auto ? 'var(--qs-warning)' : 'var(--qs-subtle)' }}>
          {t.kind === 'say' ? <T k="pages.components.ratechecks.textstab.say">{'Say It'}</T>
            : t.kind === 'email' ? <T k="pages.components.ratechecks.textstab.email">{'Automatic Email'}</T>
            : t.auto ? <T k="pages.components.ratechecks.textstab.ac9041">{'Automatic'}</T> : <T k="pages.components.ratechecks.textstab.826293">{'You send it'}</T>}
        </span>
      </div>
      <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>{t.when}</p>
      {t.recorded && (
        <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" /> <T k="pages.components.ratechecks.textstab.recorded">Each send records the exact wording and its version. Editing makes a new version.</T>
        </p>
      )}
      <div className="mt-3 space-y-2.5 rounded-lg p-3 text-[15px] leading-relaxed" style={box}>
        {t.subject && (
          <p className="pb-2 font-semibold" style={{ borderBottom: '1px solid var(--qs-border)', color: 'var(--qs-bright)' }}>
            <span className="font-normal" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.textstab.subject">Subject:</T></span> <T k={`${t.key}.subject`}>{t.subject}</T>
          </p>
        )}
        {t.paragraphs.map((p, i) => <p key={i}><T k={`${t.key}.${i + 1}`}>{p}</T></p>)}
        {t.button && (
          <p>
            <span className="inline-flex min-h-[40px] items-center rounded-full px-5 text-sm font-bold" style={{ background: '#F5D061', color: '#0F2D6B' }} title={`Button for ${t.button.link}`}>
              <T k={`${t.key}.button`}>{t.button.label}</T>
            </span>
          </p>
        )}
        {t.unsub && (
          <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--qs-subtle)' }} title="Added to every reminder email.">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <T k="pages.components.ratechecks.textstab.unsub">Don’t want these reminders? Unsubscribe.</T>
          </p>
        )}
        {t.auto && t.kind !== 'email' && (
          <p className="flex items-center gap-1.5" style={{ color: 'var(--qs-subtle)' }} title="Added to every automatic text. Required by law.">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {STOP_LINE}
          </p>
        )}
      </div>
      {templateWarnings(t.id).map(w => (
        <p key={w} className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: 'var(--qs-warning)' }}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {w}</p>
      ))}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
          {t.blanks.length > 0 && <><T k="pages.components.ratechecks.textstab.bc8104">Fills in:</T> {t.blanks.join(', ')}</>}
          {t.button && <>{t.blanks.length > 0 && ' · '}<T k="pages.components.ratechecks.textstab.button-note">The gold button opens</T> {t.button.link}</>}
          {t.kind !== 'say' && t.kind !== 'email' && <>{t.blanks.length > 0 && ' · '}{(() => { const n = segments(buildText(t.id, { ...sample, reviewLink: reviewUrl(), portalLink: 'https://insuredbycam.com/partner/abcdefghijkl' })); return n === 1 ? '1 text' : `${n} texts long`; })()}</>}
        </p>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {t.kind === 'email' && <SendTest id={t.id} />}
          {t.kind !== 'email' && <CopyTextButton text={buildText(t.id, { ...sample, name: '', reviewLink: reviewUrl() })} className={`${btnCls} text-primary-600`} style={box}>
            <T k="pages.components.ratechecks.textstab.af74f7">Copy</T>
          </CopyTextButton>}
          {t.textIt && (
            <a href={`sms:?&body=${encodeURIComponent(buildText(t.id))}`} aria-label={`Text: ${t.name}`} className={`${btnCls} bg-primary-600 text-white`}>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> <T k="pages.components.ratechecks.scriptstab.98ea21">Text It</T>
            </a>
          )}
          {t.pitch && <SendPitch className={`${btnCls} justify-center`} />}
        </span>
      </div>
    </article>
  );
}

export default function TextsTab({ agencyId }) {
  const { data: agency } = useQuery({
    queryKey: ['agency-texting', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('agencies').select('twilio_from_number').eq('id', agencyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const autoOff = agency && !agency.twilio_from_number;
  const linkUnset = reviewUrl() === REVIEW_LINK_FALLBACK;
  return (
    <div className="space-y-5">
      {autoOff && (
        <Dismissible id="texts.auto-off">
          <p className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--qs-warning-subtle, rgba(245,158,11,.1))', border: '1px solid var(--qs-warning-border, rgba(245,158,11,.35))', color: 'var(--qs-text)' }} role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--qs-warning)' }} aria-hidden="true" />
            <span><T k="pages.components.ratechecks.textstab.8818ab">Automatic texts are off: the agency has no texting number yet. Nothing marked Automatic goes out until one is set. You can still tap to send any of them from your phone.</T></span>
          </p>
        </Dismissible>
      )}
      {linkUnset && (
        <Dismissible id="texts.link-unset">
          <p className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--qs-warning-subtle, rgba(245,158,11,.1))', border: '1px solid var(--qs-warning-border, rgba(245,158,11,.35))', color: 'var(--qs-text)' }} role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--qs-warning)' }} aria-hidden="true" />
            <span><T k="pages.components.ratechecks.textstab.18d6b4">Your Google review link isn’t set, so review texts link to a Google search for the agency. Paste your link below.</T></span>
          </p>
        </Dismissible>
      )}
      <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}>
        <T k="pages.components.ratechecks.textstab.intro">Everything you and your producers say and text, and every text customers and partners get. Turn on the pencil to edit any line. What you save is what goes out, whether it’s sent automatically or tapped to send.</T>
      </p>

      {TEXT_GROUPS.map(g => (
        <section key={g} aria-label={g}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T>{g}</T></h3>
          <div className="space-y-3">
            {TEXT_TEMPLATES.filter(t => t.group === g).map(t => <Template key={t.id} t={t} />)}
          </div>
        </section>
      ))}

      <section aria-label="Settings" className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.textstab.settings">Links and Numbers</T></h3>
      <section className="dark-card" style={{ padding: 16 }} aria-label="Google review link">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.textstab.e82c6f">Your Google review link</T></p>
        <p className="mt-1 break-all rounded-lg p-2.5 font-mono text-[13px]" style={box}>
          <T k={REVIEW_LINK_KEY}>{REVIEW_LINK_FALLBACK}</T>
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.components.ratechecks.textstab.1468a3">Paste yours with the pencil (Google Business Profile → Ask for reviews). It fills in [review link].</T> <a href={reviewUrl()} target="_blank" rel="noreferrer" className="underline"><T k="pages.components.ratechecks.textstab.0b4483">Test it</T></a>
        </p>
      </section>

      <section className="dark-card" style={{ padding: 16 }} aria-label="Text us number">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.textstab.a475db">Your “Text us” number</T></p>
        <p className="mt-1 rounded-lg p-2.5 font-mono text-[13px]" style={box}>
          <T k={TEXT_NUMBER_KEY}>{TEXT_NUMBER_UNSET}</T>
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.components.ratechecks.textstab.24fb48">The mobile number customers can text from the website. The Text us button shows once this is a 10-digit number.</T>
        </p>
      </section>

      <section className="dark-card" style={{ padding: 16 }} aria-label="Email mailing address">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.textstab.email-address">Mailing Address for Emails</T></p>
        <p className="mt-1 rounded-lg p-2.5 text-[13px]" style={box}>
          <T k={EMAIL_ADDRESS_KEY}>{EMAIL_ADDRESS_UNSET}</T>
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.components.ratechecks.textstab.email-address-note">Shown at the bottom of every email. The law requires a mailing address on reminder emails; a P.O. box works.</T>
        </p>
      </section>

      <section className="dark-card" style={{ padding: 16 }} aria-label="Send tests to">
        <p className="text-sm font-semibold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.textstab.test-to">Send Tests To</T></p>
        <p className="mt-1 rounded-lg p-2.5 font-mono text-[13px]" style={box}>
          <T k="email.test.to">Your sign-in email</T>
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.components.ratechecks.textstab.test-to-note">Where Send Me a Test emails go. Leave it as is to use your sign-in email.</T>
        </p>
      </section>

      </section>

      <section className="dark-card" style={{ padding: 16 }} aria-label="Tips">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.scriptstab.a0d4cc">Tips</T></h3>
        <ul className="mt-2 space-y-2.5">
          {TIPS.map(([lead, rest]) => (
            <li key={lead} className="text-sm leading-relaxed" style={{ color: 'var(--qs-text)' }}>
              <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}><T>{lead}</T></span> <T>{rest}</T>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
