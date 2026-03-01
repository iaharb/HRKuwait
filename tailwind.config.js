/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Alexandria"', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['"Alexandria"', '"Tajawal"', '"Cairo"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}