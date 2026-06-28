import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f8f8",
          100: "#e5e9e7",
          300: "#aab4af",
          500: "#64716b",
          700: "#34413b",
          900: "#111815"
        },
        ledger: {
          green: "#0f7b5c",
          red: "#b4473f",
          amber: "#b7791f",
          blue: "#2f6f9f"
        }
      },
      boxShadow: {
        panel: "0 1px 2px rgb(17 24 21 / 0.06), 0 12px 32px rgb(17 24 21 / 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
