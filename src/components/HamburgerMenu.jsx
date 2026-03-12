// src/components/HamburgerMenu.jsx
// Secondary nav dropdown for admin pages (hamburger menu)

import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

function HamburgerMenu({ items }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!items || items.length === 0) return null;

  // Check if any secondary page is currently active
  const hasActiveSecondary = items.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  return (
    <div className="relative">
      {/* Hamburger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className={[
          'relative p-2.5 rounded-full font-semibold transition-all text-sm group overflow-hidden',
          hasActiveSecondary
            ? 'text-slate-900'
            : 'text-gray-300 hover:text-white',
        ].join(' ')}
        aria-label="More pages"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Background — matches TabLink styling */}
        <div
          className={`absolute inset-0 transition-all duration-500 ${
            hasActiveSecondary
              ? 'bg-white shadow-lg scale-100'
              : 'bg-white/0 group-hover:bg-white/10 scale-95 group-hover:scale-100'
          } rounded-full`}
        ></div>

        {/* Active indicator dot */}
        {hasActiveSecondary && (
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 rounded-full opacity-50 blur-sm animate-pulse"></div>
        )}

        {/* Icon */}
        <span className="relative z-10">
          {isOpen ? (
            <X className="w-5 h-5 transition-transform duration-200" />
          ) : (
            <Menu className="w-5 h-5 transition-transform duration-200" />
          )}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-[#1a1d28] rounded-lg shadow-lg border border-white/10 py-1 z-50 animate-fadeIn"
          style={{
            animation: 'hamburgerIn 150ms ease-out',
          }}
          role="menu"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/10 text-emerald-400 border-l-2 border-emerald-400'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}

      {/* Inline keyframes for the dropdown animation */}
      <style>{`
        @keyframes hamburgerIn {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default HamburgerMenu;
