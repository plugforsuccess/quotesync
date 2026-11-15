// src/lib/siteEditor.js
// Who can edit the website's wording (the pencil): the agency principal's own login only.
// The database enforces the same rule (can_edit_site_copy), so hiding the pencil isn't the
// only guard. Change both together.
export const SITE_EDITOR_EMAIL = 'camwiley@allstate.com';
export const isSiteEditor = (user) => String(user?.email || '').trim().toLowerCase() === SITE_EDITOR_EMAIL;
