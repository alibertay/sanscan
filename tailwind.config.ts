import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b1622",
          800: "#13233a",
          700: "#1b3350",
          600: "#24486f",
        },
        link: {
          DEFAULT: "#0784c3",
          dark: "#0568a0",
        },
        success: "#00a186",
        danger: "#dc3545",
        warn: "#f5a623",
        surface: "#f8f9fa",
        line: "#e6e8eb",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
