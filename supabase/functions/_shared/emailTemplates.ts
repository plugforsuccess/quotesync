// supabase/functions/_shared/emailTemplates.ts
// The default wording of every email the app sends. The owner edits them on the Texts &
// Scripts page (site_copy keys `${key}.subject`, `${key}.1`, `${key}.2`, …, `${key}.button`);
// what's saved there wins. Kept in step with the email entries in src/lib/textTemplates.js
// (tests/unit/emailTemplates.test.mjs checks they match).
//
// button: the main link, shown as a gold button under the paragraph that mentions it.
// unsub: a marketing reminder, so it carries an unsubscribe link.

export type EmailTemplate = {
  key: string
  subject: string
  paragraphs: string[]
  button?: { label: string; link: string } // link: the blank it points to, e.g. 'course link'
  unsub?: boolean
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  ddRetake: {
    key: 'email.dd.retake',
    subject: 'Keep your Allstate defensive driving discount',
    paragraphs: [
      'Hi [first name],',
      'Your defensive driving certificate from [passed date] needs a refresh by [deadline] to keep your Allstate discount at your next renewal.',
      "Retake Georgia's 6-hour course online, at your own pace: [course link]",
      "When you pass, your new certificate comes straight to us and we'll keep your discount going.",
      'Cam Wiley Agency',
    ],
    button: { label: 'Retake the Course', link: 'course link' },
    unsub: true,
  },
  ddStall: {
    key: 'email.dd.stall',
    subject: 'Pick up your defensive driving course where you left off',
    paragraphs: [
      'Hi [first name],',
      "You're [modules done] of [modules total] modules into Georgia's 6-hour defensive driving course. Pick up where you left off: [course link]",
      'Once you pass the final exam, your certificate comes straight to us for your Allstate discount.',
      'Cam Wiley Agency',
    ],
    button: { label: 'Continue Your Course', link: 'course link' },
    unsub: true,
  },
  ddCert: {
    key: 'email.dd.cert',
    subject: 'Your defensive driving certificate is ready',
    paragraphs: [
      'Hi [first name],',
      "Congratulations on passing Georgia's 6-hour defensive driving course! Your certificate is ready: [certificate link]",
      "A copy already came to us, so you don't need to send it anywhere. We'll review it for your Allstate discount.",
      'Cam Wiley Agency',
    ],
    button: { label: 'Download Your Certificate', link: 'certificate link' },
  },
  ddStaff: {
    key: 'email.dd.staff',
    subject: 'New defensive driving certificate: [student name]',
    paragraphs: [
      '[student name] passed the defensive driving course. Certificate [certificate number] is in the discount queue: [queue link]',
    ],
    button: { label: 'Open the Queue', link: 'queue link' },
  },
  rcUpload: {
    key: 'email.rc.upload',
    subject: '[first name] uploaded their policy',
    paragraphs: [
      '[first name][where we met] just uploaded their [carrier] policy, paying [premium].',
      'The page told them we typically text within 30 minutes during business hours.',
    ],
    button: { label: 'Open the Lead', link: 'lead link' },
  },
  listStep1: {
    key: 'email.list.step1',
    subject: '[first name], your 2-minute rate check',
    paragraphs: [
      'Hi [first name],',
      "It was good talking with you. Whenever you're ready, you can check your rate in about 2 minutes: snap a photo of your car or home insurance declarations page, and I'll tell you honestly if I can beat it: [link]",
      'No pressure, and nobody will blow up your phone.',
      '[producer], Cam Wiley Agency',
    ],
    button: { label: 'Check My Rate', link: 'link' },
    unsub: true,
  },
  listStep2: {
    key: 'email.list.step2',
    subject: '[first name], an honest second opinion',
    paragraphs: [
      'Hi [first name],',
      "Quick follow-up. Most people haven't looked at their car or home insurance since they bought it, and rates have changed a lot in the last couple of years. Bundling home and auto is where people most often find a difference.",
      "Snap a photo of your declarations page and I'll give you an honest second opinion: [link]",
      '[producer], Cam Wiley Agency',
    ],
    button: { label: 'Get a Second Opinion', link: 'link' },
    unsub: true,
  },
  listStep3: {
    key: 'email.list.step3',
    subject: 'Before your next renewal, [first name]',
    paragraphs: [
      'Hi [first name],',
      'Last note from me. The best time to compare is a few weeks before your policy renews, before the new rate starts.',
      'Whenever that is for you, the link still works and takes about 2 minutes: [link]',
      "Thanks, and I'm here if you ever have a question. [producer], Cam Wiley Agency",
    ],
    button: { label: 'Check My Rate', link: 'link' },
    unsub: true,
  },
}

/**
 * A list's follow-up email n (1-3): the list's own wording when it's customized (site_copy
 * email.list.<listId>.step<n>.*), falling back line by line to the shared wording
 * (email.list.step<n>.*), then the defaults. Returns { template, saved } for renderEmail.
 */
export function listStepTemplate(n: number, listId: string | null, custom: boolean, saved: Record<string, string>) {
  const base = EMAIL_TEMPLATES[`listStep${n}`]
  if (!custom || !listId) return { template: base, saved }
  const key = `email.list.${listId}.step${n}`
  const merged: Record<string, string> = { ...saved }
  for (const part of ['subject', 'button', ...base.paragraphs.map((_, i) => String(i + 1))]) {
    if (!(saved[`${key}.${part}`] ?? '').trim() && saved[`${base.key}.${part}`]) merged[`${key}.${part}`] = saved[`${base.key}.${part}`]
  }
  return { template: { ...base, key }, saved: merged }
}

/** Sample blanks for "Send Me a Test". */
export const SAMPLE_VARS: Record<string, string> = {
  'first name': 'Dana',
  'student name': 'Dana Smith',
  'passed date': 'June 4, 2026',
  deadline: 'March 15, 2029',
  'modules done': '3',
  'modules total': '8',
  'certificate number': 'GA-DD-2026-7K2M9QXD',
  carrier: 'State Farm',
  premium: '$2,140 a year',
  'where we met': ' (from the Rotary lunch)',
  producer: 'Cam',
}
