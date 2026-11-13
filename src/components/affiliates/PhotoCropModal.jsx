// src/components/affiliates/PhotoCropModal.jsx
// Crop a headshot to a circle before it's saved: drag to move, slider (or pinch/wheel) to
// zoom. Returns a square JPEG data URL (the circle is how it's shown everywhere).
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { T } from '../SiteCopy';

const OUT = 400; // saved size, px
const MAX_ZOOM = 4;

function cropToDataUrl(img, view, zoom, offset) {
  const s = (view / Math.min(img.naturalWidth, img.naturalHeight)) * zoom; // screen px per image px
  const side = view / s;
  const cx = img.naturalWidth / 2 - offset.x / s;
  const cy = img.naturalHeight / 2 - offset.y / s;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(OUT, Math.round(side));
  canvas.getContext('2d').drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export default function PhotoCropModal({ file, busy, error, children, canUse = true, onCancel, onUse }) {
  const [img, setImg] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [view, setView] = useState(288);
  const drag = useRef(null);
  const pointers = useRef(new Map());

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setLoadError('That photo couldn’t be read. Try another.');
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const fit = () => setView(Math.min(288, window.innerWidth - 80));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Keep the photo covering the circle.
  const base = img ? view / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : view;
  const h = img ? img.naturalHeight * base * zoom : view;
  const clamp = (o, z = zoom) => {
    const ww = img ? img.naturalWidth * base * z : view, hh = img ? img.naturalHeight * base * z : view;
    const mx = Math.max(0, (ww - view) / 2), my = Math.max(0, (hh - view) / 2);
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
  };
  const setZ = (z) => { const nz = Math.max(1, Math.min(MAX_ZOOM, z)); setZoom(nz); setOffset(o => clamp(o, nz)); };

  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, o: offset, z: zoom, d: null };
  };
  const move = (e) => {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) { // pinch
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!drag.current.d) drag.current.d = d / drag.current.z;
      setZ(d / drag.current.d);
      return;
    }
    setOffset(clamp({ x: drag.current.o.x + e.clientX - drag.current.x, y: drag.current.o.y + e.clientY - drag.current.y }));
  };
  const up = (e) => {
    pointers.current.delete(e.pointerId);
    drag.current = pointers.current.size ? { ...drag.current, ...[...pointers.current.values()][0], o: offset, z: zoom, d: null } : null;
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Crop your photo">
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <p className="text-lg font-extrabold text-[#0F2D6B]"><T k="aff.crop.title">Crop Your Photo</T></p>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600"><T k="aff.crop.help">Drag to move. Zoom so your face fills the circle.</T></p>

        <div className="mt-4 flex justify-center">
          <div data-testid="crop-area" className="relative touch-none select-none overflow-hidden rounded-2xl bg-slate-200"
            style={{ width: view, height: view, cursor: 'grab' }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => setZ(zoom - e.deltaY / 400)}>
            {img && (
              <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
                style={{ width: w, height: h, left: (view - w) / 2 + offset.x, top: (view - h) / 2 + offset.y }} />
            )}
            {/* The circle: everything outside it is dimmed. */}
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle closest-side, transparent 99.5%, rgba(255,255,255,0.75) 100%)' }} aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => setZ(zoom - 0.25)} aria-label="Zoom out" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 ring-1 ring-slate-200"><Minus className="h-4 w-4" aria-hidden="true" /></button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={e => setZ(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-blue-700" />
          <button type="button" onClick={() => setZ(zoom + 0.25)} aria-label="Zoom in" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 ring-1 ring-slate-200"><Plus className="h-4 w-4" aria-hidden="true" /></button>
        </div>

        {children}
        {(loadError || error) && <p className="mt-3 text-sm text-red-600" role="alert">{loadError || error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="qb qb-outline qb-md"><T k="pages.partnerportalpage.ea4788">Cancel</T></button>
          <button type="button" disabled={!img || !canUse || busy} onClick={() => onUse(cropToDataUrl(img, view, zoom, offset))} className="qb qb-blue qb-md">
            {busy ? <T k="pages.partnerportalpage.56a228">{'Saving…'}</T> : <T k="pages.partnerportalpage.3dd027">{'Use This Photo'}</T>}
          </button>
        </div>
      </div>
    </div>
  );
}
