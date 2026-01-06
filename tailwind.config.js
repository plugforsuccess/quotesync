/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand - Navy (CSS token-based)
        brand: {
          DEFAULT: 'var(--brand)',
          foreground: 'var(--brand-foreground)',
          weak: 'var(--brand-weak)',
          light: 'var(--brand-light)',
          dark: 'var(--brand-dark)',
        },
        // Brand Secondary - Teal
        brand2: {
          DEFAULT: 'var(--brand-2)',
          foreground: 'var(--brand-2-foreground)',
          weak: 'var(--brand-2-weak)',
        },
        // Accent - Amber
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
          weak: 'var(--accent-weak)',
        },
        // Success - Emerald
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
          weak: 'var(--success-weak)',
        },
        // Surface
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        // Border
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        // Text
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
        },
      },
      animation: {
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg) scale(1)' },
          '50%': { transform: 'rotate(3deg) scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
    },
  },
  plugins: [],
}