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
        paper: "#f7f4ee",
        line: "#ded8cd",
        moss: "#51675b",
        clay: "#b6654f",
        brass: "#a57d2a",
        plum: "#6f4a66"
      },
      boxShadow: {
        panel: "0 18px 55px rgba(23, 33, 31, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
