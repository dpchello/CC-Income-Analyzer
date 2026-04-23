import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', '"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['"Instrument Serif"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '8px',
        lg: '12px',
        xl: '12px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
export default config
