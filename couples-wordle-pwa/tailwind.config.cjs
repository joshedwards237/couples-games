const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f7f9ff',
        surface: '#ecf1ff',
        accent: '#8ca9ff',
        accent2: '#fca3b9',
        success: '#74cfa1',
        warning: '#f6d686',
        textPrimary: '#1f2837',
        textSecondary: '#5a6472',
        keycap: '#dde3f0'
      },
      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '24px'
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', ...fontFamily.sans],
        heading: ['"SF Pro Rounded"', '"SF Pro Display"', ...fontFamily.sans]
      }
    }
  },
  plugins: []
};
