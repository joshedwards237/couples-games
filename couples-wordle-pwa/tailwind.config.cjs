const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn tokens — reference CSS vars so the palette lives in globals.css
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // Legacy named colors still referenced across Board / Keyboard / Layout / etc.
        // Kept as aliases pointing at the same brand scale.
        surface: 'hsl(var(--card))',
        accent2: 'hsl(var(--brand-sage))',
        success: 'hsl(var(--color-success))',
        warning: 'hsl(var(--color-warning))',
        keycap:  'hsl(var(--color-keycap))',
        textPrimary:   'hsl(var(--foreground))',
        textSecondary: 'hsl(var(--muted-foreground))',

        // Raw brand ramp — available if you want bg-brand-fern / text-brand-pine anywhere.
        brand: {
          dust:   'hsl(var(--brand-dust))',
          sage:   'hsl(var(--brand-sage))',
          fern:   'hsl(var(--brand-fern))',
          hunter: 'hsl(var(--brand-hunter))',
          pine:   'hsl(var(--brand-pine))',
          mist:   'hsl(var(--brand-mist))'
        }
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 6px)',
        md: 'calc(var(--radius) - 3px)',
        lg: 'var(--radius)'
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', ...fontFamily.sans],
        heading: ['"SF Pro Rounded"', '"SF Pro Display"', ...fontFamily.sans],
        handwriting: ['"Caveat"', 'cursive']
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
