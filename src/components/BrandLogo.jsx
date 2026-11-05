// src/components/BrandLogo.jsx
// The brand: a gold-edged navy shield with "CW", "Cam Wiley Agency", and a line
// under it ("Allstate agent · Conyers, GA", editable in the copy editor).
// `tone`: 'dark' on the blue header, 'light' on white. The same lockup everywhere:
// one size, mark beside both lines, so it always reads as the same logo.
import { useId } from 'react';
import { T } from './SiteCopy';

export function ShieldMark({ className = 'h-8 w-8' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cwg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9DD7E" /><stop offset=".5" stopColor="#F5D061" /><stop offset="1" stopColor="#C9971C" />
        </linearGradient>
      </defs>
      <path d="M20 2.5 34.5 7.8v10.4c0 9.6-6.3 16.4-14.5 19.3C11.8 34.6 5.5 27.8 5.5 18.2V7.8z" fill={`url(#cwg${id})`} />
      <path d="M20 6 31.3 10.1v8.2c0 7.6-4.9 13-11.3 15.4-6.4-2.4-11.3-7.8-11.3-15.4v-8.2z" fill="#0F2D6B" />
      <text x="20" y="24.2" textAnchor="middle" fontFamily="'Plus Jakarta Sans', Inter, sans-serif" fontWeight="800" fontSize="11.5" fill="#F5D061" letterSpacing="-.3">CW</text>
    </svg>
  );
}

export default function BrandLogo({ tone = 'dark', className = '' }) {
  const dark = tone === 'dark';
  const name = 'text-[18px]';
  const mark = 'h-9 w-9';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ShieldMark className={`${mark} shrink-0`} />
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
