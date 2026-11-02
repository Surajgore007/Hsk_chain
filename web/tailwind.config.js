/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#faf6f0",
        surface: "#faf6f0",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f5f1ea",
        "surface-container": "#f0ece4",
        "surface-container-high": "#eae6de",
        "surface-container-highest": "#e5e1d9",
        "on-surface": "#2e3230",
        "on-surface-variant": "#575d56",
        primary: {
          DEFAULT: "#4a7c59",
          container: "#5b936d",
          fixed: "#d8ede0",
          dim: "#8ecf9e",
          dark: "#183a21",
        },
        secondary: {
          DEFAULT: "#5e6c5b",
          container: "#e2ecdc",
          dark: "#263d27",
        },
        tertiary: {
          DEFAULT: "#8c6738",
          container: "#f5e9d3",
          dark: "#554020",
        },
        error: {
          DEFAULT: "#b83230",
          container: "#fae2e1",
          dark: "#690005",
        },
        outline: {
          DEFAULT: "#74796e",
          variant: "#dcd8cd",
        },
      },
      fontFamily: {
        headline: ["Literata", "serif"],
        display: ["Literata", "serif"],
        serif: ["Literata", "serif"],
        body: ["Nunito Sans", "sans-serif"],
        sans: ["Nunito Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(46, 50, 48, 0.04)",
        card: "0 4px 20px rgba(46, 50, 48, 0.06)",
        dropdown: "0 10px 30px rgba(46, 50, 48, 0.08)",
      },
    },
  },
  plugins: [],
};
