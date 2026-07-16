import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        paper: "#f4f6fa",
        line: "#ded8cd",
        moss: "#51675b",
        clay: "#b6654f",
        brass: "#a57d2a",
        plum: "#6f4a66",
        navy: {
          50: "#eef1f8",
          100: "#d5deef",
          200: "#adbfe0",
          300: "#8098c9",
          400: "#5673b0",
          500: "#3a5590",
          600: "#28406f",
          700: "#1b2a5b",
          800: "#14203f",
          900: "#0d152a"
        }
      },
      boxShadow: {
        panel: "0 18px 55px rgba(23, 33, 31, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
