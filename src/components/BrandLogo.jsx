// src/components/BrandLogo.jsx
// The brand: the Cam Wiley Agency seal (small form), "Cam Wiley Agency", and a line
// under it ("Allstate agent · Conyers, GA", editable in the copy editor).
// `tone`: 'dark' on the blue header, 'light' on white. The same lockup everywhere:
// one size, mark beside both lines, so it always reads as the same logo.
import { useId } from 'react';
import { T } from './SiteCopy';

// The seal's small form (the full seal, with its olive wreath and lettering, is
// public/brand/cw-seal.png): a foil-gold ring with a serif C in gold and W in white.
export function SealMark({ className = 'h-9 w-9' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cwf${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FCEBA8" /><stop offset=".35" stopColor="#E9C25A" /><stop offset=".55" stopColor="#FFF1BF" /><stop offset="1" stopColor="#C9971C" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19.4" fill={`url(#cwf${id})`} />
      <circle cx="20" cy="20" r="17.4" fill="#0F2D6B" />
      <circle cx="20" cy="20" r="15.4" fill="none" stroke={`url(#cwf${id})`} strokeWidth=".8" />
      <g fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" textAnchor="middle">
        <text x="13.4" y="25" fontSize="13.2" fill={`url(#cwf${id})`}>C</text>
        <text x="25.4" y="25" fontSize="13.2" fill="#fff">W</text>
      </g>
    </svg>
  );
}

export default function BrandLogo({ tone = 'dark', className = '' }) {
  const dark = tone === 'dark';
  const name = 'text-[18px]';
  const mark = 'h-9 w-9';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SealMark className={`${mark} shrink-0`} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`whitespace-nowrap font-extrabold tracking-tight ${name} ${dark ? 'text-white' : 'text-[#0F2D6B]'}`}
          style={{ fontFamily: "var(--font-display, 'Plus Jakarta Sans', Inter, sans-serif)" }}>Cam Wiley Agency</span>
        <span className={`mt-1 whitespace-nowrap text-[11.5px] font-medium ${dark ? 'text-blue-200' : 'text-slate-500'}`}>
          <T k="brand.tagline">Allstate agent · Conyers, GA</T>
        </span>
      </span>
    </span>
  );
}
