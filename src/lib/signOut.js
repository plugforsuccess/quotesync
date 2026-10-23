// src/lib/signOut.js
// Shared sign-out: the desktop user menu and the mobile More drawer both use it.
// Races signOut against a 3s timeout (prevents hanging if the auth lock is held),
// then hard-redirects to destroy all React state. navigate() raced: if signOut
// hadn't cleared the user yet, LoginPage saw them still signed in and bounced back.
export async function signOutAndExit(signOut) {
  try {
    await Promise.race([signOut(), new Promise(resolve => setTimeout(resolve, 3000))]);
  } catch (err) {
    console.warn('[logout] signOut error (non-fatal):', err);
  }
  window.location.href = '/admin-access-8by2X';
}
