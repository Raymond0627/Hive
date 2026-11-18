/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0B0E13',
          800: '#11151C',
          700: '#171C25',
          600: '#1F2631',
          500: '#2A3240',
          400: '#3A4453',
          300: '#5B6676',
          200: '#8B95A6',
          100: '#C9D1DE',
        },
        accent: {
          DEFAULT: '#F97316',
          soft: '#FB923C',
          deep: '#C2410C',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 60px -18px rgba(0, 0, 0, 0.85)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
