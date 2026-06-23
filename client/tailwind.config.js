/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Themeable surfaces — driven by CSS variables (see index.css :root / .dark)
        bg: 'var(--c-bg)',
        bg2: 'var(--c-bg2)',
        panel: 'var(--c-panel)',
        line: 'var(--c-line)',
        'line-strong': 'var(--c-line-strong)',
        ink: 'var(--c-ink)',
        muted: 'var(--c-muted)',
        sidebar: 'var(--c-sidebar)',
        primary: { DEFAULT: 'var(--c-primary)', dark: 'var(--c-primary-dark)', soft: 'var(--c-primary-soft)' },
        secondary: '#5E8A75',
        accent: '#C9A96E',
        // Status colours (fixed across themes)
        success: { DEFAULT: '#1a8b5a', soft: 'var(--c-success-soft)' },
        warn: { DEFAULT: '#b8860b', soft: 'var(--c-warn-soft)' },
        danger: { DEFAULT: '#c0392b', soft: 'var(--c-danger-soft)' },
        neutral: { DEFAULT: '#64748b', soft: 'var(--c-bg2)' },
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
