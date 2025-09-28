/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        calmBlue: "#A7C7E7",
        calmGreen: "#B2D8B2",
        calmPurple: "#D1C4E9",
        calmGray: "#F5F5F5",
        textDark: "#2D2D2D",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}