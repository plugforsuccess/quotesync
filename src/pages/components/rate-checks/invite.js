// src/pages/components/rate-checks/invite.js
// The short link a producer sends, and the message that carries it.

export const inviteUrl = (code) => `${window.location.origin}/r/${code}`;

// What the customer receives. Short, from a person, with the link last so it previews.
export function inviteMessage(invite, producerFirst) {
  const who = producerFirst ? `${producerFirst} with Allstate` : 'Allstate';
  const hi = invite.first_name ? `Hi ${invite.first_name}, ` : 'Hi, ';
  return `${hi}it's ${who}${invite.event_name ? ` — we met at ${invite.event_name}` : ''}. ` +
    `Snap a photo of your current policy here and we'll check if we can beat it: ${inviteUrl(invite.code)}`;
}
