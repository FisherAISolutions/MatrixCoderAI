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
        theme: {
          background: 'var(--theme-background)',
          surface: 'var(--theme-surface)',
          'surface-secondary': 'var(--theme-surface-secondary)',
          panel: 'var(--theme-panel-background)',
          border: 'var(--theme-panel-border)',
          active: 'var(--theme-active-state)',
          hover: 'var(--theme-hover-state)',
          muted: 'var(--theme-muted-text)',
          strong: 'var(--theme-strong-text)',
          ai: 'var(--theme-ai-accent)',
          success: 'var(--theme-success-accent)',
          preview: 'var(--theme-preview-accent)',
          terminal: 'var(--theme-terminal-accent)',
          warning: 'var(--theme-warning)',
          error: 'var(--theme-error)',
        },
        matrix: {
          bg: 'var(--matrix-bg)',
          card: 'var(--matrix-card)',
          surface: 'var(--matrix-surface)',
          // Readability pass (Matrix Coder AI) — brighter primaries +
          // a more readable muted tone (previous #006600 was illegible
          // for secondary text on most monitors). Aesthetic preserved.
          green: 'var(--matrix-green)',
          'green-bright': 'var(--matrix-green-bright)',
          'green-dim': 'var(--matrix-green-dim)',
          'green-muted': 'var(--matrix-green-muted)',
          'green-faint': 'var(--matrix-green-faint)',
          'green-ghost': 'var(--matrix-green-ghost)',
          border: 'var(--matrix-border)',
          'border-bright': 'var(--matrix-border-bright)',
          blue: 'var(--matrix-blue)',
          amber: 'var(--matrix-amber)',
          purple: 'var(--matrix-purple)',
          red: 'var(--matrix-red)',
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
          '0%, 100%': { boxShadow: '0 0 4px var(--theme-glow-secondary)' },
          '50%': { boxShadow: '0 0 16px var(--theme-glow-primary), 0 0 32px var(--theme-glow-secondary)' },
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
        'neon-sm': '0 0 8px var(--theme-glow-secondary)',
        'neon-md': '0 0 16px var(--theme-glow-primary), 0 0 32px var(--theme-glow-secondary)',
        'neon-lg': '0 0 24px var(--theme-glow-primary), 0 0 48px var(--theme-glow-secondary)',
        'neon-input': '0 0 0 1px var(--matrix-green), 0 0 12px var(--theme-glow-secondary)',
      },
    },
  },
  plugins: [],
};
