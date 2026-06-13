/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        matrix: {
          bg: '#0a0a0a',
          card: '#111111',
          surface: '#0d1a0d',
          // Readability pass (Matrix Coder AI) — brighter primaries +
          // a more readable muted tone (previous #006600 was illegible
          // for secondary text on most monitors). Aesthetic preserved.
          green: '#00ff66',
          'green-bright': '#39ff88',
          'green-dim': '#39ff88',
          'green-muted': '#3fd07a',
          'green-faint': '#0a4e1f',
          'green-ghost': '#001a00',
          border: '#0a5c25',
          'border-bright': '#00ff66',
          blue: '#7cc4ff',
          amber: '#ffc857',
          purple: '#d27bff',
          red: '#ff6b6b',
        },
      },
      animation: {
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'matrix-fall': 'matrix-fall 3s linear infinite',
        'flicker': 'flicker 8s infinite',
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.2s ease forwards',
        'fade-in': 'fade-in 0.3s ease forwards',
        'typing-dot': 'typing-dots 1.4s ease-in-out infinite',
      },
      keyframes: {
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(0,255,65,0.4)' },
          '50%': { boxShadow: '0 0 16px rgba(0,255,65,0.8), 0 0 32px rgba(0,255,65,0.3)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'typing-dots': {
          '0%, 20%': { opacity: '0' },
          '40%': { opacity: '1' },
          '60%': { opacity: '1' },
          '80%, 100%': { opacity: '0' },
        },
      },
      boxShadow: {
        'neon-sm': '0 0 8px rgba(0,255,65,0.3)',
        'neon-md': '0 0 16px rgba(0,255,65,0.4), 0 0 32px rgba(0,255,65,0.15)',
        'neon-lg': '0 0 24px rgba(0,255,65,0.6), 0 0 48px rgba(0,255,65,0.25)',
        'neon-input': '0 0 0 1px #00ff41, 0 0 12px rgba(0,255,65,0.25)',
      },
    },
  },
  plugins: [],
};