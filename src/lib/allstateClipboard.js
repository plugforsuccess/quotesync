// Formatting + clipboard helpers for pasting QuoteSync records into Allstate's
// internal system (the system of record). The agent works a task/note in QS,
// then pastes a clean, consistent block into Allstate without retyping.

const TYPE_LABEL = {
  mortgagee: 'Mortgagee/Lienholder', vehicle: 'Vehicle', billing: 'Billing',
  premium: 'Premium', coverage: 'Coverage', address: 'Address',
  id_cards: 'ID Cards/Docs', document: 'Document', other: 'Service',
};

const PRODUCT_LABEL = {
  auto: 'AUTO', ho: 'HO', renters: 'RENTERS', condo: 'CONDO', landlord: 'LANDLORD',
  pup: 'UMBRELLA', boat: 'BOAT', specialty_auto: 'SPEC AUTO', life: 'LIFE',
  manufactured: 'MFG HOME', other: 'OTHER',
};

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// One service task → a paste-ready block.
export function formatTaskForAllstate(task) {
  const lines = [];
  const who = [task.customer_name, task.policy_no].filter(Boolean).join(' · ');
  if (who) lines.push(who);
  const kind = [TYPE_LABEL[task.task_type] || 'Service', PRODUCT_LABEL[task.product]]
    .filter(Boolean).join(' · ');
  const head = [kind, fmtDate(task.due_date) || fmtDate(task.completed_at)]
    .filter(Boolean).join(' — ');
  if (head) lines.push(head);
  if (task.title) lines.push(task.title);
  if (task.detail) lines.push(task.detail);
  if (task.completion_note) lines.push(`Completed: ${task.completion_note}`);
  return lines.join('\n');
}

// One case note → a paste-ready block.
export function formatNoteForAllstate(note) {
  const lines = [];
  const who = [note.customer_name, note.policy_no].filter(Boolean).join(' · ');
  if (who) lines.push(who);
  if (note.body) lines.push(note.body);
  const meta = [note.author_name, fmtDate(note.created_at)].filter(Boolean).join(' · ');
  if (meta) lines.push(`— ${meta}`);
  return lines.join('\n');
}

// A whole case's notes → one block, newest last (chronological reads better for
// pasting into a running Allstate log).
export function formatNotesForAllstate(notes, { customerName, policyNo } = {}) {
  const header = [customerName, policyNo].filter(Boolean).join(' · ');
  const body = [...notes]
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map(n => {
      const meta = [n.author_name, fmtDate(n.created_at)].filter(Boolean).join(' · ');
      return `${n.body}${meta ? `\n  — ${meta}` : ''}`;
    })
    .join('\n\n');
  return [header, body].filter(Boolean).join('\n\n');
}

// Copy with a clipboard-API path and a legacy fallback for non-secure contexts.
export async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
