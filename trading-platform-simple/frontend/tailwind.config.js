/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'trading': {
          'bg': {
            'primary': '#0a0a0a',
            'secondary': '#141414',
            'tertiary': '#1a1a1a'
          },
          'text': {
            'primary': '#ffffff',
            'secondary': '#a3a3a3',
            'muted': '#525252'
          },
          'accent': {
            'blue': '#3b82f6',
            'green': '#10b981',
            'red': '#ef4444'
          },
          'success': '#10b981',
          'error': '#ef4444',
          'warning': '#f59e0b',
          'neutral': {
            '700': '#374151',
            '800': '#1f2937',
            '900': '#111827'
          }
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out'
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    },
  },
  plugins: [],
};