// src/components/BrandLogo.jsx
// The brand: the Cam Wiley Agency seal (small form), "Cam Wiley Agency", and a line
// under it ("Allstate agent · Conyers, GA", editable in the copy editor).
// `tone`: 'dark' on the blue header, 'light' on white. One size everywhere, so it always
// reads as the same logo. `tagline` adds the line; only the main site header uses it
// (the menu, Rate Check steps, partner portal and agency app show seal and name only).
import { useId } from 'react';
import { T } from './SiteCopy';

// The seal's small form: the full seal's center medallion (public/brand/cw-seal.png),
// scaled up. Same double gold rings, lit navy, gold C and white W, so the small
// and full seals read as the same circle.
export function SealMark({ className = 'h-9 w-9' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cwf${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FCEBA8" /><stop offset=".28" stopColor="#E9C25A" /><stop offset=".5" stopColor="#FFF1BF" /><stop offset=".72" stopColor="#C9971C" /><stop offset="1" stopColor="#F2D27A" />
        </linearGradient>
        <radialGradient id={`cwn${id}`} cx=".35" cy=".3" r=".9">
          <stop offset="0" stopColor="#1B3E8C" /><stop offset=".7" stopColor="#0F2D6B" /><stop offset="1" stopColor="#0A2152" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19.6" fill={`url(#cwn${id})`} />
      <circle cx="20" cy="20" r="18.95" fill="none" stroke={`url(#cwf${id})`} strokeWidth=".55" />
      <circle cx="20" cy="20" r="17.55" fill="none" stroke={`url(#cwf${id})`} strokeWidth="1.5" />
      <g fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" textAnchor="middle">
        <text x="12.9" y="25.4" fontSize="15.6" fill={`url(#cwf${id})`}>C</text>
        <text x="26.3" y="25.4" fontSize="15.6" fill="#fff">W</text>
      </g>
    </svg>
  );
}

export default function BrandLogo({ tone = 'dark', tagline = false, className = '' }) {
  const dark = tone === 'dark';
  const name = 'text-[18px]';
  const mark = 'h-9 w-9';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SealMark className={`${mark} shrink-0`} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`whitespace-nowrap font-extrabold tracking-tight ${name} ${dark ? 'text-white' : 'text-[#0F2D6B]'}`}
          style={{ fontFamily: "var(--font-display, 'Plus Jakarta Sans', Inter, sans-serif)" }}>Cam Wiley Agency</span>
        {tagline && (
          <span className={`mt-1 whitespace-nowrap text-[11.5px] font-medium ${dark ? 'text-blue-200' : 'text-slate-500'}`}>
            <T k="brand.tagline">Allstate agent · Conyers, GA</T>
          </span>
        )}
      </span>
    </span>
  );
}
