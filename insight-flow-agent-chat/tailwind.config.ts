import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        panel: 'var(--panel)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        danger: 'var(--danger)',
      },
      boxShadow: {
        panel: '0 2px 8px rgb(24 31 49 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
