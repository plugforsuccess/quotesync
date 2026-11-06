// src/pages/components/rate-checks/ScriptsTab.jsx
// What to say and text when asking people to send their dec page: a group pitch,
// the follow-up text, reconnecting after a quote that came in high, and asking
// someone to share the link. Each script copies in one tap; texts open Messages.

import { T } from '../../../components/SiteCopy';
import { MessageSquare } from 'lucide-react';
import { CopyTextButton } from './Copyable';
import SendPitch from './SendPitch';

const SITE = 'insuredbycam.com';

const SECTIONS = [
  {
    title: 'Groups and events',
    scripts: [
      {
        key: 'room',
        name: 'Say it in the room',
        when: 'A meeting, a club, a group of friends. About 30 seconds.',
        kind: 'say',
        text: `Quick ask. I built a new tool on my website: you snap a photo of your car or home insurance declarations page, and it reads it in seconds. I'm testing it and I'd love 10 of you to try it this week.

It's ${SITE}. It takes about a minute, there's nothing to download, your info stays private, and nobody's going to blow up your phone.

And if you want, I'll check your rate and tell you honestly if I can beat it. If I can't, I'll tell you that too. Either way, you'd be helping me out a lot.`,
      },
      {
        key: 'room-text',
        name: 'Text right after',
        when: 'Send it to the group chat, or one by one, while it’s fresh.',
        kind: 'text',
        text: `Thanks for hearing me out 🙏 Here's the link: ${SITE}. Tap "Check My Rate" and upload your policy (the PDF from your insurance app, or photos of every page). Takes about a minute, nothing to download. If you want me to check your rate too, leave the box checked and I'll text you. Appreciate y'all!`,
      },
    ],
  },
  {
    title: 'Follow-ups',
    scripts: [
      {
        key: 'reconnect',
        name: 'Reconnect after a quote that came in high',
        when: 'Someone you quoted before and never followed up with.',
        kind: 'say',
        text: `Hey, I owe you a follow-up. I quoted your insurance a while back, and honestly, I came in high, so I didn't want to waste your time with a number that didn't help you. That's on me, I should've told you.

Rates have moved since then, and I've got a new tool on my website that reads your policy in about a minute. If you send me your current dec pages, I'll take a fresh look. If I can't beat it, I'll tell you straight up. No pressure either way.`,
      },
      {
        key: 'reconnect-text',
        name: 'Text version',
        when: 'If you can’t catch them in person.',
        kind: 'text',
        text: `Hey, I owe you a follow-up on that quote. I came in high last time, so I didn't want to waste your time, my bad for going quiet. Rates have moved, so I'd like to take a fresh look: ${SITE}, tap "Check My Rate" (about a minute, nothing to download). If I can't get you a cheaper rate, I'll tell you straight up.`,
      },
    ],
  },
  {
    title: 'Partners',
    scripts: [
      {
        key: 'share',
        name: 'Ask them to share',
        when: 'Anyone well connected: a chapter president, a coach, a pastor. Then send the pitch.',
        kind: 'say',
        pitch: true,
        text: `Even if I can't beat yours, would you be open to sharing this with people you know? You'd get a referral fee for every household that sends their policy through your link, and they don't have to buy anything.`,
      },
    ],
  },
];

const TIPS = [
  ['Call it your website, not an app.', '“App” makes people think download. Say: “Go to insuredbycam.com on your phone and tap Check My Rate. Nothing to download.”'],
  ['Explain “dec page”.', 'Most people don’t know the term: “the page that lists your cars, coverages and price; it’s in your insurance app or the email from your last renewal.”'],
  ['Ask for a number.', '“I’d love 10 of you” works better than “anyone who wants to.”'],
  ['Don’t promise savings.', '“I’ll tell you honestly if I can beat it” is more believable, and it keeps you compliant.'],
  ['Show it live.', 'Upload one on your phone in front of them. Seeing it take a minute is the best pitch.'],
];

export default function ScriptsTab() {
  return (
    <div className="space-y-5">
      {SECTIONS.map(sec => (
        <section key={sec.title} aria-label={sec.title}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}>{sec.title}</h3>
          <div className="space-y-3">
            {sec.scripts.map(s => (
              <article key={s.key} className="dark-card" style={{ padding: 16 }} aria-label={s.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h4 className="text-base font-bold" style={{ color: 'var(--qs-bright)' }}>{s.name}</h4>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--qs-subtle)' }}>{s.kind === 'text' ? 'Text' : 'Say it'}</span>
                </div>
                <p className="mt-0.5 text-sm" style={{ color: 'var(--qs-subtle)' }}>{s.when}</p>
                <div className="mt-3 whitespace-pre-line rounded-lg p-3 text-[15px] leading-relaxed"
                  style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
                  {s.text}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyTextButton text={s.text} className="h-9 w-[8.5rem] justify-center rounded-full px-3.5 text-sm font-semibold text-primary-600"
                    style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)' }}><T k="pages.components.ratechecks.scriptstab.5fb635">Copy</T></CopyTextButton>
                  {s.kind === 'text' && (
                    <a href={`sms:?&body=${encodeURIComponent(s.text)}`} aria-label={`Text: ${s.name}`}
                      className="inline-flex h-9 w-[8.5rem] items-center justify-center gap-1.5 rounded-full bg-primary-600 px-3.5 text-sm font-semibold text-white hover:bg-primary-700">
                      <MessageSquare className="h-4 w-4" aria-hidden="true" /> <T k="pages.components.ratechecks.scriptstab.98ea21">Text It</T>
                    </a>
                  )}
                  {s.pitch && <SendPitch className="h-9 w-[8.5rem] justify-center rounded-full px-3.5" />}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="dark-card" style={{ padding: 16 }} aria-label="Tips">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.scriptstab.a0d4cc">Tips</T></h3>
        <ul className="mt-2 space-y-2.5">
          {TIPS.map(([lead, rest]) => (
            <li key={lead} className="text-sm leading-relaxed" style={{ color: 'var(--qs-text)' }}>
              <span className="font-semibold" style={{ color: 'var(--qs-bright)' }}>{lead}</span> {rest}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
