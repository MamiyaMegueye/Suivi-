/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        snde: {
          50:  '#eef4fb',
          100: '#d7e5f4',
          200: '#aac9e8',
          300: '#7badd9',
          400: '#4f93cc',
          500: '#2d79bd',
          600: '#1f5e9b',
          700: '#194b7c',
          800: '#143a61',
          900: '#0f2a47',
          950: '#0a1b30'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
