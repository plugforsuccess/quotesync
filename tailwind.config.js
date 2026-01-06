/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Direction 2: Modern Professional Color Palette
      colors: {
        brand: {
          navy: '#0F172A',      // Deep Blue - main backgrounds, headers
          ocean: '#1E40AF',     // Ocean Blue - CTAs, interactive elements
          teal: '#06B6D4',      // Accent Teal - highlights, success states
          sage: '#10B981',      // Soft Sage - verification, positive actions
        },
      },
      fontFamily: {
        headline: ['Sora', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'modern': '10px',
        'card': '12px',
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