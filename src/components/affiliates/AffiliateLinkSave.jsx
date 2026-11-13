// src/components/affiliates/AffiliateLinkSave.jsx
// On /r/CODE?app=1 (opened from the affiliate's own portal): the Home Screen icon is
// pre-named "Affiliate Link", and, on the affiliate's own phone only (the portal remembers
// their code), a small card says how to save it. Customers who open the link never see it.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MoreVertical, Share, X } from 'lucide-react';
import { T } from '../SiteCopy';
import { setHomeScreenName } from '../../lib/homeScreenName';

const CODE_KEY = 'qs_aff_code';
const DONE_KEY = 'qs_aff_link_saved';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export default function AffiliateLinkSave() {
  const { inviteCode } = useParams();
  const app = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('app') === '1';
  const mine = app && inviteCode && String(read(CODE_KEY) || '').toUpperCase() === String(inviteCode).toUpperCase();
  const [show, setShow] = useState(() => mine && !read(DONE_KEY));
  useEffect(() => (app && inviteCode ? setHomeScreenName('Affiliate Link') : undefined), [app, inviteCode]);
  if (!show) return null;
  const android = /android/i.test(navigator.userAgent);
  const close = () => { setShow(false); try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ } };
  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-3 pt-3" role="dialog" aria-label="Save your Affiliate Link">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-white p-4 shadow-xl shadow-blue-900/15 ring-1 ring-slate-200">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">
          {android ? <MoreVertical className="h-5 w-5" /> : <Share className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">
          <p className="font-bold text-[#0F2D6B]"><T k="aff.linksave.title">Save Your Affiliate Link</T></p>
          {android
            ? <p><T k="aff.linksave.android">Tap the menu (three dots), then Add to Home screen. It’s already named “Affiliate Link.”</T></p>
            : <p><T k="aff.linksave.iphone">Tap Share, then Add to Home Screen. It’s already named “Affiliate Link.”</T></p>}
        </div>
        <button type="button" onClick={close} aria-label="Done" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
