/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0e1a',
          panel: '#0f1629',
          border: '#1e2d4a',
          green: '#00ff88',
          red: '#ff3d5a',
          amber: '#ffb020',
          blue: '#4a9eff',
          muted: '#4a5568',
          text: '#c8d6e5',
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
