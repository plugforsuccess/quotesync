/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // PRIMARY BRAND COLOR - Deep Blue (trust, professionalism, authority)
        // Use for: Main CTAs, navigation, primary actions, brand elements
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',  // Primary brand color
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // SECONDARY BRAND COLOR - Teal (modern, fresh, trust)
        // Use for: Gradients with primary, secondary CTAs, accents
        secondary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',  // Secondary brand color
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // ACCENT COLOR - Amber/Gold (warmth, savings, highlights, featured)
        // Use for: Badges, highlights, savings indicators, featured items, special offers
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',  // Main accent color
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // SUCCESS COLOR - Emerald (positive actions, confirmations, success states)
        // Use for: Success messages, checkmarks, completion states, discounts
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',  // Main success color
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // INTERNAL APP THEME PALETTE — theme-reactive via CSS variables.
        // Each surface/text color is defined as `rgb(var(--qs-*-rgb) / <alpha-value>)`
        // so Tailwind's alpha modifiers (e.g. `bg-qs-elevated/50`) still work
        // AND the color repaints whenever [data-theme] on <html> changes.
        // The -rgb channels are redefined in index.css under each [data-theme].
        qs: {
          dark:     'rgb(var(--qs-dark-rgb) / <alpha-value>)',
          card:     'rgb(var(--qs-card-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--qs-elevated-rgb) / <alpha-value>)',
          border:   'rgb(var(--qs-border-rgb) / <alpha-value>)',
          muted:    'rgb(var(--qs-muted-rgb) / <alpha-value>)',
          subtle:   'rgb(var(--qs-subtle-rgb) / <alpha-value>)',
          dim:      'rgb(var(--qs-dim-rgb) / <alpha-value>)',
          text:     'rgb(var(--qs-text-rgb) / <alpha-value>)',
          bright:   'rgb(var(--qs-bright-rgb) / <alpha-value>)',
          // Semantic accent tokens — identical across themes by design.
          danger:   '#EF4444',
          success:  '#10B981',
          warning:  '#F59E0B',
          info:     '#3B82F6',
          purple:   '#8B5CF6',
          pink:     '#EC4899',
          cyan:     '#06B6D4',
        },
        // SEMANTIC CATEGORY COLORS - For newsroom categories
        // These provide visual distinction while staying within brand palette
        category: {
          litigation: {
            bg: '#fee2e2',      // red-100
            text: '#b91c1c',    // red-700
            border: '#fecaca',  // red-200
          },
          law: {
            bg: '#dbeafe',      // primary-100
            text: '#1e40af',    // primary-800
            border: '#bfdbfe',  // primary-200
          },
          accident: {
            bg: '#fed7aa',      // orange-200
            text: '#c2410c',    // orange-700
            border: '#fdba74',  // orange-300
          },
          data: {
            bg: '#e9d5ff',      // purple-200
            text: '#6b21a8',    // purple-800
            border: '#d8b4fe',  // purple-300
          },
          policy: {
            bg: '#d1fae5',      // success-100
            text: '#065f46',    // success-800
            border: '#a7f3d0',  // success-200
          },
        },
      },
      fontFamily: {
        // Unified font family across entire site
        sans: [
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Standardized typography scale
        'display': ['4rem', { lineHeight: '1.1', fontWeight: '900', letterSpacing: '-0.022em' }], // Hero headlines
        'h1': ['3rem', { lineHeight: '1.2', fontWeight: '800', letterSpacing: '-0.02em' }],       // Page titles
        'h2': ['2.25rem', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.018em' }],  // Section headers
        'h3': ['1.875rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '-0.014em' }],  // Subsection headers
        'h4': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],         // Card titles
        'body-lg': ['1.125rem', { lineHeight: '1.75', fontWeight: '400' }], // Large body text
        'body': ['1rem', { lineHeight: '1.625', fontWeight: '400' }],       // Default body
        'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],  // Small text
      },
      animation: {
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'float-delayed': 'float 3s ease-in-out 1.5s infinite',
        'gradient-x': 'gradient-x 3s ease infinite',
        'blob': 'blob 7s infinite',
        'shimmer': 'shimmer 2s infinite',
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
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}