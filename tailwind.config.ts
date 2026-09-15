import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#FBFBFA',
        surface: '#FFFFFF',
        border: '#EAEAEA',
        charcoal: '#111111',
        'charcoal-light': '#2F3437',
        'gray-muted': '#787774',
        'pale-red': '#FDEBEC',
        'pale-red-text': '#9F2F2D',
        'pale-blue': '#E1F3FE',
        'pale-blue-text': '#1F6C9F',
        'pale-green': '#EDF3EC',
        'pale-green-text': '#346538',
        'pale-yellow': '#FBF3DB',
        'pale-yellow-text': '#956400',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Newsreader', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
