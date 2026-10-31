// src/components/SiteCopy.jsx
// In-place copy editor for the consumer pages. Text wrapped in <T k="...">default</T>
// shows the saved version from site_copy, or its default. A principal (or platform
// admin) who is logged in sees an "Edit copy" button on those pages: every editable
// string gets an outline, click to change it, click away to save (it's live at once).
// Clear a string to bring back its default. **double asterisks** make text bold.
// <CopyImage> does the same for images (e.g. carrier logos): click to upload.
// Legal and consent wording is deliberately not wrapped — it's versioned for consent records.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const KEY = ['site_copy'];
// Pages with editable copy; the Edit copy button only shows on these.
const EDITABLE = [/^\/$/, /^\/ratecheck$/, /^\/r\/[^/]+$/, /^\/ratecheck-privacy$/, /^\/courses$/];

const Ctx = createContext({ values: {}, editing: false, save: () => {}, upload: async () => {} });

/** "**bold** text" → text with <b> parts. */
function rich(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

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
  const [error, setError] = useState('');

  const { data: rows = [] } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error: e } = await supabase.from('site_copy').select('key, value');
      if (e) throw e;
      return data || [];
    },
    staleTime: 5 * 60_000,
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
      qc.setQueryData(KEY, (old = []) => [...old.filter(r => r.key !== key), ...(value == null ? [] : [{ key, value }])]);
    },
    onError: (e) => { setError(e.message || 'Couldn’t save that.'); qc.invalidateQueries({ queryKey: KEY }); },
  });
  const save = (key, value) => mutation.mutate({ key, value });

  const upload = async (key, file) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `copy/${key}-${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage.from('site-assets').upload(path, file, { contentType: file.type });
    if (e) { setError(e.message); return; }
    save(key, supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl);
  };

  const on = editing && canEdit && onEditablePage;
  useEffect(() => {
    document.body.classList.toggle('qs-copy-editing', on);
    return () => document.body.classList.remove('qs-copy-editing');
  }, [on]);

  return (
    <Ctx.Provider value={{ values, editing: on, save, upload }}>
      {children}
      {askedToEdit && onEditablePage && !canEdit && !loading && (user ? authzResolved !== false : true) && (
        <div className="fixed inset-x-0 top-0 z-[90] bg-slate-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">
          <style>{'body{padding-top:44px}@media (max-width:640px){body{padding-top:64px}}'}</style>
          {user ? 'Only the agency principal can edit the website.' : <>To edit the website, <Link to="/admin-access-8by2X" className="font-semibold text-amber-300 underline">log in</Link> as the agency principal on this site, then choose <b>Edit website</b> in the menu.</>}
        </div>
      )}
      {canEdit && onEditablePage && (on ? (
        <div className="fixed inset-x-0 top-0 z-[90] bg-slate-900 text-white shadow-lg">
          <style>{'.qs-copy-editing{padding-top:64px}.qs-copy-editing .rc-marquee{animation-play-state:paused}'}</style>
          <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-2.5">
            <p className="min-w-0 flex-1 text-xs leading-snug text-slate-200">
              Tap outlined text to change it. Saves when you tap away. Clear it to restore. **Bold** with two asterisks.
            </p>
            <button type="button" onClick={() => setEditing(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-sm font-bold text-slate-900">
              <Check className="h-4 w-4" aria-hidden="true" /> Done editing
            </button>
          </div>
          {error && <p className="bg-red-600 px-4 py-1.5 text-center text-xs text-white" role="alert">{error}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)}
          className="fixed bottom-24 left-3 z-[90] inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-lg">
          <Pencil className="h-4 w-4" aria-hidden="true" /> Edit copy
        </button>
      ))}
    </Ctx.Provider>
  );
}

/** Editable text. `children` is the default (a plain string). */
export function T({ k, children }) {
  const { values, editing, save } = useContext(Ctx);
  const fallback = typeof children === 'string' ? children : String(children ?? '');
  const text = values[k] ?? fallback;
  if (!editing) return <>{rich(text)}</>;
  return <EditableText k={k} text={text} fallback={fallback} edited={k in values} save={save} />;
}

function EditableText({ k, text, fallback, edited, save }) {
  const ref = useRef(null);
  // The browser owns this text (no React children), so it can be edited; it's reset whenever the saved value changes.
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.textContent = text; }, [text]);
  const finish = () => {
    const next = (ref.current?.textContent || '').replace(/\s+/g, ' ').trim();
    if (next === text) return;
    save(k, next === '' || next === fallback ? null : next);
    if (next === '' && ref.current) ref.current.textContent = fallback;
  };
  return (
    <span ref={ref} role="textbox" aria-label={`Edit text: ${fallback.slice(0, 40)}`} tabIndex={0}
      contentEditable suppressContentEditableWarning
      title={edited ? 'Edited — clear it to restore the original' : 'Click to edit'}
      onClick={e => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Escape') { if (ref.current) ref.current.textContent = text; ref.current?.blur(); }
      }}
      onBlur={finish}
      className={`cursor-text rounded-sm outline-dashed outline-2 outline-offset-2 ${edited ? 'outline-amber-500' : 'outline-amber-300'}`} />
  );
}

/** An image that can be replaced from the editor (upload). Falls back to `fallback` with no image. */
export function CopyImage({ k, src, alt, className, fallback = null }) {
  const { values, editing, upload } = useContext(Ctx);
  const url = values[k] || src;
  const img = url ? <img src={url} alt={alt} className={className} /> : fallback;
  if (!editing) return img;
  return (
    <label className="relative inline-flex cursor-pointer items-center rounded-md outline-dashed outline-2 outline-offset-4 outline-amber-300" title={`Upload a logo for ${alt}`}>
      {img}
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">Change</span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(k, f); e.target.value = ''; }} />
    </label>
  );
}
