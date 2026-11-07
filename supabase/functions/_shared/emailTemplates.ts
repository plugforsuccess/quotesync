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
}
