/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#faf8f3',
        'bg-elev':   '#f3f0e7',
        'bg-elev-2': '#ebe7db',
        'bg-card':   '#ffffff',
        fg:        '#1a1e16',
        'fg-dim':  '#4a4f44',
        'fg-mute': '#6e7166',
        'fg-faint':'#9a9a90',
        acid:      '#2f5233',
        'acid-dim':  '#3f6844',
        'acid-deep': '#1e3621',
        warn:      '#b8502e',
        down:      '#c14a35',
        olive:     '#6a7648',
        'olive-dim': '#4a5436',
      },
      fontFamily: {
        sans:  ['"Inter Tight"', '"Inter"', 'system-ui', 'sans-serif'],
        body:  ['"Inter"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        card:  '0 4px 12px rgba(24,28,20,0.06)',
        modal: '0 30px 80px rgba(24,28,20,0.12), 0 0 0 1px rgba(47,82,51,0.08)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}
