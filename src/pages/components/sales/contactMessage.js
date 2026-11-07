// Sales workspace: the message for a saved quote, by result. The producer can edit it
// before sending; the owner edits the wording on the Texts & Scripts page. Saves /
// same / quoted ask for a Y (a Y back flags them ready to call); costs more is an
// honest note that we'll check again before their next renewal.
import { buildText } from '../../../lib/textTemplates.js';

const ID = { saves: 'contactSaves', same: 'contactSame', more: 'contactMore', quoted: 'contactQuoted' };

export function contactMessage(kind, { first, producer = 'Cam', allstate, diff }) {
  return buildText(ID[kind] || 'contactMore', { name: first, producer, allstate, savings: diff });
}
