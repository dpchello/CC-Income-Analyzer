import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#080c18',
        surface: '#111827',
        border: '#243044',
        'text-primary': '#e8f0f8',
        muted: '#8ba3be',
        amber: '#ffb020',
        green: '#10b981',
        red: '#ff3d5a',
        blue: '#4a9eff',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
    },
  },
  plugins: [],
}
export default config
