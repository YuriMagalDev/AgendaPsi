import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F5F2',
        surface: '#FFFFFF',
        primary: {
          DEFAULT: '#2D6A6A',
          light: '#E8F4F4',
        },
        accent: '#C17F59',
        muted: '#7A7A7A',
        border: '#E4E0DA',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}

export default config
