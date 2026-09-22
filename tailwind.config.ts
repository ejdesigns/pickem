import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Blue-black surfaces (see app/globals.css for the full token list) */
        base: "#04070d",
        "bg-soft": "#070c16",
        surface: "#0a0f1a",
        "surface-2": "#0e1524",
        "surface-3": "#141d33",
        line: "#1c2740",
        /* Text */
        mist: "#f2f5fa",
        fog: "#a3aec2",
        smoke: "#66718a",
        /* Signature accent + supports */
        volt: {
          DEFAULT: "#c9f73a",
          deep: "#9dc22a",
          ink: "#0b1005",
          soft: "rgba(201,247,58,0.10)",
        },
        ice: {
          DEFAULT: "#57c7ff",
          soft: "rgba(87,199,255,0.10)",
        },
        gold: {
          DEFAULT: "#ffc24b",
          soft: "rgba(255,194,75,0.10)",
        },
        rose: {
          DEFAULT: "#ff6b6b",
          soft: "rgba(255,107,107,0.10)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 40px rgba(0,0,0,0.45)",
        "glow-volt": "0 0 24px rgba(201,247,58,0.35)",
        "glow-volt-lg": "0 0 40px rgba(201,247,58,0.45)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      maxWidth: {
        shell: "1440px",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
