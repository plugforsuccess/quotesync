// src/components/layout/NavBadge.jsx
// Red badge indicator for nav items (unresolved alert count).
// Hides when count is 0. Shows "9+" for 10+.

export default function NavBadge({ count }) {
  if (!count || count <= 0) return null;

  const display = count > 9 ? '9+' : String(count);

  return (
    <span className="absolute -top-1.5 -right-2.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full shadow-sm">
      {display}
    </span>
  );
}
