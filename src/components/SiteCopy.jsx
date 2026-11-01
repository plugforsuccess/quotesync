// src/components/SiteCopy.jsx
// In-place copy editor for the consumer pages. Text wrapped in <T k="...">default</T>
// shows the saved version from site_copy, or its default. A principal (or platform
// admin) who is logged in sees an "Edit copy" button on those pages (or opens one from
// "Edit website" in the agency menu, which adds ?edit=1): every editable string gets an
// outline, click to change it, click away to save (it's live at once). Clear a string to
// bring back its default. **double asterisks** make text bold.
// <CopyImage> does the same for images (e.g. carrier logos): click to upload, Reset to undo.
// Legal and consent wording is deliberately not wrapped — it's versioned for consent records.
//
// Safety: saved text is rendered as text (React escapes it; only **bold** becomes <b>),
// pasted content is reduced to plain text, each line has a length limit based on its
// original, and every change is kept in site_copy_history.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const KEY = ['site_copy'];
// Pages with editable copy; the copy loads, and the Edit copy button shows, only on these.
const EDITABLE = [/^\/$/, /^\/ratecheck$/, /^\/r\/[^/]+$/, /^\/ratecheck-privacy$/, /^\/courses$/];
// The last copy seen on this device, so edited text shows at once instead of flashing the default.
const CACHE = 'qs_site_copy_v1';
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null') || undefined; } catch { return undefined; } };
const writeCache = (rows) => { try { localStorage.setItem(CACHE, JSON.stringify(rows)); } catch { /* private mode */ } };

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const IMAGE_MAX = 2 * 1024 * 1024;

const Ctx = createContext({ values: {}, editing: false, save: () => {}, upload: async () => {}, fail: () => {}, canStartEditing: false, startEditing: () => {} });

/** "**bold** text" → text with <b> parts. */
function rich(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

/** A save error in words the editor can act on. */
function friendly(e) {
  const m = String(e?.message || e || '');
  if (/JWT|expired|not authenticated|401/i.test(m)) return 'Your login expired. Log in again, then try that edit again.';
  if (/row-level security|permission|403|violates/i.test(m)) return 'Only the agency principal can edit the website.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection. Check your internet and try that edit again.';
  if (/exceeded|too large|size/i.test(m)) return 'That image is too big. Use one under 2 MB.';
  return 'Couldn’t save that. Try again.';
}

/** Longest a line may get: generous for short labels, three times the original otherwise. */
const maxLength = (fallback) => Math.min(1200, Math.max(60, String(fallback).length * 3));

export function SiteCopyProvider({ children }) {
  const { user, platformRole, agencyMemberships, loading, authzResolved } = useAuth();
  const { pathname, search } = useLocation();
  // "Edit website" in the agency menu opens a page with ?edit=1: editing starts on.
  const askedToEdit = new URLSearchParams(search).get('edit') === '1';
  const qc = useQueryClient();
  const canEdit = !!user && (
    ['platform_admin', 'platform_master_admin'].includes(platformRole) ||
    (agencyMemberships || []).some(m => m.agency_role === 'principal' && (m.status ?? 'active') === 'active'));
  const onEditablePage = EDITABLE.some(re => re.test(pathname));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (askedToEdit && canEdit) setEditing(true); }, [askedToEdit, canEdit]);
  // While editing, a button or link whose label is editable text doesn't act: tapping
  // or typing a space in its label would otherwise open the camera, a file picker, a page.
  useEffect(() => {
    if (!editing) return undefined;
    const block = (e) => {
      const host = e.target instanceof Element ? e.target.closest('button, a, label') : null;
      if (host && host.querySelector('[role="textbox"][contenteditable]')) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('click', block, true);
    return () => document.removeEventListener('click', block, true);
  }, [editing]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0); // time of the last save, for the "Saved" note

  const { data: rows = [] } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error: e } = await supabase.from('site_copy').select('key, value');
      if (e) throw e;
      writeCache(data || []);
      return data || [];
    },
    initialData: readCache,
    initialDataUpdatedAt: 0, // the cached copy is a placeholder: always fetch fresh once
    staleTime: 5 * 60_000,
    enabled: onEditablePage,
  });
  const values = useMemo(() => Object.fromEntries(rows.map(r => [r.key, r.value])), [rows]);

  const mutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const { error: e } = value == null
        ? await supabase.from('site_copy').delete().eq('key', key)
        : await supabase.from('site_copy').upsert({ key, value });
      if (e) throw e;
    },
    onMutate: ({ key, value }) => {
      setError('');
      qc.setQueryData(KEY, (old = []) => {
        const next = [...old.filter(r => r.key !== key), ...(value == null ? [] : [{ key, value }])];
        writeCache(next);
        return next;
      });
    },
    onSuccess: () => setSaved(Date.now()),
    onError: (e) => { setError(friendly(e)); qc.invalidateQueries({ queryKey: KEY }); },
  });
  const save = (key, value) => mutation.mutate({ key, value });

  const upload = async (key, file) => {
    if (!IMAGE_TYPES.includes(file.type)) { setError('Use a PNG, JPG, WebP or SVG image.'); return; }
    if (file.size > IMAGE_MAX) { setError('That image is too big. Use one under 2 MB.'); return; }
    setError('');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `copy/${key}-${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage.from('site-assets').upload(path, file, { contentType: file.type });
    if (e) { setError(friendly(e)); return; }
    save(key, supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl);
  };

  const on = editing && canEdit && onEditablePage;
  useEffect(() => {
    document.body.classList.toggle('qs-copy-editing', on);
    return () => document.body.classList.remove('qs-copy-editing');
  }, [on]);

  // "Saved" shows for a moment after each save.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // The page moves down by exactly the bar's height (it wraps on small phones).
  const bar = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  const notice = askedToEdit && onEditablePage && !canEdit && !loading && (user ? authzResolved !== false : true);
  useEffect(() => {
    const el = bar.current;
    if (!el) { setBarHeight(0); return; }
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [on, notice]);

  return (
    <Ctx.Provider value={{ values, editing: on, save, upload, fail: setError, canStartEditing: canEdit && onEditablePage && !on, startEditing: () => setEditing(true) }}>
      {children}
      {(on || notice) && barHeight > 0 && <style>{`body{padding-top:${barHeight}px}.qs-copy-editing .rc-marquee{animation-play-state:paused}`}</style>}
      {notice && (
        <div ref={bar} className="fixed inset-x-0 top-0 z-[90] bg-[#0F2D6B] px-4 py-2.5 text-center text-sm text-white shadow-lg">
          {user ? 'Only the agency principal can edit the website.' : <>To edit the website, <Link to="/admin-access-8by2X" className="font-semibold text-amber-300 underline">log in</Link> as the agency principal on this site, then choose <b>Edit website</b> in the menu.</>}
        </div>
      )}
      {canEdit && onEditablePage && (on ? (
        <div ref={bar} className="fixed inset-x-0 top-0 z-[90] bg-[#0F2D6B] text-white shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
            <p className="min-w-0 flex-1 text-xs leading-snug text-slate-200" aria-live="polite">
              {showSaved
                ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved. It’s live.</span>
                : <>Tap outlined text to edit. It saves when you tap away.<span className="hidden sm:inline"> Clear a line to bring back the original. **Two asterisks** make text bold.</span></>}
            </p>
            <button type="button" onClick={() => setEditing(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-sm font-bold text-slate-900">
              <Check className="h-4 w-4" aria-hidden="true" /> Done editing
            </button>
          </div>
          {error && <p className="bg-red-600 px-4 py-1.5 text-center text-xs text-white" role="alert">{error}</p>}
        </div>
      ) : (
        // Pages with the consumer nav show the pencil in its top-right corner (EditPagePencil);
        // the privacy page has no nav, so it keeps a corner button.
        !/^\/ratecheck-privacy$/.test(pathname) ? null : (
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit this page" title="Edit this page"
            className="fixed right-4 top-4 z-[90] inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0F2D6B] text-white shadow-lg ring-2 ring-white">
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      ))}
    </Ctx.Provider>
  );
}

/** The pencil in the consumer nav's top-right corner: edits the page you're on. Only
 * the principal (or a platform admin) sees it, and only on pages with editable copy. */
export function EditPagePencil({ className = '' }) {
  const { canStartEditing, startEditing } = useContext(Ctx);
  if (!canStartEditing) return null;
  return (
    <button type="button" onClick={startEditing} aria-label="Edit this page" title="Edit this page"
      className={`qs-edit-pencil inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white ${className}`}>
      <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

/** Editable text. `children` is the default (a plain string). */
export function T({ k, children }) {
  const { values, editing, save, fail } = useContext(Ctx);
  const fallback = typeof children === 'string' ? children : String(children ?? '');
  const text = values[k] ?? fallback;
  if (!editing) return <>{rich(text)}</>;
  return <EditableText k={k} text={text} fallback={fallback} edited={k in values} save={save} fail={fail} />;
}

function EditableText({ k, text, fallback, edited, save, fail }) {
  const ref = useRef(null);
  // The browser owns this text (no React children), so it can be edited; it's reset whenever the saved value changes.
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.textContent = text; }, [text]);
  const limit = maxLength(fallback);
  const finish = () => {
    const next = (ref.current?.textContent || '').replace(/\s+/g, ' ').trim();
    if (next === text) return;
    if (next.length > limit) {
      // Keep what they typed so nothing is lost; it isn't saved until it fits (Esc undoes).
      fail(`That’s ${next.length} characters; this line fits ${limit}. Shorten it, or press Esc to undo.`);
      return;
    }
    fail('');
    save(k, next === '' || next === fallback ? null : next);
    if (next === '' && ref.current) ref.current.textContent = fallback;
  };
  return (
    <span ref={ref} role="textbox" aria-label={`Edit text: ${fallback.slice(0, 40)}`} tabIndex={0}
      contentEditable suppressContentEditableWarning
      title={edited ? 'Edited — clear it to restore the original' : 'Click to edit'}
      onClick={e => { e.preventDefault(); e.stopPropagation(); }}
      onPaste={e => {
        // Plain text only: no fonts, links or images from Word or other sites.
        e.preventDefault();
        const plain = (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, plain);
      }}
      onDrop={e => e.preventDefault()}
      onKeyDown={e => {
        e.stopPropagation();
        // Space inside a button's label would press the button (open the camera, etc.):
        // type the space ourselves and keep the key from reaching the button.
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); document.execCommand('insertText', false, ' '); return; }
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Escape') { if (ref.current) ref.current.textContent = text; fail(''); ref.current?.blur(); }
      }}
      // Buttons act on the space key's release: block that too.
      onKeyUp={e => { e.stopPropagation(); if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') e.preventDefault(); }}
      onKeyPress={e => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); }}
      onBlur={finish}
      className={`cursor-text rounded-sm outline-dashed outline-2 outline-offset-2 ${edited ? 'outline-amber-500' : 'outline-amber-300'}`} />
  );
}

/** An image that can be replaced from the editor (upload) and reset. Falls back to `fallback` with no image. */
export function CopyImage({ k, src, alt, className, fallback = null }) {
  const { values, editing, upload, save } = useContext(Ctx);
  const url = values[k] || src;
  const img = url ? <img src={url} alt={alt} className={className} /> : fallback;
  if (!editing) return img;
  return (
    <span className="relative inline-flex items-center">
      <label className="relative inline-flex cursor-pointer items-center rounded-md outline-dashed outline-2 outline-offset-4 outline-amber-300" title={`Upload a logo for ${alt}`}>
        {img}
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">Change</span>
        <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(k, f); e.target.value = ''; }} />
      </label>
      {k in values && (
        <button type="button" onClick={() => save(k, null)} title="Back to the original logo"
          className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#0F2D6B] text-white shadow">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Reset {alt} logo</span>
        </button>
      )}
    </span>
  );
}
