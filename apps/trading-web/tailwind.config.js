/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../shared/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Trading-specific color palette
        trading: {
          bg: {
            primary: 'hsl(222.2 84% 4.9%)',    // Very dark blue
            secondary: 'hsl(217.2 32.6% 17.5%)', // Dark blue-gray
            tertiary: 'hsl(215 27.9% 16.9%)',   // Slightly lighter blue-gray
          },
          text: {
            primary: 'hsl(210 40% 98%)',        // Almost white
            secondary: 'hsl(215 20.2% 65.1%)',  // Light gray
            muted: 'hsl(215.4 16.3% 46.9%)',    // Muted gray
          },
          accent: {
            blue: 'hsl(217.2 91.2% 59.8%)',     // Bright blue
            purple: 'hsl(263.4 70% 50.4%)',     // Purple
          },
          success: {
            50: 'hsl(138 76% 97%)',
            500: 'hsl(142.1 76.2% 36.3%)',      // Green for profits
            600: 'hsl(142.1 70.6% 45.3%)',
          },
          danger: {
            50: 'hsl(0 93% 97%)',
            500: 'hsl(0 84.2% 60.2%)',          // Red for losses
            600: 'hsl(0 72.2% 50.6%)',
          },
          warning: {
            50: 'hsl(54 92% 95%)',
            500: 'hsl(45.4 93.4% 47.5%)',       // Amber for warnings
            600: 'hsl(43.3 96.4% 56.3%)',
          },
          neutral: {
            50: 'hsl(210 40% 98%)',
            100: 'hsl(210 40% 96%)',
            200: 'hsl(214.3 31.8% 91.4%)',
            300: 'hsl(213 27.8% 84.3%)',
            400: 'hsl(215.4 16.3% 46.9%)',
            500: 'hsl(215.3 19.3% 34.5%)',
            600: 'hsl(215.3 25% 26.7%)',
            700: 'hsl(217.2 32.6% 17.5%)',
            800: 'hsl(222.2 47.4% 11.2%)',
            900: 'hsl(222.2 84% 4.9%)',
          },
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounce 1s infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'price-flash': 'priceFlash 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        priceFlash: {
          '0%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'hsl(142.1 76.2% 36.3% / 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'trading': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        'trading-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
      },
      gridTemplateColumns: {
        'trading-layout': '250px 1fr 300px',
        'dashboard-layout': 'repeat(auto-fit, minmax(300px, 1fr))',
      },
      zIndex: {
        'modal': '1000',
        'dropdown': '100',
        'sticky': '10',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
};